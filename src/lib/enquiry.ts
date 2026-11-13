/**
 * Mithara — WhatsApp order / enquiry list (no backend).
 *
 * Flow: the visitor picks items and quantities, then chooses "Place an order" or "Ask a question".
 * Either way a prefilled WhatsApp message is opened and everything else (availability, delivery or
 * pickup, date and time, payment) is settled in the chat.
 *
 * Everything here is plain TypeScript with no React and no browser access at import time,
 * so it is safe during server-side rendering. The enquiry list lives in React state and is
 * mirrored to localStorage (guarded) so it survives a refresh. Nothing is ever sent anywhere
 * except via a wa.me link that the visitor taps themselves.
 */

/** Country code + number, digits only (no "+", spaces or dashes). */
export const WHATSAPP_NUMBER = "919619617888";
export const WHATSAPP_DISPLAY = "+91 96196 17888";

export const STORAGE_KEY = "mithara.enquiry.v1";
export const MAX_QTY = 999;
export const MAX_LINES = 40;
export const MAX_ITEM_NOTE = 120;
export const MAX_NOTES = 600;
/** If the encoded wa.me link gets longer than this we fall back to a shorter message. */
export const MAX_URL_LENGTH = 3500;

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type PriceOption = { id: string; label: string; amount: number | null };
export type Pricing = { tiered: boolean; options: PriceOption[] };

export type EnquiryLine = {
  key: string;
  category: string;
  name: string;
  /** Pack size such as "12 pc". Empty for single-price items. */
  variant: string;
  /** Price per unit at the time it was added. null when it could not be read. */
  unitPrice: number | null;
  qty: number;
  note: string;
};

export type EnquiryMode = "order" | "enquiry";

export type EnquiryForm = {
  /** null until the visitor chooses. */
  mode: EnquiryMode | null;
  /** The visitor's own words. Used for the "enquiry" path only. */
  question: string;
};

export const DEFAULT_FORM: EnquiryForm = {
  mode: null,
  question: "",
};

/* -------------------------------------------------------------------------- */
/*  Prices                                                                     */
/* -------------------------------------------------------------------------- */

function toAmount(s: string): number | null {
  const digits = s.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Understands the two price formats used on the menu:
 *   "₹ 535/-"                                   → one option, no label
 *   "6pc/9pc/12pc/18pc - ₹700/₹975/₹1225/₹1800" → four pack-size options
 * Anything unreadable falls back to a single option with an unknown amount.
 */
export function parsePricing(price: string): Pricing {
  const m = price.match(/^(.+?)\s*-\s*(.+)$/);
  if (m && m[1].includes("/") && m[2].includes("/")) {
    const labels = m[1].split("/").map((s) => s.trim());
    const amounts = m[2].split("/").map((s) => s.trim());
    if (labels.length === amounts.length && labels.every(Boolean)) {
      return {
        tiered: true,
        options: labels.map((l, i) => ({
          id: l.toLowerCase().replace(/\s+/g, ""),
          label: l.replace(/(\d)\s*pc/i, "$1 pc"),
          amount: toAmount(amounts[i]),
        })),
      };
    }
  }
  return { tiered: false, options: [{ id: "std", label: "", amount: toAmount(price) }] };
}

export function formatINR(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
}

export function makeKey(category: string, name: string, variantId: string): string {
  return `${category}|${name}|${variantId}`;
}

export function estimateTotal(lines: EnquiryLine[]): { total: number; hasUnpriced: boolean } {
  let total = 0;
  let hasUnpriced = false;
  for (const l of lines) {
    if (l.unitPrice == null) hasUnpriced = true;
    else total += l.unitPrice * l.qty;
  }
  return { total, hasUnpriced };
}

export function clampQty(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_QTY, Math.max(1, Math.floor(n)));
}

/* -------------------------------------------------------------------------- */
/*  Validation + message                                                       */
/* -------------------------------------------------------------------------- */

export function validateEnquiry(lines: EnquiryLine[], form: EnquiryForm): string[] {
  const errors: string[] = [];
  if (!form.mode) {
    errors.push("Choose whether you'd like to place an order or ask a question.");
    return errors;
  }
  if (form.mode === "order" && lines.length === 0) {
    errors.push("Add at least one item from the menu to place an order.");
  }
  if (form.mode === "enquiry" && form.question.trim() === "") {
    errors.push("Type your question so we know how to help.");
  }
  return errors;
}

