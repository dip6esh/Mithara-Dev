-- ============================================================
-- Mithara — Direct Ordering (cart + secure server-side checkout)
-- Supersedes the insecure insert policies created in 002.
-- Do not edit 002; this migration only adds and tightens.
-- ============================================================

-- ─────────────────────────────────────────
-- 1. Site settings for ordering & payment
-- ─────────────────────────────────────────
insert into public.site_settings (key, value) values
  ('payment_mode',       '"demo"'),
  ('delivery_fee_flat',  '100'),
  ('free_delivery_above','1500'),
  ('order_cutoff_time',  '"20:30"')
on conflict (key) do nothing;

-- ─────────────────────────────────────────
-- 2. Structured prices (server-side checkout truth)
--    Keyed by the same identity the storefront cart uses:
--    (category, item_name, variant_id).
-- ─────────────────────────────────────────
create table if not exists public.product_variants (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid references public.products(id) on delete set null,
  category     text not null,
  item_name    text not null,
  variant_id   text not null default 'std',
  label        text,
  price_inr    int  not null check (price_inr >= 0),
  is_available boolean not null default true,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (category, item_name, variant_id)
);

alter table public.product_variants enable row level security;

drop policy if exists "Public can read product variants" on public.product_variants;
create policy "Public can read product variants" on public.product_variants for select to anon, authenticated
  using (true);

drop policy if exists "Admin full access to product variants" on public.product_variants;
create policy "Admin full access to product variants" on public.product_variants for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop trigger if exists trg_product_variants_updated_at on public.product_variants;
create trigger trg_product_variants_updated_at
  before update on public.product_variants
  for each row execute function public.set_updated_at();

-- Backfill structured prices from the storefront menu (idempotent).
insert into public.product_variants (category, item_name, variant_id, label, price_inr, sort_order) values
  -- Kunafa (single price)
  ('Kunafa', 'Cream Kunafa',           'std', '', 400, 1),
  ('Kunafa', 'Cream Cheese Kunafa',    'std', '', 450, 2),
  ('Kunafa', 'Biscoff Kunafa',         'std', '', 425, 3),
  ('Kunafa', 'Nutella Kunafa',         'std', '', 425, 4),
  ('Kunafa', 'Oreo Kunafa',            'std', '', 430, 5),
  ('Kunafa', 'KitKat Kunafa',          'std', '', 475, 6),
  ('Kunafa', 'Ferrero Rocher Kunafa',  'std', '', 495, 7),
  ('Kunafa', 'Snickers Kunafa',        'std', '', 475, 8),
  ('Kunafa', 'Bounty Kunafa',          'std', '', 550, 9),
  ('Kunafa', 'Caramel Kunafa',         'std', '', 455, 10),
  ('Kunafa', 'Butterscotch Kunafa',    'std', '', 455, 11),
  ('Kunafa', 'Rabdi Kunafa',           'std', '', 535, 12),
  -- Baklava (tiered packs)
  ('Baklava', 'Pistachio Square Baklava', '6pc',  '6 pc',  700,  1),
  ('Baklava', 'Pistachio Square Baklava', '9pc',  '9 pc',  975,  2),
  ('Baklava', 'Pistachio Square Baklava', '12pc', '12 pc', 1225, 3),
  ('Baklava', 'Pistachio Square Baklava', '18pc', '18 pc', 1800, 4),
  ('Baklava', 'Flower Baklava',           '6pc',  '6 pc',  800,  1),
  ('Baklava', 'Flower Baklava',           '9pc',  '9 pc',  1100, 2),
  ('Baklava', 'Flower Baklava',           '12pc', '12 pc', 1400, 3),
  ('Baklava', 'Flower Baklava',           '18pc', '18 pc', 2050, 4),
  ('Baklava', 'Almond Finger Rolls',      '6pc',  '6 pc',  400,  1),
  ('Baklava', 'Almond Finger Rolls',      '9pc',  '9 pc',  525,  2),
  ('Baklava', 'Almond Finger Rolls',      '12pc', '12 pc', 625,  3),
  ('Baklava', 'Almond Finger Rolls',      '18pc', '18 pc', 875,  4),
  ('Baklava', 'Tart Baklava',             '6pc',  '6 pc',  825,  1),
  ('Baklava', 'Tart Baklava',             '9pc',  '9 pc',  1175, 2),
  ('Baklava', 'Tart Baklava',             '12pc', '12 pc', 1500, 3),
  ('Baklava', 'Tart Baklava',             '18pc', '18 pc', 2175, 4),
  ('Baklava', 'Nutella Nest Baklava',     '6pc',  '6 pc',  575,  1),
  ('Baklava', 'Nutella Nest Baklava',     '9pc',  '9 pc',  800,  2),
  ('Baklava', 'Nutella Nest Baklava',     '12pc', '12 pc', 1000, 3),
  ('Baklava', 'Nutella Nest Baklava',     '18pc', '18 pc', 1425, 4),
  ('Baklava', 'Rose Baklava',             '6pc',  '6 pc',  575,  1),
  ('Baklava', 'Rose Baklava',             '9pc',  '9 pc',  800,  2),
  ('Baklava', 'Rose Baklava',             '12pc', '12 pc', 1000, 3),
  ('Baklava', 'Rose Baklava',             '18pc', '18 pc', 1425, 4),
  -- Baklava assorted (single price)
  ('Baklava', 'Assorted 6 pc.',  'std', '', 750,  1),
  ('Baklava', 'Assorted 9 pc.',  'std', '', 1000, 2),
  ('Baklava', 'Assorted 12 pc.', 'std', '', 1100, 3),
  ('Baklava', 'Assorted 18 pc.', 'std', '', 1625, 4)
