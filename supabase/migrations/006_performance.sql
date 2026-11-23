-- ============================================================
-- Mithara — Performance
--   1. Indexes on the columns every dashboard query filters/sorts/joins on
--      (Postgres does not index foreign keys automatically).
--   2. Row-level-security policies rewritten so auth.uid() / auth.jwt() are
--      evaluated once per query instead of once per row. Same rules as before.
-- Safe to run more than once, on top of 001-005.
-- ============================================================

-- 1. Indexes ------------------------------------------------------------------
create index if not exists idx_orders_customer_created
  on public.orders (customer_id, created_at desc);
create index if not exists idx_orders_created_at
  on public.orders (created_at desc);
create index if not exists idx_orders_status
  on public.orders (status);
create index if not exists idx_order_items_order_id
  on public.order_items (order_id);
create index if not exists idx_customer_addresses_customer
  on public.customer_addresses (customer_id);

-- 2. RLS init-plan optimisation (behaviour unchanged) ---------------------------
drop policy if exists "Customers manage own profile" on public.customer_profiles;
create policy "Customers manage own profile" on public.customer_profiles for all to authenticated
  using ((select auth.uid()) = id or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.uid()) = id or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Customers manage own addresses" on public.customer_addresses;
create policy "Customers manage own addresses" on public.customer_addresses for all to authenticated
  using ((select auth.uid()) = customer_id or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.uid()) = customer_id or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Customers and admin view orders" on public.orders;
create policy "Customers and admin view orders" on public.orders for select to authenticated, anon
  using ((select auth.uid()) = customer_id or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "View order items" on public.order_items;
create policy "View order items" on public.order_items for select to authenticated, anon
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (o.customer_id = (select auth.uid()) or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
    )
  );
