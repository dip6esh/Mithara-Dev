-- ============================================================
-- Mithara — ROLLBACK of 012: Kitchen Display status
-- Removes everything migration 012 added. Nothing else is touched:
-- order status, payments, totals, invoices and stock are unaffected.
--
-- ORDER OF OPERATIONS (important)
--   1. Remove the Kitchen code from the app and deploy it first:
--        - delete  src/routes/admin/kitchen.tsx
--        - delete  src/hooks/useKitchenOrders.ts
--        - delete  src/lib/kitchen.ts
--        - AdminLayout.tsx : remove the ChefHat import + the "Kitchen" nav item
--        - dashboard.tsx   : remove the ChefHat + kitchenStatusOf imports, the
--                            kitchenCount helper and the "In the kitchen" <Link> strip
--        - types.ts        : remove KitchenStatus + the kitchen_status* fields on Order
--   2. THEN run this file in: Supabase Dashboard → SQL Editor → New Query → Run
--      (running it while the old code is still live makes kitchen taps show an error)
--
-- WHAT YOU LOSE: only the kitchen progress (New / Preparing / Ready) and its
-- timestamps. This cannot be restored afterwards except by re-running 012
-- (orders would then start again from "New").
--
-- Safe to run more than once.
-- ============================================================

drop trigger  if exists trg_orders_kitchen_stamp on public.orders;
drop function if exists public.orders_kitchen_stamp();
drop index    if exists public.idx_orders_kitchen_open;

alter table public.orders
  drop constraint if exists orders_kitchen_status_check,
  drop column     if exists kitchen_status,
  drop column     if exists kitchen_status_at;
