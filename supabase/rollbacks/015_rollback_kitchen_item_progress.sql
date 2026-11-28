-- Rollback for 015_kitchen_item_progress.sql
-- Removes the item tick column and its staff rules. The kitchen board goes back to one button per order.
drop trigger  if exists trg_00_order_items_staff_guard on public.order_items;
drop function if exists public.order_items_staff_guard();
drop policy   if exists "Staff mark items prepared" on public.order_items;
alter table public.order_items drop column if exists prepared_at;
-- (The live-updates subscription for order_items is harmless to leave in place.)
