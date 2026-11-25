-- ============================================================
-- Mithara — ROLLBACK of 013: team-wide "seen" flag
-- Removes the alert_seen_at column. Orders, payments, invoices and stock are untouched.
-- The app keeps working without it (it falls back to remembering "seen" per browser),
-- so the app code does not need to change first.
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run. Safe to run more than once.
-- ============================================================
alter table public.orders drop column if exists alert_seen_at;
