-- ============================================================
-- Mithara — 013: Team-wide "seen" flag for the new-order pop-up
-- When anyone on the team acknowledges an order (Got it / Dismiss / View orders,
-- or a tap on the Kitchen board), it is stamped here. Every other open admin
-- screen then stops showing the pop-up and ringing the bell for that order,
-- on any browser or device.
--
-- SAFE TO RUN ON A LIVE DATABASE
--   • Purely additive: one new nullable column. Nothing dropped or retyped.
--   • Existing rows are NOT modified. Orders already waiting will show the pop-up
--     ONE more time (to whoever opens admin first); acknowledging it clears it for everyone.
--   • Idempotent: running it twice does nothing the second time.
--   • No RLS / trigger changes ("Admin can update orders" already covers the column).
--     Does not affect revenue, invoices, stock or notifications.
--   • Does not require migration 012, and 012 does not require this.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

alter table public.orders
  add column if not exists alert_seen_at timestamptz;

comment on column public.orders.alert_seen_at is
  'Set when a team member acknowledged the new-order pop-up for this order. NULL = nobody has seen it yet.';
