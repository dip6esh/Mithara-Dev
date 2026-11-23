-- ============================================================
-- Mithara — Initial Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ─────────────────────────────────────────
-- 1. PRODUCTS
-- ─────────────────────────────────────────
create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  category     text not null check (category in ('kunafa', 'baklava', 'gelato')),
  name         text not null,
  description  text,
  image_url    text,
  price_label  text,           -- raw display string e.g. "6pc/9pc - ₹700/₹975"
  is_available boolean not null default true,
  is_featured  boolean not null default false,
  sort_order   int not null default 0,
  allergens    text[] default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.products enable row level security;

-- Anyone can read available products
create policy "Public can view available products"
  on public.products for select
  to anon, authenticated
  using (is_available = true);

-- ─────────────────────────────────────────
-- 2. ENQUIRIES
-- Logs every WhatsApp order/enquiry click
-- ─────────────────────────────────────────
create table if not exists public.enquiries (
  id            uuid primary key default gen_random_uuid(),
  mode          text not null check (mode in ('order', 'enquiry')),
  lines         jsonb not null default '[]',
  question      text,
  total_est_inr int,
  created_at    timestamptz not null default now(),
  user_agent    text,
  referrer      text
);

alter table public.enquiries enable row level security;

-- Anyone can insert an enquiry (anonymous logging)
create policy "Anyone can log an enquiry"
  on public.enquiries for insert
  to anon, authenticated
  with check (true);

-- ─────────────────────────────────────────
-- 3. SITE SETTINGS
-- Admin-editable key/value config
-- ─────────────────────────────────────────
create table if not exists public.site_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

-- Anyone can read settings
create policy "Public can read site settings"
  on public.site_settings for select
  to anon, authenticated
  using (true);

-- Seed default settings
insert into public.site_settings (key, value) values
  ('whatsapp_number',   '"919619617888"'),
  ('whatsapp_display',  '"+91 96196 17888"'),
  ('holiday_mode',      'false'),
  ('holiday_message',   '"We are currently closed. We will be back soon!"'),
  ('banner_enabled',    'false'),
  ('banner_text',       '"Free delivery on orders above ₹1500!"')
on conflict (key) do nothing;

-- ─────────────────────────────────────────
-- 4. SUBSCRIBERS (newsletter / alerts)
-- ─────────────────────────────────────────
create table if not exists public.subscribers (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  created_at timestamptz not null default now()
);

alter table public.subscribers enable row level security;

-- Anyone can subscribe
create policy "Anyone can subscribe"
  on public.subscribers for insert
  to anon, authenticated
  with check (true);

-- ─────────────────────────────────────────
-- 5. AUTO-UPDATE updated_at TRIGGER
-- ─────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create trigger trg_site_settings_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────
-- 6. SEED PRODUCTS — Kunafa
-- ─────────────────────────────────────────
insert into public.products (slug, category, name, description, price_label, allergens, sort_order, is_featured) values
  ('classic-kunafa',     'kunafa', 'Classic Kunafa',     'Traditional cheese kunafa with golden kataifi pastry soaked in sugar syrup.',          '₹ 535/-',                             array['dairy','gluten'], 1,  true),
  ('pistachio-kunafa',   'kunafa', 'Pistachio Kunafa',   'Kunafa loaded with premium pistachios and rose water.',                                '₹ 575/-',                             array['dairy','gluten','nuts'], 2, true),
  ('biscoff-kunafa',     'kunafa', 'Biscoff Kunafa',     'Creamy Biscoff spread layered into our signature kunafa base.',                        '₹ 575/-',                             array['dairy','gluten'], 3, false),
  ('bounty-kunafa',      'kunafa', 'Bounty Kunafa',      'Coconut and chocolate layered inside crispy kataifi pastry.',                          '₹ 575/-',                             array['dairy','gluten','nuts'], 4, false),
  ('nutella-kunafa',     'kunafa', 'Nutella Kunafa',     'Hazelnut chocolate spread melted into our warm kunafa.',                               '₹ 575/-',                             array['dairy','gluten','nuts'], 5, false),
  ('rabdi-kunafa',       'kunafa', 'Rabdi Kunafa',       'Slow-cooked rabdi filling with cardamom and saffron notes.',                           '₹ 575/-',                             array['dairy','gluten'], 6, false),
  ('saffron-kunafa',     'kunafa', 'Saffron Kunafa',     'Delicate saffron cream filling with a floral finish.',                                 '₹ 575/-',                             array['dairy','gluten'], 7, false),
  ('rose-kunafa',        'kunafa', 'Rose Kunafa',        'Rose water and cream kunafa with dried rose petals.',                                  '₹ 575/-',                             array['dairy','gluten'], 8, false)
on conflict (slug) do nothing;

-- ─────────────────────────────────────────
-- 7. SEED PRODUCTS — Baklava
-- ─────────────────────────────────────────
insert into public.products (slug, category, name, description, price_label, allergens, sort_order, is_featured) values
  ('pistachio-square',      'baklava', 'Pistachio Square',      'Classic diamond-cut baklava with premium pistachio filling.',                   '6pc/9pc/12pc/18pc - ₹700/₹975/₹1225/₹1800', array['gluten','nuts'], 1, true),
  ('almond-finger-rolls',   'baklava', 'Almond Finger Rolls',   'Crispy rolled baklava stuffed with almond and honey.',                         '6pc/9pc/12pc/18pc - ₹700/₹975/₹1225/₹1800', array['gluten','nuts'], 2, true),
  ('rose-baklava',          'baklava', 'Rose Baklava',          'Floral rose water baklava with a pistachio centre.',                           '6pc/9pc/12pc/18pc - ₹700/₹975/₹1225/₹1800', array['gluten','nuts'], 3, false),
  ('flower-baklava',        'baklava', 'Flower Baklava',        'Artisan flower-shaped baklava with walnut filling.',                           '6pc/9pc/12pc/18pc - ₹700/₹975/₹1225/₹1800', array['gluten','nuts'], 4, false),
  ('nutella-nest',          'baklava', 'Nutella Nest',          'Nest-shaped kataifi baklava filled with Nutella.',                             '6pc/9pc/12pc/18pc - ₹700/₹975/₹1225/₹1800', array['gluten','nuts','dairy'], 5, false),
  ('tart-baklava',          'baklava', 'Tart Baklava',          'Baklava tart shell filled with cream and topped with pistachios.',             '6pc/9pc/12pc/18pc - ₹700/₹975/₹1225/₹1800', array['gluten','nuts','dairy'], 6, false)
on conflict (slug) do nothing;
