-- ============================================================
-- Mithara — 014: Staff roles (Manager, Counter, Kitchen, Delivery)
--
-- WHAT THIS ADDS
--   • public.staff_members: one row per staff login, with a LIST of roles
--     (a person can be e.g. counter + delivery). The Owner assigns these from
--     Admin → Staff. Changes and "disable" take effect immediately.
--   • Helper functions the access rules use.
--   • NEW access rules for the staff roles, added NEXT TO the existing admin rules.
--   • A guard on order updates so each role can only change what its job needs
--     (e.g. Kitchen can only move the kitchen progress, Counter cannot cancel).
--
-- THE OWNER IS UNCHANGED
--   The Owner is still the account with app_metadata.role = 'admin'. Every existing
--   rule keeps working exactly as before, so nothing changes for the Owner.
--   Staff accounts are created from Admin → Staff (never as 'admin').
--
-- SAFE TO RUN ON A LIVE DATABASE
--   • Additive: one new table, new functions, new policies, one new trigger.
--   • No existing policy is dropped or changed. Postgres combines policies with OR,
--     so these only GRANT staff access; they cannot take any away from the Owner.
--   • The one function that is replaced (issue_missing_invoices) behaves identically
--     for the Owner and the SQL editor; it additionally allows Manager / Counter.
--   • Idempotent: running it twice does nothing the second time.
--   • Rollback: supabase/rollbacks/014_rollback_staff_roles.sql
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================


-- 1. Staff table -------------------------------------------------------------
create table if not exists public.staff_members (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text        not null,
  -- What the person types to sign in: a username (e.g. "ravi") or an email address.
  login_name   text        not null,
  roles        text[]      not null default '{}',
  active       boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint staff_members_roles_valid
    check (roles <@ array['manager', 'counter', 'kitchen', 'delivery']::text[])
);

create unique index if not exists staff_members_login_name_key
  on public.staff_members (lower(login_name));

drop trigger if exists trg_staff_members_updated_at on public.staff_members;
create trigger trg_staff_members_updated_at
  before update on public.staff_members
  for each row execute function public.set_updated_at();

alter table public.staff_members enable row level security;


-- 2. Helper functions ---------------------------------------------------------
-- Is the caller the Owner? (same test every existing admin rule uses)
create or replace function public.is_owner()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

-- The caller's staff roles. Empty for customers, the Owner and disabled staff.
-- SECURITY DEFINER so it can read staff_members without opening that table up.
create or replace function public.staff_roles()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.roles from public.staff_members s where s.user_id = auth.uid() and s.active),
    '{}'::text[]
  )
$$;

-- True for the Owner, or for staff holding ANY of the listed roles.
create or replace function public.has_staff_role(variadic p_roles text[])
returns boolean language sql stable as $$
  select public.is_owner() or (public.staff_roles() && p_roles)
$$;

grant execute on function public.is_owner()              to authenticated;
grant execute on function public.staff_roles()           to authenticated;
grant execute on function public.has_staff_role(text[])  to authenticated;


-- 3. Who can read / change the staff list ------------------------------------
drop policy if exists "Owner manages staff" on public.staff_members;
create policy "Owner manages staff" on public.staff_members for all to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- A staff member can read ONLY their own row (that is how the app learns their roles).
drop policy if exists "Staff read own record" on public.staff_members;
create policy "Staff read own record" on public.staff_members for select to authenticated
  using (user_id = (select auth.uid()));


-- 4. Orders -------------------------------------------------------------------
--   Manager, Counter : all orders
--   Kitchen          : open orders only (status 'new')
--   Delivery         : delivery orders that are open, plus those handed over in the last 24h
drop policy if exists "Staff view orders" on public.orders;
create policy "Staff view orders" on public.orders for select to authenticated
  using (
    (select public.staff_roles()) && array['manager', 'counter']
    or ((select public.staff_roles()) @> array['kitchen'] and status = 'new')
    or (
      (select public.staff_roles()) @> array['delivery']
      and delivery_type = 'delivery'
      and (status = 'new' or (status = 'completed' and updated_at > now() - interval '24 hours'))
    )
  );

drop policy if exists "Staff update orders" on public.orders;
create policy "Staff update orders" on public.orders for update to authenticated
  using (
    (select public.staff_roles()) && array['manager', 'counter']
    or ((select public.staff_roles()) @> array['kitchen'] and status = 'new')
    or (
      (select public.staff_roles()) @> array['delivery']
      and delivery_type = 'delivery'
      and status = 'new'
    )
  )
  with check (
    (select public.staff_roles()) && array['manager', 'counter', 'kitchen', 'delivery']
  );

-- Order items follow the orders the person can already see.
drop policy if exists "Staff view order items" on public.order_items;
create policy "Staff view order items" on public.order_items for select to authenticated
  using (
    cardinality((select public.staff_roles())) > 0
    and exists (select 1 from public.orders o where o.id = order_items.order_id)
  );
-- (Creating manual orders already works: "Insert order items" / order insert rules allow it.)


