/**
 * KOT (Kitchen Order Ticket) printing for thermal receipt printers.
 *
 * Two paper sizes: 2 inch (58 mm roll, about 48 mm printable) and 3 inch (80 mm roll, about 72 mm printable).
 * Thermal printers print one colour (black) and have no fine greys, so the slip is plain black on white,
 * bold, in a monospace font that every device has (Courier New → Courier → system monospace). The page is
 * as wide as the roll and as long as the content ("auto"), so there is no wasted paper.
 *
 * The slip carries what the kitchen and the person packing the box need: order number, time, pickup or
 * delivery, customer name, items with quantity, the customer's notes (one per item and one for the whole
 * order) and the total number of items at the bottom. It carries no prices, no payment line, and no
 * address or phone number.
 *
 * Printing opens the browser print dialog: pick the thermal printer there, and set paper size to the roll
 * width and margins to "None" if the dialog offers them.
 */
import { useSyncExternalStore } from "react";
import type { Order } from "./types";

export type KotWidth = "58" | "80";

const SIZES: Record<KotWidth, { page: number; printable: number; font: number; big: number; label: string }> = {
  "58": { page: 58, printable: 48, font: 12, big: 22, label: "2 inch" },
  "80": { page: 80, printable: 72, font: 15, big: 28, label: "3 inch" },
};

/* ───────────── Paper size, saved on this device ─────────────
 * The printer is attached to one device, so the roll size is remembered per browser (like the alert sound),
 * and set once in Settings → KOT printing. The Kitchen's "Print KOT" button then uses it. */
const WIDTH_KEY = "mithara-admin-kot-width";
export const DEFAULT_KOT_WIDTH: KotWidth = "80";
let savedWidth: KotWidth | null = null;
const widthSubs = new Set<() => void>();

function readWidth(): KotWidth {
  if (savedWidth) return savedWidth;
  let w: KotWidth = DEFAULT_KOT_WIDTH;
  try {
    const raw = window.localStorage.getItem(WIDTH_KEY);
    if (raw === "58" || raw === "80") w = raw;
  } catch {
    /* storage unavailable: use the default */
  }
  savedWidth = w;
  return w;
}

export function setKotWidth(w: KotWidth) {
  savedWidth = w;
  try {
    window.localStorage.setItem(WIDTH_KEY, w);
  } catch {
    /* storage unavailable: the choice lasts for this visit only */
  }
  widthSubs.forEach((l) => l());
}

export function useKotWidth(): KotWidth {
  return useSyncExternalStore(
    (l) => {
      widthSubs.add(l);
      return () => widthSubs.delete(l);
    },
    readWidth,
    () => DEFAULT_KOT_WIDTH,
  );
}

/** Prints a KOT on the paper size chosen in Settings. */
export function printKotSaved(order: Order): void {
  printKot(order, readWidth());
}

/** Id of the made-up order used by the Settings → KOT test. Never exists in the database. */
export const KOT_TEST_ORDER_ID = "kot-test";
export const KOT_PAGE_MM: Record<KotWidth, number> = { "58": SIZES["58"].page, "80": SIZES["80"].page };

/**
 * A made-up order for checking the printer before the store opens. It has a long item name, a size, an item
 * note, a customer note and an amount to collect, so line-wrapping and every section of the slip get tested.
 */
export function sampleKotOrder(): Order {
  const now = new Date().toISOString();
  return {
    id: KOT_TEST_ORDER_ID,
    order_number: "TEST-001",
    customer_id: null,
    customer_name: "Test Customer",
    customer_phone: "",
    customer_email: null,
    status: "new",
    payment_status: "pending",
    payment_method: "cash",
    payment_mode: "demo",
    delivery_type: "delivery",
    address_snapshot: null,
    notes: "Test note: please check this line wraps neatly.",
    admin_notes: "Staff note sample",
    subtotal_inr: 1850,
    delivery_fee_inr: 0,
    total_inr: 1850,
    created_at: now,
    updated_at: now,
    order_items: [
      { id: "t1", order_id: KOT_TEST_ORDER_ID, product_id: null, name: "Pistachio Baklava Gift Box", variant: "500 g", unit_price: 0, qty: 2, note: "less sweet", created_at: now },
      { id: "t2", order_id: KOT_TEST_ORDER_ID, product_id: null, name: "Kunafa with Cheese", variant: null, unit_price: 0, qty: 1, note: null, created_at: now },
      { id: "t3", order_id: KOT_TEST_ORDER_ID, product_id: null, name: "Nutella Nest", variant: "Box of 6", unit_price: 0, qty: 3, note: null, created_at: now },
    ],
  } as unknown as Order;
}

export const KOT_SIZE_LABEL: Record<KotWidth, string> = { "58": SIZES["58"].label, "80": SIZES["80"].label };

function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
}

