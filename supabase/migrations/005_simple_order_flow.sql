-- ============================================================
-- Mithara — Simple order flow
--   Order received -> Handed over (or Cancelled).
--   Payment is either already paid online, or collected at handover
--   (cash or UPI) and recorded when the admin hands the order over.
-- Safe to run once on top of 001-004.
-- ============================================================

-- 1. Collapse the multi-step statuses ---------------------------------------
update public.orders
   set status = 'new'
 where status in ('confirmed', 'preparing', 'ready', 'out_for_delivery');

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending_payment', 'new', 'completed', 'cancelled'));

-- 2. Record how and when an order was actually paid --------------------------
alter table public.orders add column if not exists paid_via text
  check (paid_via in ('cash', 'upi', 'card'));
alter table public.orders add column if not exists paid_at timestamptz;

update public.orders
   set paid_via = case when payment_method in ('cash', 'upi', 'card') then payment_method end,
       paid_at  = coalesce(paid_at, updated_at)
 where payment_status = 'paid' and paid_at is null;

create or replace function public.orders_stamp_paid()
returns trigger language plpgsql as $$
begin
  if new.payment_status = 'paid' then
    if new.paid_at is null then
      new.paid_at := now();
    end if;
  else
    -- Marking an order unpaid again clears the payment record.
    new.paid_at  := null;
    new.paid_via := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_stamp_paid on public.orders;
create trigger trg_orders_stamp_paid
  before insert or update on public.orders
  for each row execute function public.orders_stamp_paid();

-- 3. place_order: cash orders skip the payment step and are created as "new" --
create or replace function public.place_order(
  p_items          jsonb,
  p_delivery_type  text,
  p_address_id     uuid,
  p_payment_method text,
  p_notes          text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid          uuid := auth.uid();
  v_email        text;
  v_holiday      boolean;
  v_cutoff       text;
  v_fee          int := 0;
  v_free_above   int := 0;
  v_payment_mode text;
  v_profile      record;
  v_addr         record;
  v_snapshot     jsonb := null;
  v_subtotal     int := 0;
  v_delivery     int := 0;
  v_total        int := 0;
  v_order_id     uuid;
  v_order_number text;
  v_item         jsonb;
  v_pv           record;
  v_qty          int;
  v_method       text := coalesce(p_payment_method, 'upi');
  v_status       text;
begin
  if v_uid is null then
    raise exception 'Please sign in to place your order.' using errcode = 'P0001';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.' using errcode = 'P0001';
  end if;

  if p_delivery_type not in ('delivery', 'pickup') then
    raise exception 'Please choose delivery or pickup.' using errcode = 'P0001';
  end if;

  if v_method not in ('cash', 'upi', 'card', 'other') then
    raise exception 'Please choose a valid payment method.' using errcode = 'P0001';
  end if;

  -- Store rules: holiday mode and cutoff time block ordering.
  select coalesce((value)::text::boolean, false) into v_holiday
    from site_settings where key = 'holiday_mode';
  if coalesce(v_holiday, false) then
    raise exception 'We are closed right now and not accepting orders.' using errcode = 'P0001';
  end if;

  select value #>> '{}' into v_cutoff from site_settings where key = 'order_cutoff_time';
  if v_cutoff is not null and v_cutoff <> ''
       and (now() at time zone 'Asia/Kolkata')::time > v_cutoff::time then
    raise exception 'Orders for today are closed. Please come back tomorrow.' using errcode = 'P0001';
  end if;

  -- Payment mode. Cash (pay at handover) is real money and needs no gateway, so it always works
  -- and goes straight to "new". Online methods are demo-only until a real gateway is wired in.
  select coalesce(value #>> '{}', 'demo') into v_payment_mode
    from site_settings where key = 'payment_mode';
  if v_method = 'cash' then
    v_payment_mode := 'live';
    v_status := 'new';
  else
    if v_payment_mode = 'live' then
      raise exception 'Online payment is unavailable right now. Please choose pay at handover.' using errcode = 'P0001';
    end if;
    v_payment_mode := 'demo';
    v_status := 'pending_payment';
  end if;

  -- Customer identity and contact come from the profile, not the request.
  select name, phone into v_profile from customer_profiles where id = v_uid;
  if not found then
    raise exception 'Please complete your profile (name and phone) before ordering.' using errcode = 'P0001';
  end if;
  select email into v_email from auth.users where id = v_uid;

  -- Address must belong to the signed-in customer.
  if p_delivery_type = 'delivery' then
    if p_address_id is null then
      raise exception 'Please select or add a delivery address.' using errcode = 'P0001';
    end if;
    select * into v_addr from customer_addresses
      where id = p_address_id and customer_id = v_uid;
    if not found then
      raise exception 'That delivery address could not be found.' using errcode = 'P0001';
    end if;
    v_snapshot := jsonb_build_object(
      'label', v_addr.label, 'recipient_name', v_addr.recipient_name, 'phone', v_addr.phone,
      'flat', v_addr.flat, 'building', v_addr.building, 'street', v_addr.street,
      'area', v_addr.area, 'city', v_addr.city, 'pincode', v_addr.pincode,
      'instructions', v_addr.instructions
    );
  end if;

  -- Delivery fee rules.
  select coalesce((value)::text::numeric, 0)::int into v_fee
    from site_settings where key = 'delivery_fee_flat';
  select coalesce((value)::text::numeric, 0)::int into v_free_above
    from site_settings where key = 'free_delivery_above';

  -- Validate every line and price it from the database.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, coalesce((v_item ->> 'qty')::int, 1));

    select price_inr, label, is_available, item_name into v_pv
      from product_variants
      where lower(category)  = lower(coalesce(v_item ->> 'category', ''))
        and lower(item_name) = lower(coalesce(v_item ->> 'name', ''))
        and lower(variant_id) = lower(coalesce(nullif(v_item ->> 'variant_id', ''), 'std'))
      limit 1;

    if not found then
      raise exception 'Sorry, "%" is no longer available.', coalesce(v_item ->> 'name', 'that item')
        using errcode = 'P0001';
    end if;
    if not v_pv.is_available then
      raise exception 'Sorry, "%" is sold out.', v_pv.item_name using errcode = 'P0001';
    end if;

    v_subtotal := v_subtotal + (v_pv.price_inr * v_qty);
  end loop;

  if p_delivery_type = 'pickup' then
    v_delivery := 0;
  elsif v_free_above > 0 and v_subtotal >= v_free_above then
    v_delivery := 0;
  else
    v_delivery := coalesce(v_fee, 0);
  end if;
  v_total := v_subtotal + v_delivery;

  insert into orders (
    customer_id, customer_name, customer_phone, customer_email,
    delivery_type, address_snapshot, notes,
    subtotal_inr, delivery_fee_inr, total_inr,
    status, payment_status, payment_method, payment_mode
  ) values (
    v_uid, v_profile.name, v_profile.phone, v_email,
    p_delivery_type, v_snapshot, nullif(btrim(coalesce(p_notes, '')), ''),
    v_subtotal, v_delivery, v_total,
    v_status, 'unpaid', v_method, v_payment_mode
  ) returning id, order_number into v_order_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, coalesce((v_item ->> 'qty')::int, 1));
    select price_inr, label, item_name into v_pv
      from product_variants
      where lower(category)  = lower(coalesce(v_item ->> 'category', ''))
        and lower(item_name) = lower(coalesce(v_item ->> 'name', ''))
        and lower(variant_id) = lower(coalesce(nullif(v_item ->> 'variant_id', ''), 'std'))
      limit 1;

    insert into order_items (order_id, product_id, name, variant, unit_price, qty, note)
    values (
      v_order_id, null,
      v_pv.item_name,
      nullif(coalesce(v_item ->> 'variant', ''), ''),
      v_pv.price_inr,
      v_qty,
      nullif(btrim(coalesce(v_item ->> 'note', '')), '')
    );
  end loop;

  return jsonb_build_object(
    'order_id',        v_order_id,
    'order_number',    v_order_number,
    'subtotal_inr',    v_subtotal,
    'delivery_fee_inr',v_delivery,
    'total_inr',       v_total,
    'payment_mode',    v_payment_mode,
    'payment_method',  v_method,
    'status',          v_status
  );