-- 5. What a role may CHANGE on an order -------------------------------------
-- Row rules can't limit columns, so this guard does. It runs first (name sorts before the
-- other order triggers), so it sees exactly what the app asked for.
--   Manager  : everything (Owner too)
--   Counter  : status / payment / notes / kitchen mark — but NOT cancel, restore,
--              "back to received" or "undo payment" (those need a Manager)
--   Kitchen  : kitchen progress only
--   Delivery : mark handed over + record cash/UPI collected
create or replace function public.orders_staff_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  r       text[];
  allowed text[] := '{}';
  changed text[];
  k       text;
begin
  -- Owner, the SQL editor, background jobs: no limits. (auth.uid() is null for those.)
  if auth.uid() is null or public.is_owner() then
    return new;
  end if;

  r := public.staff_roles();
  -- Not a staff member (e.g. a customer cancelling their own unpaid order): unchanged behaviour.
  if cardinality(r) = 0 then
    return new;
  end if;
  if r @> array['manager'] then
    return new;
  end if;

  if r @> array['counter'] then
    allowed := allowed || array[
      'status', 'payment_status', 'payment_method', 'paid_via', 'paid_at', 'admin_notes',
      'kitchen_status', 'kitchen_status_at', 'alert_seen_at', 'updated_at'];
  end if;
  if r @> array['kitchen'] then
    allowed := allowed || array['kitchen_status', 'kitchen_status_at', 'alert_seen_at', 'updated_at'];
  end if;
  if r @> array['delivery'] then
    allowed := allowed || array['status', 'payment_status', 'payment_method', 'paid_via', 'paid_at', 'updated_at'];
  end if;

  select coalesce(array_agg(n.key), '{}'::text[]) into changed
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o on o.key = n.key
   where n.value is distinct from o.value;

  foreach k in array changed loop
    if not (k = any (allowed)) then
      raise exception 'Your role is not allowed to change "%" on an order.', k
        using errcode = '42501';
    end if;
  end loop;

  if new.status is distinct from old.status then
    if new.status = 'cancelled' or old.status in ('cancelled', 'completed') then
      raise exception 'Only a manager can cancel, restore or undo an order.'
        using errcode = '42501';
    end if;
    if not (old.status = 'new' and new.status = 'completed') then
      raise exception 'Your role can only move an order from received to handed over.'
        using errcode = '42501';
    end if;
  end if;

  if old.payment_status = 'paid' and new.payment_status is distinct from 'paid' then
    raise exception 'Only a manager can undo a payment.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_00_orders_staff_guard on public.orders;
create trigger trg_00_orders_staff_guard
  before update on public.orders
  for each row execute function public.orders_staff_guard();


-- 6. Manager: menu, customers, notifications, invoices ------------------------
drop policy if exists "Manager full access to products" on public.products;
create policy "Manager full access to products" on public.products for all to authenticated
  using ((select public.staff_roles()) @> array['manager'])
  with check ((select public.staff_roles()) @> array['manager']);

drop policy if exists "Manager full access to product variants" on public.product_variants;
create policy "Manager full access to product variants" on public.product_variants for all to authenticated
  using ((select public.staff_roles()) @> array['manager'])
  with check ((select public.staff_roles()) @> array['manager']);

drop policy if exists "Manager reads customer profiles" on public.customer_profiles;
create policy "Manager reads customer profiles" on public.customer_profiles for select to authenticated
  using ((select public.staff_roles()) @> array['manager']);

drop policy if exists "Manager reads customer addresses" on public.customer_addresses;
create policy "Manager reads customer addresses" on public.customer_addresses for select to authenticated
  using ((select public.staff_roles()) @> array['manager']);

drop policy if exists "Manager reads notifications" on public.admin_notifications;
create policy "Manager reads notifications" on public.admin_notifications for select to authenticated
  using ((select public.staff_roles()) @> array['manager']);

drop policy if exists "Manager updates notifications" on public.admin_notifications;
create policy "Manager updates notifications" on public.admin_notifications for update to authenticated
  using ((select public.staff_roles()) @> array['manager'])
  with check ((select public.staff_roles()) @> array['manager']);

drop policy if exists "Manager deletes notifications" on public.admin_notifications;
create policy "Manager deletes notifications" on public.admin_notifications for delete to authenticated
  using ((select public.staff_roles()) @> array['manager']);

-- Invoices: Manager and Counter can read all (the Counter prints bills).
drop policy if exists "Staff read invoices" on public.invoices;
create policy "Staff read invoices" on public.invoices for select to authenticated
  using ((select public.staff_roles()) && array['manager', 'counter']);


-- 7. Invoice catch-up: also allow Manager / Counter ---------------------------
-- Same function as migration 008; only the "who may call it" check is widened.
create or replace function public.issue_missing_invoices()
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_count int := 0;
begin
  -- Callable from the SQL editor (no JWT), by the Owner, or by a Manager / Counter; never by customers.
  if auth.uid() is not null
     and not public.is_owner()
     and not (public.staff_roles() && array['manager', 'counter']) then
    raise exception 'Only an admin can do this.' using errcode = 'P0001';
  end if;

  for r in
    select id from orders o
     where o.payment_status = 'paid' and o.status <> 'cancelled'
       and not exists (select 1 from invoices i where i.order_id = o.id and i.status = 'issued')
     order by coalesce(o.paid_at, o.updated_at), o.created_at
  loop
    if public.create_invoice_for_order(r.id) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
grant execute on function public.issue_missing_invoices() to authenticated;
