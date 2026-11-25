-- ============================================================
-- Mithara — 012: Kitchen Display (KD) status
-- Adds a kitchen-only progress marker to orders:
--     received (NULL / 'new')  ->  'preparing'  ->  'ready'
-- It is SEPARATE from orders.status on purpose, so revenue, invoices, stock
-- and the customer's account page keep working exactly as they do today.
--
-- SAFE TO RUN ON A LIVE DATABASE
--   • Purely additive: two new nullable columns + one index + one trigger.
--   • Existing rows are NOT modified. An open order with kitchen_status NULL
--     simply shows in the "New" column of the kitchen board.
--   • Idempotent: running it twice does nothing the second time.
--   • No RLS changes: "Admin can update orders" already covers the new columns.
--   • Does not touch the invoice, stock or notification triggers (they only
--     react to payment_status / status changes, which this never changes).
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- 1. Columns ---------------------------------------------------------------
alter table public.orders
  add column if not exists kitchen_status text,
  add column if not exists kitchen_status_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_kitchen_status_check'
  ) then
    alter table public.orders
      add constraint orders_kitchen_status_check
      check (kitchen_status is null or kitchen_status in ('new', 'preparing', 'ready'));
  end if;
end $$;

comment on column public.orders.kitchen_status is
  'Kitchen display progress while orders.status = ''new'': NULL/new -> preparing -> ready. Not used for revenue or invoices.';
comment on column public.orders.kitchen_status_at is
  'When kitchen_status last changed (drives the kitchen timers).';

-- 2. Keep the timestamp (and the status itself) tidy ---------------------------
--   • kitchen_status changes           -> stamp kitchen_status_at
--   • order handed over / cancelled    -> clear the kitchen status (it is no longer in the kitchen)
--   • handover undone (completed->new) -> back to 'ready' (it was cooked, just not collected)
--   • cancelled order restored         -> back to the start (NULL = "New")
create or replace function public.orders_kitchen_stamp()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status in ('completed', 'cancelled', 'pending_payment') then
      new.kitchen_status    := null;
      new.kitchen_status_at := null;
    elsif new.status = 'new' and old.status = 'completed' then
      new.kitchen_status    := 'ready';
      new.kitchen_status_at := now();
    elsif new.status = 'new' then
      new.kitchen_status    := null;
      new.kitchen_status_at := now();
    end if;
  elsif tg_op = 'UPDATE' and new.kitchen_status is distinct from old.kitchen_status then
    new.kitchen_status_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_kitchen_stamp on public.orders;
create trigger trg_orders_kitchen_stamp
  before update on public.orders
  for each row execute function public.orders_kitchen_stamp();

-- 3. Fast "open orders" lookup for the kitchen board ------------------------------
create index if not exists idx_orders_kitchen_open
  on public.orders (created_at)
  where status = 'new';

-- 4. Realtime: `orders` is already published (migration 005), nothing to add.
