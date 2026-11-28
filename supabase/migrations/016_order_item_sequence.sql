-- ============================================================
-- Mithara — 016: Keep order items in the order they were added
--
-- WHY
--   The database does not remember the order of rows. Whenever an item row is updated (for example when the
--   kitchen ticks it off), it comes back at the END of the list, so ticked items jumped below the others.
--   This gives every item a fixed position number (seq) so screens can always show them the same way.
--
-- SAFE TO RUN ON A LIVE DATABASE
--   • Adds one column; existing rows are numbered in the order the database currently returns them.
--   • New items are numbered automatically; nothing in the app has to send it.
--   • Idempotent. Rollback: supabase/rollbacks/016_rollback_order_item_sequence.sql
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

alter table public.order_items
  add column if not exists seq bigint generated always as identity;

create index if not exists order_items_order_seq_idx on public.order_items (order_id, seq);
