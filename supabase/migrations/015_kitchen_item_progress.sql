-- ============================================================
-- Mithara — 015: Kitchen item-by-item progress
--
-- The kitchen board can now tick off each item of an order as it is prepared, and the
-- "Food ready" button switches on once every item is ticked.
--
-- WHAT THIS ADDS
--   • order_items.prepared_at: when that item was ticked off (empty = not done yet).
--   • Live updates for ticks, so two kitchen screens stay in step.
--   • If staff roles (migration 014) are installed: lets Kitchen / Counter / Manager staff tick
--     items, and ONLY tick them (they still cannot change names, quantities or prices).
--
-- SAFE TO RUN ON A LIVE DATABASE
--   • One new empty column; nothing existing is changed. Idempotent. Run it after 014
--     (if 014 is not installed yet it still works for the Owner and says so).
--   • Rollback: supabase/rollbacks/015_rollback_kitchen_item_progress.sql
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

alter table public.order_items add column if not exists prepared_at timestamptz;

-- Live ticks between kitchen screens.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_items'
     ) then
    alter publication supabase_realtime add table public.order_items;
  end if;
end $$;

-- Staff access (only when migration 014 is installed).
do $outer$
begin
  if to_regprocedure('public.staff_roles()') is null then
    raise notice 'Staff roles (migration 014) are not installed: only the Owner can tick items until they are.';
    return;
  end if;

  -- Kitchen, Counter and Manager may update the items of orders they can already see...
  execute 'drop policy if exists "Staff mark items prepared" on public.order_items';
  execute $p$
    create policy "Staff mark items prepared" on public.order_items for update to authenticated
      using (
        (select public.staff_roles()) && array['manager', 'counter', 'kitchen']
        and exists (select 1 from public.orders o where o.id = order_items.order_id)
      )
      with check (
        (select public.staff_roles()) && array['manager', 'counter', 'kitchen']
      )
  $p$;

  -- ...but only the tick itself. Row rules can't limit columns, so this guard does.
  execute $f$
    create or replace function public.order_items_staff_guard()
    returns trigger language plpgsql set search_path = public as $g$
    declare
      changed text[];
    begin
      -- Owner, SQL editor, background jobs: no limits.
      if auth.uid() is null or public.is_owner() then
        return new;
      end if;
      -- Not a staff member: unchanged behaviour (the row rules already say no).
      if cardinality(public.staff_roles()) = 0 then
        return new;
      end if;

      select coalesce(array_agg(n.key), '{}'::text[]) into changed
        from jsonb_each(to_jsonb(new)) n
        join jsonb_each(to_jsonb(old)) o on o.key = n.key
       where n.value is distinct from o.value;

      if exists (select 1 from unnest(changed) c where c <> 'prepared_at') then
        raise exception 'Staff can only tick items off as prepared.' using errcode = '42501';
      end if;
      return new;
    end;
    $g$
  $f$;

  execute 'drop trigger if exists trg_00_order_items_staff_guard on public.order_items';
  execute 'create trigger trg_00_order_items_staff_guard before update on public.order_items
             for each row execute function public.order_items_staff_guard()';
end
$outer$;