end;
$$;

grant execute on function public.place_order(jsonb, text, uuid, text, text) to authenticated;

-- 4. confirm_demo_payment: a successful (demo) online payment now marks the order PAID --
drop function if exists public.confirm_demo_payment(uuid, boolean);

create or replace function public.confirm_demo_payment(
  p_order_id uuid,
  p_success  boolean,
  p_method   text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_order  record;
  v_method text;
begin
  if v_uid is null then
    raise exception 'Please sign in to continue.' using errcode = 'P0001';
  end if;

  select * into v_order from orders
    where id = p_order_id and customer_id = v_uid
    for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0001';
  end if;
  if v_order.payment_mode <> 'demo' then
    raise exception 'This order is not a demo payment.' using errcode = 'P0001';
  end if;
  if v_order.status <> 'pending_payment' then
    raise exception 'This order is no longer awaiting payment.' using errcode = 'P0001';
  end if;
  if p_method is not null and p_method not in ('upi', 'card') then
    raise exception 'Please choose a valid online payment method.' using errcode = 'P0001';
  end if;

  v_method := coalesce(p_method, case when v_order.payment_method in ('upi', 'card') then v_order.payment_method else 'upi' end);

  if p_success then
    update orders
       set status         = 'new',
           payment_status = 'paid',
           payment_method = v_method,
           paid_via       = v_method,
           updated_at     = now()
     where id = p_order_id;
    return jsonb_build_object('status', 'new', 'payment_status', 'paid');
  end if;

  return jsonb_build_object('status', 'pending_payment', 'payment_status', v_order.payment_status);
end;
$$;

grant execute on function public.confirm_demo_payment(uuid, boolean, text) to authenticated;

-- 5. Customer can drop their own unfinished online order (e.g. switches to pay at handover) --
create or replace function public.cancel_my_pending_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update orders
     set status = 'cancelled', updated_at = now()
   where id = p_order_id
     and customer_id = auth.uid()
     and status = 'pending_payment';
end;
$$;

grant execute on function public.cancel_my_pending_order(uuid) to authenticated;

-- 6. Housekeeping: cancel online orders abandoned before payment ------------------
--    Not scheduled here. To run it automatically enable pg_cron and add e.g.
--    select cron.schedule('cancel-stale-orders', '*/30 * * * *', 'select public.cancel_stale_pending_orders()');
create or replace function public.cancel_stale_pending_orders(p_hours int default 3)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  update orders
     set status = 'cancelled', updated_at = now()
   where status = 'pending_payment'
     and created_at < now() - make_interval(hours => p_hours);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.cancel_stale_pending_orders(int) from public, anon, authenticated;

-- 7. Live order alerts: let the admin screens subscribe to orders (RLS still applies) --
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
     ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end;
$$;

-- 8. Create the customer profile on sign-up, even when email confirmation delays the session --
create or replace function public.handle_new_customer()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'name', '') <> ''
     and coalesce(new.raw_user_meta_data ->> 'phone', '') <> '' then
    insert into public.customer_profiles (id, name, phone)
    values (new.id, new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'phone')
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_handle_new_customer on auth.users;
create trigger trg_handle_new_customer
  after insert on auth.users
  for each row execute function public.handle_new_customer();
