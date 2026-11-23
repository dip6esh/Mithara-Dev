/**
 * Invoices are issued by the database (migration 008) the moment payment is received.
 * The app only reads them. Each row carries a frozen snapshot in `data`.
 */
import { supabase } from "./supabase";

export type InvoiceDocType = "tax_invoice" | "bill_of_supply";

export type InvoiceData = {
  seller: {
    name: string;
    address: string;
    state: string;
    state_code: string;
    gstin: string;
    fssai: string;
    hsn: string;
    phone: string;
    footer: string;
  };
  buyer: {
    name: string;
    phone: string;
    email: string | null;
    address: string | null;
    delivery_type: "delivery" | "pickup";
  };
  items: { name: string; variant: string | null; qty: number; unit_price: number; amount: number }[];
  subtotal: number;
  delivery_fee: number;
  tax: {
    applied: boolean;
    label: string;
    rate: number;
    inclusive: boolean;
    taxable_value: number;
    cgst: number;
    sgst: number;
    total: number;
  };
  total: number;
  payment: { method: string; paid_via: string | null; paid_at: string | null; mode: string };
};

export type Invoice = {
  id: string;
  invoice_number: string;
  order_id: string | null;
  order_number: string;
  customer_id: string | null;
  customer_name: string;
  doc_type: InvoiceDocType;
  is_test: boolean;
  status: "issued" | "void";
  total_inr: number;
  tax_inr: number;
  issued_at: string;
  voided_at: string | null;
  void_reason: string | null;
  data: InvoiceData;
};

/** Everything except the heavy snapshot: enough for lists and "View invoice" buttons. */
export type InvoiceSummary = Omit<Invoice, "data">;

const SUMMARY_COLS =
  "id, invoice_number, order_id, order_number, customer_id, customer_name, doc_type, is_test, status, total_inr, tax_inr, issued_at, voided_at, void_reason";

export const DOC_TITLE: Record<InvoiceDocType, string> = {
  tax_invoice: "Tax Invoice",
  bill_of_supply: "Bill of Supply",
};

export const invoiceHref = (id: string) => `/invoice/${id}`;

/**
 * Current (non-void) invoice per order, keyed by order id. RLS limits customers to their own.
 * Never throws: if the invoices table is not there yet (migration not run) the app keeps working.
 */
export async function fetchInvoiceMap(orderIds?: string[]): Promise<Record<string, InvoiceSummary>> {
  try {
    let q = supabase.from("invoices").select(SUMMARY_COLS).eq("status", "issued");
    if (orderIds) {
      if (orderIds.length === 0) return {};
      q = q.in("order_id", orderIds);
    }
    const { data, error } = await q;
    if (error) throw error;
    const map: Record<string, InvoiceSummary> = {};
    for (const inv of (data ?? []) as InvoiceSummary[]) {
      if (inv.order_id) map[inv.order_id] = inv;
    }
    return map;
  } catch (err) {
    console.warn("Could not load invoices", err);
    return {};
  }
}

export async function fetchInvoice(id: string): Promise<Invoice | null> {
  const { data, error } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Invoice | null) ?? null;
}

/** Admin only: invoice any paid order that has none (safety net). Returns how many were issued. */
export async function issueMissingInvoices(): Promise<number> {
  const { data, error } = await supabase.rpc("issue_missing_invoices");
  if (error) throw error;
  return Number(data ?? 0);
}

/** 2 decimals only when needed (e.g. CGST on an odd tax amount: 2.5). */
export function money(n: number): string {
  const v = Number(n) || 0;
  return `₹${v.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven",
  "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : ""));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(" ");
}

/** "Two Thousand Five Hundred Rupees Only" (Indian grouping: lakh, crore). */
export function amountInWords(amount: number): string {
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  if (rupees === 0 && paise === 0) return "Zero Rupees Only";

  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;

  const words: string[] = [];
  if (crore) words.push(`${below1000(crore)} Crore`);
  if (lakh) words.push(`${below1000(lakh)} Lakh`);
  if (thousand) words.push(`${below1000(thousand)} Thousand`);
  if (rest) words.push(below1000(rest));

  let out = words.length ? `${words.join(" ")} Rupees` : "";
  if (paise) out += `${out ? " and " : ""}${below1000(paise)} Paise`;
  return `${out} Only`;
}
