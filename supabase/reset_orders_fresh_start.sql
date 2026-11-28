-- ============================================================
-- Mithara: reset orders, invoices and notifications (fresh start for testing)
--
-- WARNING: this permanently deletes all orders, order items (including the kitchen
-- tick-offs), invoices and admin notifications. Export anything you need first
-- (Supabase > Table Editor > Export to CSV).
--
-- Untouched: products, menu, settings, customer accounts, saved addresses, enquiries,
-- subscribers, STAFF logins (Admin > Staff) and the Owner login.
--
-- Customers' order history disappears with the orders (their accounts stay).
-- Run in: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

begin;

-- 1. Invoices first. invoices.order_id is "on delete set null", so deleting orders
--    alone would leave orphan invoices behind.
delete from public.invoices;

-- 2. Restart invoice numbering at MTH/xx-xx/0001 (and TEST/xx-xx/0001)
delete from public.invoice_counters;

-- 3. Orders. order_items (and their kitchen ticks) are removed automatically
--    (on delete cascade).
delete from public.orders;

-- 4. Notifications (new-order, low-stock, out-of-stock)
delete from public.admin_notifications;

-- 5. Restart order numbers at MTH-1001 (optional, remove this line to keep counting up)
alter sequence order_number_seq restart with 1001;

-- 5b. Restart the item position numbers (only if update 016 is installed; skipped otherwise)
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'order_items' and column_name = 'seq'
  ) then
    alter table public.order_items alter column seq restart with 1;
  end if;
end $$;

-- 6. Refill today's daily stock (orders had used it up)
update public.products
   set stock_remaining = daily_stock,
       stock_reset_at  = now()
 where daily_stock is not null;

commit;