const clean = (s: string) => s.replace(/\r/g, "").trim();

function itemLines(lines: EnquiryLine[], compact: boolean): string[] {
  const out: string[] = [];
  lines.forEach((l, idx) => {
    const variant = l.variant ? ` — ${l.variant}` : "";
    const price = !compact && l.unitPrice != null ? ` (${formatINR(l.unitPrice)})` : "";
    out.push(`${idx + 1}. ${l.name}${variant} × ${l.qty}${price}`);
    if (!compact && clean(l.note)) out.push(`   Note: ${clean(l.note)}`);
  });
  const { total, hasUnpriced } = estimateTotal(lines);
  if (!compact && total > 0) {
    out.push("");
    out.push(
      `*Estimated total:* ${formatINR(total)}${hasUnpriced ? " + items on request" : ""} (to be confirmed)`,
    );
  }
  return out;
}

export function buildMessage(
  lines: EnquiryLine[],
  form: EnquiryForm,
  opts: { compact?: boolean } = {},
): string {
  const compact = !!opts.compact;
  const out: string[] = [];

  out.push("Hello Mithara! 👋");

  if (form.mode === "order") {
    out.push("I'd like to place an order for these items:");
    out.push("");
    out.push(...itemLines(lines, compact));
    out.push("");
    out.push("Please confirm availability and let me know the next steps.");
    out.push("Thank you!");
    return out.join("\n");
  }

  // Enquiry
  out.push("I have a question:");
  out.push("");
  out.push(clean(form.question));
  if (lines.length) {
    out.push("");
    out.push("*Items I'm asking about*");
    out.push(...itemLines(lines, compact));
  }
  out.push("");
  out.push("Thank you!");
  return out.join("\n");
}

export function whatsappUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

/** Full message when it fits comfortably in a link, otherwise a shorter one. */
export function finalMessage(
  lines: EnquiryLine[],
  form: EnquiryForm,
): { message: string; url: string; shortened: boolean } {
  const full = buildMessage(lines, form);
  const fullUrl = whatsappUrl(full);
  if (fullUrl.length <= MAX_URL_LENGTH) return { message: full, url: fullUrl, shortened: false };
  const short = buildMessage(lines, form, { compact: true });
  return { message: short, url: whatsappUrl(short), shortened: true };
}

/* -------------------------------------------------------------------------- */
/*  Storage (never throws)                                                     */
/* -------------------------------------------------------------------------- */

type Stored = {
  v: 1;
  lines: EnquiryLine[];
};

function sanitizeLine(raw: unknown): EnquiryLine | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.key !== "string" || typeof r.name !== "string" || typeof r.category !== "string") {
    return null;
  }
  const qty = typeof r.qty === "number" ? r.qty : NaN;
  if (!Number.isFinite(qty) || qty < 1) return null;
  return {
    key: r.key.slice(0, 200),
    category: r.category.slice(0, 40),
    name: r.name.slice(0, 120),
    variant: typeof r.variant === "string" ? r.variant.slice(0, 40) : "",
    unitPrice: typeof r.unitPrice === "number" && r.unitPrice > 0 ? r.unitPrice : null,
    qty: clampQty(qty),
    note: typeof r.note === "string" ? r.note.slice(0, MAX_ITEM_NOTE) : "",
  };
}

export function loadStored(): Pick<Stored, "lines"> | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Stored>;
    if (!data || data.v !== 1) return null;

    const seen = new Set<string>();
    const lines: EnquiryLine[] = [];
    for (const item of Array.isArray(data.lines) ? data.lines : []) {
      const line = sanitizeLine(item);
      if (line && !seen.has(line.key) && lines.length < MAX_LINES) {
        seen.add(line.key);
        lines.push(line);
      }
    }
    return { lines };
  } catch {
    return null;
  }
}

export function saveStored(data: Pick<Stored, "lines">): void {
  try {
    if (typeof window === "undefined") return;
    const payload: Stored = { v: 1, ...data };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* Private mode / storage full / blocked: the list simply stays in memory for this visit. */
  }
}
