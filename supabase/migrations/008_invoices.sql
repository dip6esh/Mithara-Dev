-- ============================================================
-- Mithara — Invoices
--
-- An invoice is issued automatically the moment payment is received, whichever way it happens:
--   * customer pays online at checkout   (confirm_demo_payment / a future gateway)
--   * cash or UPI is collected at handover (admin marks the order handed over)
-- Tax on the bill follows the order: if tax was ON when the order was placed the document is a
-- "Tax Invoice" with the GST split; if tax was OFF it is a "Bill of Supply" with no tax lines.
--
-- * Each invoice is a frozen snapshot (seller, buyer, items, amounts) so later edits to the
--   order or the menu never change an issued invoice.
-- * Numbers are gapless per financial year:  MTH/26-27/0001  (simulated payments: TEST/26-27/0001)
-- * Invoices are never deleted. Un-paying or cancelling a paid order marks the invoice VOID.
-- * A problem while building an invoice can never block a payment (see the trigger).
-- Safe to run more than once, on top of 001-007.
-- ============================================================

-- 1. Seller / invoice settings (DEMO values: replace in Admin > Settings > Invoice details) --
insert into public.site_settings (key, value) values
  ('invoice_business_name', '"Mithara Dessert House"'),
  ('invoice_address',       '"Shop 12, Demo Complex, Andheri West, Mumbai, Maharashtra 400053"'),
  ('invoice_state',         '"Maharashtra"'),
  ('invoice_state_code',    '"27"'),
  ('invoice_gstin',         '"27ABCDE1234F1Z5"'),
  ('invoice_fssai',         '"11521999000123"'),
  ('invoice_hsn',           '"1905"'),
  ('invoice_footer',        '"Thank you for choosing Mithara. This is a computer-generated invoice and does not require a signature."')
on conflict (key) do nothing;

-- 2. Tables ----------------------------------------------------------------------
create table if not exists public.invoice_counters (
  series  text not null,          -- 'MTH' (real) or 'TEST' (simulated payments)
  fy      text not null,          -- '26-27'
  last_no int  not null default 0,
  primary key (series, fy)
);
alter table public.invoice_counters enable row level security;   -- no policies: functions only

create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  order_id       uuid references public.orders(id) on delete set null,
  order_number   text not null,
  customer_id    uuid,
  customer_name  text not null,
  doc_type       text not null check (doc_type in ('tax_invoice', 'bill_of_supply')),
  is_test        boolean not null default false,
  status         text not null default 'issued' check (status in ('issued', 'void')),
  total_inr      numeric(12,2) not null,
  tax_inr        numeric(12,2) not null default 0,
  issued_at      timestamptz not null default now(),
  voided_at      timestamptz,
  void_reason    text,
  data           jsonb not null,  -- frozen snapshot: seller, buyer, items, amounts, payment
  created_at     timestamptz not null default now()
);

create index if not exists invoices_customer_idx on public.invoices (customer_id, issued_at desc);
create index if not exists invoices_issued_idx   on public.invoices (issued_at desc);
-- At most one live invoice per order (a re-paid order gets a new one after the old one is void).
create unique index if not exists invoices_one_issued_per_order
  on public.invoices (order_id) where status = 'issued';

-- 3. Row-level security: customers see their own, admin sees all, nobody writes directly --
alter table public.invoices enable row level security;

