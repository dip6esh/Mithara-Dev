-- Rollback for 016_order_item_sequence.sql
drop index if exists public.order_items_order_seq_idx;
alter table public.order_items drop column if exists seq;
