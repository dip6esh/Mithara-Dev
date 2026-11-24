-- ============================================================
-- Mithara — 010: Orders now use up the daily stock
--
-- Until now "daily stock" was only a number typed in Menu Control:
-- placing an order never lowered it. This migration makes it real.
--
--   • Placing an order takes the ordered quantity off the item's
--     remaining stock (a database trigger, so it cannot be skipped).
--   • If an order asks for more than what is left, it is refused with
--     a clear message ("only 3 left today") and nothing is saved.
--   • Cancelling an order gives its stock back (same-day orders only).
--   • Stock refills to the daily limit every day at midnight IST.
--
-- Unit: 1 quantity = 1 portion, whatever the pack size.
-- Items with NO daily stock limit (empty = unlimited) are never touched.
--
-- SAFE TO RUN ON A LIVE DATABASE
--   • No table or column is changed, dropped or retyped (only functions
--     and triggers are added). place_order itself is NOT modified.
--   • Idempotent: running it twice does nothing the second time.
--   • Orders already placed before this migration are not counted.
--     To start today's count fresh, re-save the item's daily stock in
--     Menu Control.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- 1. Which menu item does an order line belong to? -------------------------
create or replace function public.stock_product_for_name(p_name text)
returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select pv.product_id
       from product_variants pv
      where lower(btrim(pv.item_name)) = lower(btrim(p_name))
        and pv.product_id is not null
      limit 1),
    (select p.id
       from products p
      where lower(btrim(p.name)) = lower(btrim(p_name))
        and p.status <> 'deleted'
      order by (p.status = 'active') desc, p.created_at
      limit 1)
  );
$$;

-- 2. Taking stock when an order line is saved ---------------------------------
create or replace function public.trg_order_item_take_stock()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pid     uuid;
  v_p       record;
  v_new_day boolean;
  v_left    int;
begin
  v_pid := coalesce(new.product_id, public.stock_product_for_name(new.name));
  if v_pid is null then
    return new;                          -- not a tracked menu item
  end if;

  -- Lock the item so two customers ordering at once cannot both take the last portion.
  select id, name, daily_stock, stock_remaining, stock_reset_at
    into v_p
    from products
   where id = v_pid
   for update;
  if not found or v_p.daily_stock is null then
    return new;                          -- unlimited item
  end if;

  v_new_day := v_p.stock_reset_at is null
            or (v_p.stock_reset_at at time zone 'Asia/Kolkata')::date
               < (now() at time zone 'Asia/Kolkata')::date;
  v_left := case when v_new_day then v_p.daily_stock
                 else coalesce(v_p.stock_remaining, v_p.daily_stock) end;

  if new.qty > v_left then
    if v_left <= 0 then
      raise exception 'Sorry, "%" is sold out for today.', v_p.name using errcode = 'P0001';
    end if;
    raise exception 'Sorry, only % of "%" left today. Please lower the quantity.', v_left, v_p.name
      using errcode = 'P0001';
  end if;

  update products
     set stock_remaining = v_left - new.qty,
         stock_reset_at  = case when v_new_day then now() else stock_reset_at end
   where id = v_pid;

  if new.product_id is null then
    new.product_id := v_pid;             -- remember it so a cancel gives back the right item
  end if;
  return new;
end;
$$;

drop trigger if exists trg_order_items_take_stock on public.order_items;
create trigger trg_order_items_take_stock
  before insert on public.order_items
  for each row execute function public.trg_order_item_take_stock();

-- 3. Giving stock back when an order is cancelled (and taking it again if un-cancelled) --
create or replace function public.trg_order_stock_on_status()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r      record;
  v_pid  uuid;
begin
  -- Yesterday's orders never touch today's stock.
  if (new.created_at at time zone 'Asia/Kolkata')::date
     <> (now() at time zone 'Asia/Kolkata')::date then
    return new;
  end if;

  if old.status is distinct from 'cancelled' and new.status = 'cancelled' then
    for r in select product_id, name, qty from order_items where order_id = new.id loop
      v_pid := coalesce(r.product_id, public.stock_product_for_name(r.name));
      if v_pid is not null then
        update products
           set stock_remaining = least(daily_stock, coalesce(stock_remaining, daily_stock) + r.qty)
         where id = v_pid and daily_stock is not null;
      end if;
    end loop;
  elsif old.status = 'cancelled' and new.status is distinct from 'cancelled' then
    for r in select product_id, name, qty from order_items where order_id = new.id loop
      v_pid := coalesce(r.product_id, public.stock_product_for_name(r.name));
      if v_pid is not null then
        update products
           set stock_remaining = greatest(0, coalesce(stock_remaining, daily_stock) - r.qty)
         where id = v_pid and daily_stock is not null;
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_stock_on_status on public.orders;
create trigger trg_orders_stock_on_status
  after update of status on public.orders
  for each row
  when (old.status is distinct from new.status)
  execute function public.trg_order_stock_on_status();

-- 4. Daily refill (midnight IST) ----------------------------------------------
-- Called by the admin screens whenever they load, so numbers are right the moment the day changes.
-- The order trigger above also refills lazily on the first order of a new day.
create or replace function public.refresh_daily_stock()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  update products
     set stock_remaining = daily_stock,
         stock_reset_at  = now()
   where daily_stock is not null
     and status <> 'deleted'
     and (stock_reset_at is null
          or (stock_reset_at at time zone 'Asia/Kolkata')::date
             < (now() at time zone 'Asia/Kolkata')::date);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.refresh_daily_stock() from public, anon;
grant execute on function public.refresh_daily_stock() to authenticated;

-- Optional (if you enable pg_cron in Supabase): refill automatically at 00:00 IST (= 18:30 UTC)
--   select cron.schedule('refill-daily-stock', '30 18 * * *', 'select public.refresh_daily_stock()');
