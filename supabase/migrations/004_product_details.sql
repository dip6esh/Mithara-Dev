-- ============================================================
-- Mithara — 004: Product detail fields for the admin Menu Control
-- Adds the fields the storefront menu shows for every item:
--   ingredients, topping, weight, allergen details, dietary tags,
--   serving temperature, shelf life, storage and photo alt text.
--
-- SAFE TO RUN ON A LIVE DATABASE
--   • Purely additive: no column is dropped, renamed or retyped.
--   • Every new column is nullable or has a default, so all existing
--     rows stay valid and are NOT modified (they simply start empty).
--   • Idempotent: running it twice does nothing the second time.
--   • No RLS / policy / trigger changes. The existing policies on
--     public.products already cover new columns.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

alter table public.products add column if not exists ingredients    text[] not null default '{}';
alter table public.products add column if not exists topping        text;
alter table public.products add column if not exists weight         text;
alter table public.products add column if not exists allergen_notes text;
alter table public.products add column if not exists dietary        text[] not null default '{}';
alter table public.products add column if not exists temperature    text;
alter table public.products add column if not exists shelf_life     text;
alter table public.products add column if not exists storage        text;
alter table public.products add column if not exists image_alt      text;

comment on column public.products.ingredients    is 'Ingredient list shown on the website, e.g. {Flour,Sugar,Milk}';
comment on column public.products.topping        is 'Topping text, e.g. "Pistachio powder"';
comment on column public.products.weight         is 'Display weight, e.g. "165 grams - 175 grams Approx"';
comment on column public.products.allergen_notes is 'Free-text allergen detail, e.g. "Tree Nuts (Pistachio)". Badge keys stay in products.allergens';
comment on column public.products.dietary        is 'Dietary tags, e.g. {Vegetarian,Eggless}';
comment on column public.products.temperature    is 'How it is served, e.g. "Warm"';
comment on column public.products.shelf_life     is 'e.g. "12 hours"';
comment on column public.products.storage        is 'Storage instructions';
comment on column public.products.image_alt      is 'Alt text describing the product photo';

-- Make the new columns visible to the API immediately (no restart needed).
notify pgrst, 'reload schema';
