-- ============================================================
-- Rollback for 014_staff_roles.sql
-- Removes everything 014 added and puts issue_missing_invoices back as migration 008 had it.
-- Staff logins stop working in the admin (they stay as accounts in Supabase Auth, untouched).
-- The Owner and all existing admin rules are not affected.
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

drop trigger if exists trg_00_orders_staff_guard on public.orders;
drop function if exists public.orders_staff_guard();

drop policy if exists "Staff view orders"                       on public.orders;
drop policy if exists "Staff update orders"                     on public.orders;
drop policy if exists "Staff view order items"                  on public.order_items;
drop policy if exists "Manager full access to products"         on public.products;
drop policy if exists "Manager full access to product variants" on public.product_variants;
drop policy if exists "Manager reads customer profiles"         on public.customer_profiles;
drop policy if exists "Manager reads customer addresses"        on public.customer_addresses;
drop policy if exists "Manager reads notifications"             on public.admin_notifications;
drop policy if exists "Manager updates notifications"           on public.admin_notifications;
drop policy if exists "Manager deletes notifications"           on public.admin_notifications;
drop policy if exists "Staff read invoices"                     on public.invoices;

-- Back to the admin-only version from migration 008.
create or replace function public.issue_missing_invoices()
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_count int := 0;
begin
  if auth.uid() is not null and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
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

drop policy if exists "Owner manages staff"   on public.staff_members;
drop policy if exists "Staff read own record" on public.staff_members;
drop table  if exists public.staff_members;

drop function if exists public.has_staff_role(text[]);
drop function if exists public.staff_roles();
drop function if exists public.is_owner();