on conflict (category, item_name, variant_id) do update
  set price_inr = excluded.price_inr,
      label = excluded.label,
      updated_at = now();

-- ─────────────────────────────────────────
-- 3. Orders: payment mode + awaiting-payment status
-- ─────────────────────────────────────────
alter table public.orders add column if not exists payment_mode text not null default 'demo'
  check (payment_mode in ('demo', 'live'));

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('new','confirmed','preparing','ready','out_for_delivery','completed','cancelled','pending_payment'));

-- ─────────────────────────────────────────
-- 4. Lock down inserts. Orders may now only be created through
--    place_order() (security definer). Admins keep manual creation.
-- ─────────────────────────────────────────
drop policy if exists "Anyone authenticated can create orders" on public.orders;
drop policy if exists "Insert order items" on public.order_items;

drop policy if exists "Admin can create orders" on public.orders;
create policy "Admin can create orders" on public.orders for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admin can insert order items" on public.order_items;
create policy "Admin can insert order items" on public.order_items for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ─────────────────────────────────────────
-- 5. place_order — one secure transaction.
--    Prices are always read from the database, never from the request.
-- ─────────────────────────────────────────
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

  if coalesce(p_payment_method, 'upi') not in ('cash', 'upi', 'card', 'other') then
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

  -- Payment mode: refuse orders when set to live with no gateway configured.
  select coalesce(value #>> '{}', 'demo') into v_payment_mode
    from site_settings where key = 'payment_mode';
  if v_payment_mode = 'live' then
    raise exception 'Online payment is unavailable right now. Please try again later.' using errcode = 'P0001';
  end if;
  v_payment_mode := 'demo';

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
    'pending_payment', 'unpaid', p_payment_method, v_payment_mode
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
    'payment_method',  p_payment_method,
    'status',          'pending_payment'
  );
end;
$$;

grant execute on function public.place_order(jsonb, text, uuid, text, text) to authenticated;

-- ─────────────────────────────────────────
-- 6. confirm_demo_payment — owner only, demo only, pending only.
--    A successful demo payment confirms the order but never marks it paid.
-- ─────────────────────────────────────────
create or replace function public.confirm_demo_payment(
  p_order_id uuid,
  p_success  boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_order record;
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

  if p_success then
    update orders set status = 'new', updated_at = now() where id = p_order_id;
    return jsonb_build_object('status', 'new', 'payment_status', v_order.payment_status);
  end if;

  return jsonb_build_object('status', 'pending_payment', 'payment_status', v_order.payment_status);
end;
$$;

grant execute on function public.confirm_demo_payment(uuid, boolean) to authenticated;
