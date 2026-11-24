-- ============================================================
-- Mithara — 009: Low-stock alert number per menu item
-- Lets the admin choose, per item, how many portions must be LEFT
-- before the dashboard starts warning (with its own sound).
-- Example: daily stock limit 15, alert number 10 -> warning starts
-- when 10 or fewer are left.
--
-- SAFE TO RUN ON A LIVE DATABASE
--   • Purely additive: one new nullable column, nothing dropped or retyped.
--   • Existing rows stay valid and are NOT modified (empty = no alert).
--   • Idempotent: running it twice does nothing the second time.
--   • No RLS / policy / trigger changes. Existing policies on
--     public.products already cover the new column.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

alter table public.products
  add column if not exists low_stock_alert_at int;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_low_stock_alert_at_check'
  ) then
    alter table public.products
      add constraint products_low_stock_alert_at_check
      check (low_stock_alert_at is null or low_stock_alert_at >= 0);
  end if;
end $$;

comment on column public.products.low_stock_alert_at is
  'Warn the admin when stock_remaining is at or below this number. NULL = no alert.';

-- Push product changes to the open admin pages the moment they happen
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
     ) then
    alter publication supabase_realtime add table public.products;
  end if;
end $$;
