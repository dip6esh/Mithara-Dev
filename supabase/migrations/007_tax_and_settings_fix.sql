-- ============================================================
-- Mithara — Fix settings storage + add tax
--
-- 1. Admin > Settings used to save values double-encoded (the JSON string "100"
--    instead of the number 100, "false" instead of false). The storefront and
--    place_order could not read them reliably. This migration repairs the rows
--    already saved and adds tolerant readers so either shape works.
-- 2. Adds configurable tax (GST) settings and records tax on every order.
-- 3. place_order now calculates tax server-side, so the total can never be
--    tampered with from the browser.
-- Safe to run more than once, on top of 001-006.
-- ============================================================

-- 0. Let the admin save settings -----------------------------------------------
--    site_settings had row-level security with only a public READ policy, so every
--    admin save was rejected ("new row violates row-level security policy").
--    Same admin check the other admin tables use (app_metadata.role = 'admin').
drop policy if exists "Admin can manage site settings" on public.site_settings;
create policy "Admin can manage site settings" on public.site_settings for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 1. Repair double-encoded values -------------------------------------------
-- numbers / booleans saved as JSON strings -> native JSON
update public.site_settings
   set value = (value #>> '{}')::jsonb
 where key in ('delivery_fee_flat', 'free_delivery_above', 'holiday_mode', 'banner_enabled')
   and jsonb_typeof(value) = 'string'
   and (value #>> '{}') ~ '^(-?[0-9]+(\.[0-9]+)?|true|false)$';

-- text saved with literal quotes around it -> plain JSON string
update public.site_settings
   set value = (value #>> '{}')::jsonb
 where key in ('holiday_message', 'order_cutoff_time', 'payment_mode', 'whatsapp_number',
               'whatsapp_display', 'banner_text')
   and jsonb_typeof(value) = 'string'
   and (value #>> '{}') ~ '^".*"$';

-- 2. Tolerant readers (accept native or still-quoted values) ----------------
create or replace function public.setting_text(p_key text, p_default text default '')
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select regexp_replace(value #>> '{}', '^"(.*)"$', '\1') from public.site_settings where key = p_key),
    p_default
  );
$$;

create or replace function public.setting_num(p_key text, p_default numeric default 0)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  select regexp_replace(value #>> '{}', '^"(.*)"$', '\1') into v from public.site_settings where key = p_key;
  if v is null or v !~ '^-?[0-9]+(\.[0-9]+)?$' then return p_default; end if;
  return v::numeric;
end;
$$;

create or replace function public.setting_bool(p_key text, p_default boolean default false)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  select regexp_replace(value #>> '{}', '^"(.*)"$', '\1') into v from public.site_settings where key = p_key;
  if v in ('true', 'false') then return v::boolean; end if;
  return p_default;
end;
$$;

-- 2b. One place that decides "is the store closed right now?" (IST) -----------
--     Closed when holiday mode is on, or inside the closed window: from the order cutoff
--     until the reopen time. Both times are optional:
--       cutoff + reopen  -> closed between them (e.g. 20:30 -> 06:00, or 14:00 -> 17:00)
--       cutoff only      -> closed from the cutoff until midnight
--       reopen only      -> closed from midnight until the reopen time
--     Returns the message to show the customer, or null when orders are open.
create or replace function public.store_closed_reason()
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_msg    text;
  v_cut    text;
  v_open   text;
  v_c      time;
  v_o      time;
  v_now    time := (now() at time zone 'Asia/Kolkata')::time;
  v_closed boolean := false;
begin
  if public.setting_bool('holiday_mode', false) then
    v_msg := public.setting_text('holiday_message', '');
    return coalesce(nullif(v_msg, ''), 'We are closed right now and not accepting orders.');
  end if;

  v_cut  := public.setting_text('order_cutoff_time', '');
  v_open := public.setting_text('order_reopen_time', '');
  begin v_c := nullif(v_cut, '')::time;  exception when others then v_c := null; end;
  begin v_o := nullif(v_open, '')::time; exception when others then v_o := null; end;

  if v_c is not null and v_o is not null then
    if v_c > v_o then
      v_closed := v_now > v_c or v_now < v_o;      -- overnight closure
    elsif v_c < v_o then
      v_closed := v_now > v_c and v_now < v_o;     -- closed for part of the same day
    end if;
  elsif v_c is not null then
    v_closed := v_now > v_c;
  elsif v_o is not null then
    v_closed := v_now < v_o;
  end if;

  if not v_closed then
    return null;
  end if;
  if v_o is not null then
    return 'Orders are closed right now. We reopen at ' || to_char(date '2000-01-01' + v_o, 'FMHH12:MI AM') || '.';
  end if;
  return 'Orders for today are closed. Please come back tomorrow.';
end;
$$;

-- 3. Tax settings (off by default so nothing changes until you switch it on) --
insert into public.site_settings (key, value) values
  ('tax_enabled',      'false'),
  ('tax_rate_percent', '5'),
  ('tax_label',        '"GST"'),
  ('tax_inclusive',    'false'),
  ('order_reopen_time', '""')
on conflict (key) do nothing;

-- 4. Record tax on each order ------------------------------------------------
alter table public.orders add column if not exists tax_inr       int     not null default 0 check (tax_inr >= 0);
alter table public.orders add column if not exists tax_rate      numeric not null default 0;
alter table public.orders add column if not exists tax_label     text;
alter table public.orders add column if not exists tax_inclusive boolean not null default false;

-- 5. place_order with delivery + tax ----------------------------------------
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
  v_closed       text;
  v_fee          int := 0;
  v_free_above   int := 0;
  v_payment_mode text;
  v_profile      record;
  v_addr         record;
  v_snapshot     jsonb := null;
  v_subtotal     int := 0;
  v_delivery     int := 0;
  v_total        int := 0;
  v_tax          int := 0;
  v_tax_on       boolean := false;
  v_tax_rate     numeric := 0;
  v_tax_label    text := 'GST';
  v_tax_incl     boolean := false;
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

  -- Store rules: holiday mode, the order cutoff and the reopen time all block ordering.
  v_closed := public.store_closed_reason();
  if v_closed is not null then
    raise exception '%', v_closed using errcode = 'P0001';
  end if;

  -- Payment mode. Cash (pay at handover) is real money and needs no gateway, so it always works
  -- and goes straight to "new". Online methods are demo-only until a real gateway is wired in.
  v_payment_mode := public.setting_text('payment_mode', 'demo');
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
  v_fee        := round(public.setting_num('delivery_fee_flat', 0))::int;
  v_free_above := round(public.setting_num('free_delivery_above', 0))::int;

  -- Tax rules (configured in Admin > Settings).
  v_tax_on    := public.setting_bool('tax_enabled', false);
  v_tax_rate  := greatest(0, least(100, public.setting_num('tax_rate_percent', 0)));
  v_tax_label := coalesce(nullif(public.setting_text('tax_label', 'GST'), ''), 'GST');
  v_tax_incl  := public.setting_bool('tax_inclusive', false);

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

  -- Tax is worked out on the item subtotal (delivery is not taxed).
  --   Exclusive: tax is added on top of the subtotal.
  --   Inclusive: menu prices already contain tax; it is only shown, the total does not change.
  if v_tax_on and v_tax_rate > 0 then
    if v_tax_incl then
      v_tax := round(v_subtotal - (v_subtotal / (1 + v_tax_rate / 100)))::int;
      v_total := v_subtotal + v_delivery;
    else
      v_tax := round(v_subtotal * v_tax_rate / 100)::int;
      v_total := v_subtotal + v_delivery + v_tax;
    end if;
  else
    v_tax := 0;
    v_total := v_subtotal + v_delivery;
  end if;

  insert into orders (
    customer_id, customer_name, customer_phone, customer_email,
    delivery_type, address_snapshot, notes,
    subtotal_inr, delivery_fee_inr, tax_inr, tax_rate, tax_label, tax_inclusive, total_inr,
    status, payment_status, payment_method, payment_mode
  ) values (
    v_uid, v_profile.name, v_profile.phone, v_email,
    p_delivery_type, v_snapshot, nullif(btrim(coalesce(p_notes, '')), ''),
    v_subtotal, v_delivery, v_tax,
    case when v_tax > 0 then v_tax_rate else 0 end,
    case when v_tax > 0 then v_tax_label else null end,
    case when v_tax > 0 then v_tax_incl else false end,
    v_total,
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
    'tax_inr',         v_tax,
    'tax_label',       case when v_tax > 0 then v_tax_label else null end,
    'tax_inclusive',   case when v_tax > 0 then v_tax_incl else false end,
    'total_inr',       v_total,
    'payment_mode',    v_payment_mode,
    'payment_method',  v_method,
    'status',          v_status
  );
end;
$$;

grant execute on function public.place_order(jsonb, text, uuid, text, text) to authenticated;

-- 6. confirm_demo_payment: also refuse payment when the store is closed -------
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
  v_closed text;
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
  -- The store must still be open: an online order started before closing time (or before holiday
  -- mode was switched on) cannot be paid afterwards and slip into the kitchen's queue.
  if p_success then
    v_closed := public.store_closed_reason();
    if v_closed is not null then
      raise exception '%', v_closed using errcode = 'P0001';
    end if;
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

-- 7. Push settings changes to open storefront / admin pages the moment they are saved --
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'site_settings'
     ) then
    alter publication supabase_realtime add table public.site_settings;
  end if;
end;
$$;
