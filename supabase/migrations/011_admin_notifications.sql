-- ============================================================
-- Mithara — 011: Admin notification centre
--
-- A permanent inbox for the admin bell (like Facebook / Instagram):
-- every new order and every stock warning is written to a table by the
-- database itself, so nothing is lost if the admin tab was closed, the
-- phone was asleep, or a toast disappeared before it was read.
--
--   • New order        -> when an order becomes "new" (paid online or placed)
--   • Running low      -> stock_remaining falls to the item's alert number
--   • Out of stock     -> stock_remaining reaches 0 (item has an alert number)
--   Stock rules match the dashboard exactly (see src/lib/stockAlert.ts).
--   An alert fires once per crossing, not on every order afterwards.
--
-- SAFE TO RUN ON A LIVE DATABASE
--   • Purely additive: one new table, new functions, new triggers.
--     No existing table, column, policy or function is changed.
--   • The notify triggers swallow their own errors, so a problem here
--     can never block an order or a stock update.
--   • Idempotent: running it twice does nothing the second time.
--   • Notifications older than 60 days are removed automatically.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- 1. Table ---------------------------------------------------------------------
create table if not exists public.admin_notifications (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('new_order', 'low_stock', 'out_of_stock')),
  title      text not null,
  body       text,
  ref_id     uuid,                        -- the order or menu item it is about
  created_at timestamptz not null default now(),
  read_at    timestamptz                  -- NULL = unread
);

create index if not exists admin_notifications_created_idx
  on public.admin_notifications (created_at desc);
create index if not exists admin_notifications_unread_idx
  on public.admin_notifications (created_at desc) where read_at is null;

alter table public.admin_notifications enable row level security;

-- Only the admin can read / mark-as-read / delete. Nobody inserts from the browser:
-- rows are written by the triggers below (security definer).
drop policy if exists "Admin reads notifications" on public.admin_notifications;
create policy "Admin reads notifications" on public.admin_notifications for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admin updates notifications" on public.admin_notifications;
create policy "Admin updates notifications" on public.admin_notifications for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admin deletes notifications" on public.admin_notifications;
create policy "Admin deletes notifications" on public.admin_notifications for delete to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 2. Helper that writes one notification (and tidies old ones) -------------------
create or replace function public.notify_admin(p_kind text, p_title text, p_body text, p_ref uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into admin_notifications (kind, title, body, ref_id)
  values (p_kind, p_title, p_body, p_ref);
  delete from admin_notifications where created_at < now() - interval '60 days';
exception when others then
  null;  -- never let a notification problem block an order or a stock change
end;
$$;

-- Not callable from the browser: otherwise anyone could spam the admin's bell.
revoke all on function public.notify_admin(text, text, text, uuid) from public, anon, authenticated;

-- 3. New orders -----------------------------------------------------------------
create or replace function public.trg_notify_new_order()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- "new" = order received. Online orders only count once payment goes through
  -- (they start as pending_payment and are hidden from the kitchen until then).
  if new.status = 'new' and (tg_op = 'INSERT' or old.status is distinct from 'new') then
    perform public.notify_admin(
      'new_order',
      'New order ' || new.order_number,
      new.customer_name || ' · ₹' || new.total_inr::text || ' · '
        || case when new.delivery_type = 'pickup' then 'Pickup' else 'Delivery' end,
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_notify_new on public.orders;
create trigger trg_orders_notify_new
  after insert or update of status on public.orders
  for each row execute function public.trg_notify_new_order();

-- 4. Low / out of stock -----------------------------------------------------------
-- Same rule as the dashboard: no daily limit or no alert number = no alert.
create or replace function public.stock_alert_level(p_status text, p_daily int, p_left int, p_alert int)
returns text
language sql immutable as $$
  select case
    when p_status in ('deleted', 'hidden', 'draft') then null
    when p_daily is null or p_alert is null then null
    when coalesce(p_left, p_daily) > p_alert then null
    when coalesce(p_left, p_daily) <= 0 then 'out'
    else 'low'
  end;
$$;

create or replace function public.trg_notify_stock()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old  text;
  v_new  text;
  v_left int;
begin
  v_old := public.stock_alert_level(old.status, old.daily_stock, old.stock_remaining, old.low_stock_alert_at);
  v_new := public.stock_alert_level(new.status, new.daily_stock, new.stock_remaining, new.low_stock_alert_at);

  -- Only when it gets worse: nothing -> low, nothing -> out, low -> out.
  if v_new is null or v_new is not distinct from v_old then return new; end if;
  if v_new = 'low' and v_old = 'out' then return new; end if;

  v_left := greatest(0, coalesce(new.stock_remaining, new.daily_stock));
  if v_new = 'out' then
    perform public.notify_admin(
      'out_of_stock',
      new.name || ' is out of stock',
      'Sold out for today. Restock it in Menu Control.',
      new.id
    );
  else
    perform public.notify_admin(
      'low_stock',
      new.name || ' is running low',
      v_left::text || ' left today (alert set at ' || new.low_stock_alert_at::text || ').',
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_products_notify_stock on public.products;
create trigger trg_products_notify_stock
  after update of stock_remaining, daily_stock, low_stock_alert_at, status on public.products
  for each row execute function public.trg_notify_stock();

-- 5. Push new notifications to the open admin pages instantly -----------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'admin_notifications'
     ) then
    alter publication supabase_realtime add table public.admin_notifications;
  end if;
end $$;
