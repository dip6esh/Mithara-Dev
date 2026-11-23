-- ============================================================
-- Mithara — Admin & Customer Schema Expansion
-- ============================================================

-- 1. Products modifications
alter table public.products add column if not exists status text not null default 'active'
  check (status in ('active','sold_out','hidden','draft','deleted'));
alter table public.products add column if not exists daily_stock int;
alter table public.products add column if not exists stock_remaining int;
alter table public.products add column if not exists stock_reset_at timestamptz;

-- Update products RLS: anon/authenticated can view active or sold_out products
drop policy if exists "Public can view available products" on public.products;
create policy "Public can view active or sold_out products" on public.products for select to anon, authenticated
  using (status in ('active', 'sold_out') and is_available = true);

-- Admin full access to products
create policy "Admin full access to products" on public.products for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 2. Customer profiles
create table if not exists public.customer_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.customer_profiles enable row level security;

create policy "Customers manage own profile" on public.customer_profiles for all to authenticated
  using (auth.uid() = id or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check (auth.uid() = id or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 3. Customer addresses
create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Home',
  recipient_name text,
  phone text,
  flat text,
  building text,
  street text,
  area text,
  city text,
  pincode text,
  instructions text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.customer_addresses enable row level security;

create policy "Customers manage own addresses" on public.customer_addresses for all to authenticated
  using (auth.uid() = customer_id or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check (auth.uid() = customer_id or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 4. Order sequence & Orders table
create sequence if not exists order_number_seq start with 1001;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('MTH-' || nextval('order_number_seq')::text),
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  status text not null default 'new' check (status in ('new', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partial', 'paid')),
  payment_method text default 'upi' check (payment_method in ('cash', 'upi', 'card', 'other')),
  delivery_type text not null default 'delivery' check (delivery_type in ('delivery', 'pickup')),
  address_snapshot jsonb,
  notes text,
  admin_notes text,
  subtotal_inr int not null default 0,
  delivery_fee_inr int not null default 0,
  total_inr int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.orders enable row level security;

create policy "Customers and admin view orders" on public.orders for select to authenticated, anon
  using (auth.uid() = customer_id or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Anyone authenticated can create orders" on public.orders for insert to authenticated, anon
  with check (true);

create policy "Admin can update orders" on public.orders for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 5. Order items
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  variant text,
  unit_price int not null,
  qty int not null default 1,
  note text,
  created_at timestamptz not null default now()
);
alter table public.order_items enable row level security;

create policy "View order items" on public.order_items for select to authenticated, anon
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (o.customer_id = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    )
  );

create policy "Insert order items" on public.order_items for insert to authenticated, anon
  with check (true);

create policy "Admin manage order items" on public.order_items for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 6. Triggers for updated_at
create trigger trg_customer_profiles_updated_at
  before update on public.customer_profiles
  for each row execute function public.set_updated_at();

create trigger trg_customer_addresses_updated_at
  before update on public.customer_addresses
  for each row execute function public.set_updated_at();

create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();
