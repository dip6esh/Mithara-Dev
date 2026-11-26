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
import type { Order } from "./types";

export type KotWidth = "58" | "80";

const SIZES: Record<KotWidth, { page: number; printable: number; font: number; big: number; label: string }> = {
  "58": { page: 58, printable: 48, font: 12, big: 22, label: "2 inch" },
  "80": { page: 80, printable: 72, font: 15, big: 28, label: "3 inch" },
};

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

export function buildKotHtml(order: Order, width: KotWidth, autoPrint: boolean): string {
  const z = SIZES[width];
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

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KOT ${esc(order.order_number)}</title>
<style>
  @page { size: ${z.page}mm auto; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body {
    width: ${z.printable}mm; margin: 0 auto; padding: 3mm 0 8mm;
    font-family: "Courier New", Courier, ui-monospace, monospace;
    font-size: ${z.font}px; line-height: 1.3; font-weight: 700;
    overflow-wrap: anywhere;
  }
  .c { text-align: center; }
  .title { font-size: ${z.font + 2}px; letter-spacing: 3px; }
  .num { font-size: ${z.big}px; line-height: 1.15; margin: 2px 0; }
  .tag { display: inline-block; border: 2px solid #000; padding: 1px 8px; margin-top: 3px; letter-spacing: 1px; }
  .rule { border-top: 2px dashed #000; margin: 6px 0; }
  .item { display: flex; gap: 6px; margin: 5px 0 1px; font-size: ${z.font + 2}px; }
  .qty { min-width: ${z.font * 2.4}px; white-space: nowrap; }
  .name { flex: 1; }
  .note { margin: 1px 0 4px ${z.font * 2.4 + 6}px; padding-left: 5px; border-left: 3px solid #000; font-weight: 700; }
  .box { border: 2px solid #000; padding: 3px 5px; margin: 4px 0; }
  .box b { display: block; }
  .test { border: 2px solid #000; text-align: center; padding: 2px 0; margin-bottom: 4px; letter-spacing: 1px; }
  .edge { border-left: 3px solid #000; border-right: 3px solid #000; text-align: center; padding: 3px 0; margin-top: 8px; font-size: ${z.font - 1}px; }
  .total { border: 2px solid #000; padding: 4px 0; margin-top: 4px; font-size: ${z.font + 3}px; letter-spacing: 1px; }
  @media screen { body { margin: 8px auto; outline: 1px dashed #aaa; } }
</style></head>
<body>
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
  }
  ${
    autoPrint
      ? `<script>
    window.onafterprint = function () { window.close(); };
    window.onload = function () { setTimeout(function () { window.focus(); window.print(); }, 150); };
  </script>`
      : ""
  }
</body></html>`;
}

/**
 * Opens the print dialog for one KOT. Must be called straight from a click / tap (browsers block
 * pop-ups otherwise). Falls back to a hidden frame if the pop-up is blocked.
 */
export function printKot(order: Order, width: KotWidth): void {
  if (typeof window === "undefined") return;

  const popup = window.open("", "_blank", "width=420,height=640");
  if (popup) {
    popup.document.open();
    popup.document.write(buildKotHtml(order, width, true));
    popup.document.close();
    return;
  }

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(frame);
  const win = frame.contentWindow;
  if (!win) {
    frame.remove();
    return;
  }
  win.document.open();
  win.document.write(buildKotHtml(order, width, false));
  win.document.close();
  const done = () => window.setTimeout(() => frame.remove(), 500);
  win.onafterprint = done;
  window.setTimeout(() => {
    win.focus();
    win.print();
    window.setTimeout(done, 60_000);
  }, 200);
}