function kotCss(z: (typeof SIZES)[KotWidth], scope: string): string {
  return `
  ${scope}, ${scope} * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  ${scope} {
    width: ${z.printable}mm; margin: 0 auto; padding: 3mm 0 8mm; background: #fff; color: #000;
    font-family: "Courier New", Courier, ui-monospace, monospace;
    font-size: ${z.font}px; line-height: 1.3; font-weight: 700;
    overflow-wrap: anywhere;
  }
  ${scope} .c { text-align: center; }
  ${scope} .title { font-size: ${z.font + 2}px; letter-spacing: 3px; }
  ${scope} .num { font-size: ${z.big}px; line-height: 1.15; margin: 2px 0; }
  ${scope} .tag { display: inline-block; border: 2px solid #000; padding: 1px 8px; margin-top: 3px; letter-spacing: 1px; }
  ${scope} .rule { border-top: 2px dashed #000; margin: 6px 0; }
  ${scope} .item { display: flex; gap: 6px; margin: 5px 0 1px; font-size: ${z.font + 2}px; }
  ${scope} .qty { min-width: ${z.font * 2.4}px; white-space: nowrap; }
  ${scope} .name { flex: 1; }
  ${scope} .note { margin: 1px 0 4px ${z.font * 2.4 + 6}px; padding-left: 5px; border-left: 3px solid #000; font-weight: 700; }
  ${scope} .box { border: 2px solid #000; padding: 3px 5px; margin: 4px 0; }
  ${scope} .box b { display: block; }
  ${scope} .test { border: 2px solid #000; text-align: center; padding: 2px 0; margin-bottom: 4px; letter-spacing: 1px; }
  ${scope} .edge { border-left: 3px solid #000; border-right: 3px solid #000; text-align: center; padding: 3px 0; margin-top: 8px; font-size: ${z.font - 1}px; }
  ${scope} .total { border: 2px solid #000; padding: 4px 0; margin-top: 4px; font-size: ${z.font + 3}px; letter-spacing: 1px; }`;
}

function kotBody(order: Order, width: KotWidth): string {
  const items = order.order_items ?? [];
  const pickup = order.delivery_type === "pickup";
  const isTest = order.id === KOT_TEST_ORDER_ID;
  const totalQty = items.reduce((n, i) => n + i.qty, 0);

  const itemRows = items
    .map(
      (i) => `
    <div class="item">
      <span class="qty">${i.qty}x</span>
      <span class="name">${esc(i.name)}${i.variant ? ` (${esc(i.variant)})` : ""}</span>
    </div>${i.note ? `\n    <div class="note">NOTE: ${esc(i.note)}</div>` : ""}`,
    )
    .join("");

  return `
  ${isTest ? '<div class="test">*** TEST PRINT ***<br>NOT A REAL ORDER</div>' : ""}
  <div class="c title">KOT</div>
  <div class="c num">#${esc(order.order_number)}</div>
  <div class="c"><span class="tag">${pickup ? "PICKUP" : "DELIVERY"}</span></div>
  <div class="rule"></div>
  <div>${esc(when(order.created_at))}</div>
  <div>${esc(order.customer_name)}</div>
  <div class="rule"></div>
  ${itemRows || "<div>(no items)</div>"}
  <div class="rule"></div>
  ${order.notes ? `<div class="box"><b>ORDER NOTE:</b>${esc(order.notes)}</div>` : ""}
  ${order.admin_notes ? `<div class="box"><b>STAFF NOTE:</b>${esc(order.admin_notes)}</div>` : ""}
  <div class="c total">TOTAL ITEMS: ${totalQty}</div>
  ${
    isTest
      ? `<div class="edge">${width === "58" ? "2 INCH" : "3 INCH"} - EDGE CHECK<br>Both side lines must be visible</div>
  <div class="c" style="margin-top:6px">*** END OF TEST ***</div>`
      : ""
  }`;
}

/** A complete page showing the slip. Used for the on-screen preview in Settings. */
export function buildKotHtml(order: Order, width: KotWidth): string {
  const z = SIZES[width];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KOT ${esc(order.order_number)}</title>
<style>
  html, body { margin: 0; padding: 0; background: #fff; }
  ${kotCss(z, "body")}
  @media screen { body { margin: 8px auto; outline: 1px dashed #aaa; } }
</style></head>
<body>${kotBody(order, width)}</body></html>`;
}

const PRINT_ROOT_ID = "kot-print-root";
const PRINT_STYLE_ID = "kot-print-style";

function removePrintNodes() {
  document.getElementById(PRINT_ROOT_ID)?.remove();
  document.getElementById(PRINT_STYLE_ID)?.remove();
}

/**
 * Prints one KOT on the given paper size.
 *
 * The slip is placed on the current page and everything else is hidden while printing, then the normal
 * print dialog opens. This works the same on phones and computers, and "Save as PDF" works everywhere
 * (a separate pop-up window, which this used to open, fails on many phones). The page height is measured so
 * the paper (or PDF) is exactly as long as the slip. Call it straight from a click or tap.
 */
export function printKot(order: Order, width: KotWidth): void {
  if (typeof window === "undefined") return;
  removePrintNodes();

  const z = SIZES[width];
  const sel = `#${PRINT_ROOT_ID}`;
  const root = document.createElement("div");
  root.id = PRINT_ROOT_ID;
  root.innerHTML = kotBody(order, width);

  // On screen the slip sits off-screen and invisible (so it can be measured); only printing shows it.
  const base = `
  ${sel} { position: fixed; left: -10000px; top: 0; visibility: hidden; }
  ${kotCss(z, sel)}
  @media print {
    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; height: auto !important; min-height: 0 !important; overflow: visible !important; }
    body > *:not(${sel}) { display: none !important; }
    ${sel} { position: static !important; left: auto !important; visibility: visible !important; }
  }`;
  const style = document.createElement("style");
  style.id = PRINT_STYLE_ID;
  style.textContent = base;
  document.head.appendChild(style);
  document.body.appendChild(root);

  // Paper exactly as long as the slip (96 px = 25.4 mm).
  const heightMm = Math.ceil((root.offsetHeight * 25.4) / 96) + 4;
  style.textContent = `@page { size: ${z.page}mm ${heightMm}mm; margin: 0; }\n${base}`;

  // Clean up a little after the dialog closes. The delay lets phones finish saving the PDF first.
  window.addEventListener("afterprint", () => window.setTimeout(removePrintNodes, 3000), { once: true });
  window.setTimeout(removePrintNodes, 5 * 60_000);

  window.print();
}