drop policy if exists "Customers and admin read invoices" on public.invoices;
create policy "Customers and admin read invoices" on public.invoices for select to authenticated
  using (customer_id = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

grant select on public.invoices to authenticated;

-- 4. Next invoice number (gapless within a series + Indian financial year, Apr-Mar) --------
create or replace function public.next_invoice_number(p_is_test boolean, p_at timestamptz)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_ist    timestamp := p_at at time zone 'Asia/Kolkata';
  v_start  int := case when extract(month from v_ist) >= 4
                       then extract(year from v_ist)::int else extract(year from v_ist)::int - 1 end;
  v_fy     text := lpad((v_start % 100)::text, 2, '0') || '-' || lpad(((v_start + 1) % 100)::text, 2, '0');
  v_series text := case when p_is_test then 'TEST' else 'MTH' end;
  v_no     int;
begin
  insert into invoice_counters (series, fy, last_no) values (v_series, v_fy, 1)
  on conflict (series, fy) do update set last_no = invoice_counters.last_no + 1
  returning last_no into v_no;
  return v_series || '/' || v_fy || '/' || lpad(v_no::text, 4, '0');
end;
$$;
revoke all on function public.next_invoice_number(boolean, timestamptz) from public, anon, authenticated;

-- 5. Build and store the invoice for one paid order ------------------------------------------
create or replace function public.create_invoice_for_order(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  o         record;
  v_id      uuid;
  v_at      timestamptz;
  v_test    boolean;
  v_doc     text;
  v_items   jsonb;
  v_addr    text;
  v_tax     numeric(12,2);
  v_cgst    numeric(12,2) := 0;
  v_sgst    numeric(12,2) := 0;
  v_taxable numeric(12,2);
  v_data    jsonb;
begin
  select * into o from orders where id = p_order_id;
  if not found or o.payment_status <> 'paid' or o.status = 'cancelled' then
    return null;
  end if;

  select id into v_id from invoices where order_id = o.id and status = 'issued';
  if found then
    return v_id;
  end if;

  v_at   := coalesce(o.paid_at, now());
  -- Simulated online payments are test invoices. Cash at handover is always real money.
  v_test := (o.payment_mode = 'demo' and o.payment_method <> 'cash');

  -- Tax follows what was recorded on the order when it was placed (Admin > Settings > Tax).
  v_tax := coalesce(o.tax_inr, 0);
  if v_tax > 0 then
    v_doc  := 'tax_invoice';
    v_cgst := round(v_tax / 2, 2);        -- intra-state supply: GST splits into CGST + SGST
    v_sgst := v_tax - v_cgst;
    v_taxable := case when o.tax_inclusive then o.subtotal_inr - v_tax else o.subtotal_inr end;
  else
    v_doc  := 'bill_of_supply';
    v_tax  := 0;
    v_taxable := o.subtotal_inr;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', name, 'variant', variant, 'qty', qty,
           'unit_price', unit_price, 'amount', unit_price * qty) order by created_at, id), '[]'::jsonb)
    into v_items from order_items where order_id = o.id;

  v_addr := case when o.delivery_type = 'pickup' then 'Store pickup'
    else nullif(concat_ws(', ',
      nullif(o.address_snapshot ->> 'flat', ''),     nullif(o.address_snapshot ->> 'building', ''),
      nullif(o.address_snapshot ->> 'street', ''),   nullif(o.address_snapshot ->> 'area', ''),
      nullif(o.address_snapshot ->> 'city', ''),     nullif(o.address_snapshot ->> 'pincode', '')), '')
    end;

  v_data := jsonb_build_object(
    'seller', jsonb_build_object(
      'name',       public.setting_text('invoice_business_name', 'Mithara'),
      'address',    public.setting_text('invoice_address', ''),
      'state',      public.setting_text('invoice_state', ''),
      'state_code', public.setting_text('invoice_state_code', ''),
      'gstin',      public.setting_text('invoice_gstin', ''),
      'fssai',      public.setting_text('invoice_fssai', ''),
      'hsn',        public.setting_text('invoice_hsn', ''),
      'phone',      public.setting_text('whatsapp_display', ''),
      'footer',     public.setting_text('invoice_footer', '')),
    'buyer', jsonb_build_object(
      'name', o.customer_name, 'phone', o.customer_phone, 'email', o.customer_email,
      'address', v_addr, 'delivery_type', o.delivery_type),
    'items',        v_items,
    'subtotal',     o.subtotal_inr,
    'delivery_fee', o.delivery_fee_inr,
    'tax', jsonb_build_object(
      'applied',   v_tax > 0,
      'label',     coalesce(o.tax_label, 'GST'),
      'rate',      o.tax_rate,
      'inclusive', o.tax_inclusive,
      'taxable_value', v_taxable,
      'cgst', v_cgst, 'sgst', v_sgst, 'total', v_tax),
    'total',        o.total_inr,
    'payment', jsonb_build_object(
      'method', o.payment_method, 'paid_via', o.paid_via, 'paid_at', o.paid_at, 'mode', o.payment_mode));

  insert into invoices (
    invoice_number, order_id, order_number, customer_id, customer_name,
    doc_type, is_test, status, total_inr, tax_inr, issued_at, data
  ) values (
    public.next_invoice_number(v_test, v_at), o.id, o.order_number, o.customer_id, o.customer_name,
    v_doc, v_test, 'issued', o.total_inr, v_tax, v_at, v_data
  ) returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.create_invoice_for_order(uuid) from public, anon, authenticated;

-- 6. Trigger: payment received -> invoice; payment reversed / order cancelled -> void ----------
create or replace function public.orders_invoice_on_payment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.payment_status = 'paid' and new.status <> 'cancelled'
       and (old.payment_status is distinct from 'paid' or old.status = 'cancelled') then
      perform public.create_invoice_for_order(new.id);

    elsif old.payment_status = 'paid' and new.payment_status <> 'paid' then
      update invoices
         set status = 'void', voided_at = now(), void_reason = 'Payment marked as not received'
       where order_id = new.id and status = 'issued';

    elsif new.status = 'cancelled' and old.status <> 'cancelled' then
      update invoices
         set status = 'void', voided_at = now(), void_reason = 'Order cancelled'
       where order_id = new.id and status = 'issued';
    end if;
  exception when others then
    -- Never let an invoice problem block taking payment. `issue_missing_invoices()` catches up.
    raise warning 'invoice step failed for order %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists trg_orders_invoice_on_payment on public.orders;
create trigger trg_orders_invoice_on_payment
  after update on public.orders
  for each row execute function public.orders_invoice_on_payment();

-- 7. Catch-up: issue invoices for paid orders that have none (also used for the backfill below) --
create or replace function public.issue_missing_invoices()
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_count int := 0;
begin
  -- Callable from the SQL editor (no JWT) or by an admin; never by customers.
  if auth.uid() is not null and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Only an admin can do this.' using errcode = 'P0001';
  end if;

  for r in
    select id from orders o
     where o.payment_status = 'paid' and o.status <> 'cancelled'
       and not exists (select 1 from invoices i where i.order_id = o.id and i.status = 'issued')
     order by coalesce(o.paid_at, o.updated_at), o.created_at
  loop
    if public.create_invoice_for_order(r.id) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
grant execute on function public.issue_missing_invoices() to authenticated;

-- 8. Backfill: invoices for orders that were already paid before this migration ---------------
select public.issue_missing_invoices();
