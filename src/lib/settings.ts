import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import type { PaymentMode } from "./types";

/** Settings the storefront needs to decide whether orders can be placed and at what fee. */
export type StoreSettings = {
  holiday_mode: boolean;
  holiday_message: string;
  payment_mode: PaymentMode;
  delivery_fee_flat: number;
  free_delivery_above: number;
  order_cutoff_time: string;
  /** "HH:MM" (IST). Orders stay closed from the cutoff until this time. Empty = reopens at midnight. */
  order_reopen_time: string;
  /** Tax (e.g. GST). Configured in Admin > Settings. Off until the owner switches it on. */
  tax_enabled: boolean;
  tax_rate_percent: number;
  tax_label: string;
  /** true = menu prices already include tax (shown, not added). false = tax is added at checkout. */
  tax_inclusive: boolean;
};

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  holiday_mode: false,
  holiday_message: "",
  payment_mode: "demo",
  delivery_fee_flat: 100,
  free_delivery_above: 1500,
  order_cutoff_time: "",
  order_reopen_time: "",
  tax_enabled: false,
  tax_rate_percent: 5,
  tax_label: "GST",
  tax_inclusive: false,
};

/**
 * Settings are stored as JSON. Older saves from the admin page were double-encoded
 * (the string "100" instead of the number 100), so accept both shapes.
 */
export function unwrapSetting(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

const asBool = (raw: unknown, d: boolean) => {
  const v = unwrapSetting(raw);
  return typeof v === "boolean" ? v : d;
};
const asNum = (raw: unknown, d: number) => {
  const v = unwrapSetting(raw);
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : d;
};
const asStr = (raw: unknown, d: string) => {
  const v = unwrapSetting(raw);
  return typeof v === "string" ? v : d;
};

/** Reads ordering-related settings. Throws when the database cannot be reached. */
async function readStoreSettings(): Promise<StoreSettings> {
  {
    const { data, error } = await supabase.from("site_settings").select("key, value");
    if (error) throw error;
    const map = new Map<string, unknown>((data ?? []).map((r: any) => [r.key, r.value]));
    const payment_mode = asStr(map.get("payment_mode"), "demo") === "live" ? "live" : "demo";
    return {
      holiday_mode: asBool(map.get("holiday_mode"), false),
      holiday_message: asStr(map.get("holiday_message"), ""),
      payment_mode,
      delivery_fee_flat: asNum(map.get("delivery_fee_flat"), 100),
      free_delivery_above: asNum(map.get("free_delivery_above"), 1500),
      order_cutoff_time: asStr(map.get("order_cutoff_time"), ""),
      order_reopen_time: asStr(map.get("order_reopen_time"), ""),
      tax_enabled: asBool(map.get("tax_enabled"), false),
      tax_rate_percent: Math.min(100, Math.max(0, asNum(map.get("tax_rate_percent"), 5))),
      tax_label: asStr(map.get("tax_label"), "GST").trim() || "GST",
      tax_inclusive: asBool(map.get("tax_inclusive"), false),
    };
  }
}

/** Reads ordering-related settings. Never throws: falls back to safe defaults. */
export async function fetchStoreSettings(): Promise<StoreSettings> {
  try {
    return await readStoreSettings();
  } catch {
    return DEFAULT_STORE_SETTINGS;
  }
}

/* -------------------------------------------------------------------------- */
/*  Live settings: one shared copy that updates the moment the admin saves.     */
/* -------------------------------------------------------------------------- */
let current: StoreSettings = DEFAULT_STORE_SETTINGS;
const subscribers = new Set<() => void>();

/** Re-reads the settings and updates every component that shows them. Keeps the old copy if the read fails. */
export async function refreshStoreSettings(): Promise<void> {
  try {
    const next = await readStoreSettings();
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      current = next;
      subscribers.forEach((l) => l());
    }
  } catch {
    /* offline or a blip: keep showing the last known settings */
  }
}

/**
 * Always-current store settings for the storefront. Updates:
 *   - instantly, when the admin saves (Supabase Realtime on site_settings),
 *   - whenever the tab becomes visible again or the window regains focus,
 *   - and every 60 s as a fallback if Realtime is unavailable.
 * The server re-checks every rule when an order is placed, so these only affect what is shown.
 */
export function useStoreSettings(): StoreSettings {
  const settings = useSyncExternalStore(
    (l) => {
      subscribers.add(l);
      return () => {
        subscribers.delete(l);
      };
    },
    () => current,
    () => DEFAULT_STORE_SETTINGS,
  );

  useEffect(() => {
    void refreshStoreSettings();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refreshStoreSettings(), 150);
    };
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`store-settings-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "site_settings" }, soon)
        .subscribe();
    } catch {
      /* the focus refresh and 60 s poll below still keep it current */
    }
    const poll = setInterval(() => void refreshStoreSettings(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshStoreSettings();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return settings;
}

/** "20:30" -> minutes since midnight, or null when empty / invalid. */
function toMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  return h <= 23 && min <= 59 ? h * 60 + min : null;
}

/** 360 -> "6:00 AM" */
function clock12(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * True when the store is closed for orders (IST), using the same rules as the server's
 * store_closed_reason(): holiday mode, or inside the closed window from the order cutoff until the
 * reopen time. Both times are optional (cutoff only = closed until midnight, reopen only = closed
 * from midnight until it).
 */
export function isStoreClosed(s: StoreSettings): { closed: boolean; reason: string } {
  if (s.holiday_mode) return { closed: true, reason: s.holiday_message || "We are closed right now." };

  const cutoff = toMinutes(s.order_cutoff_time);
  const reopen = toMinutes(s.order_reopen_time);
  if (cutoff === null && reopen === null) return { closed: false, reason: "" };

  const now = new Date();
  // These are business-hours rules for Mumbai (IST). Compare in IST whatever the visitor's timezone.
  const ist = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000);
  const t = ist.getHours() * 60 + ist.getMinutes();

  let closed = false;
  if (cutoff !== null && reopen !== null) {
    if (cutoff > reopen) closed = t > cutoff || t < reopen; // overnight closure
    else if (cutoff < reopen) closed = t > cutoff && t < reopen; // closed for part of the same day
  } else if (cutoff !== null) {
    closed = t > cutoff;
  } else if (reopen !== null) {
    closed = t < reopen;
  }
  if (!closed) return { closed: false, reason: "" };

  return {
    closed: true,
    reason:
      reopen !== null
        ? `Orders are closed right now. We reopen at ${clock12(reopen)}.`
        : "Orders for today are closed. Please order again tomorrow.",
  };
}

/** Delivery fee preview using the same rules as the server-side place_order function. */
export function previewDeliveryFee(
  subtotal: number,
  deliveryType: "delivery" | "pickup",
  s: StoreSettings,
): number {
  if (deliveryType === "pickup") return 0;
  if (s.free_delivery_above > 0 && subtotal >= s.free_delivery_above) return 0;
  return Math.max(0, s.delivery_fee_flat);
}

export type TaxPreview = {
  /** Amount of tax in the order. 0 when tax is off. */
  tax: number;
  label: string;
  rate: number;
  /** true when prices already include tax (tax is shown but not added to the total). */
  inclusive: boolean;
};

/** Tax preview using the same rules as the server-side place_order function. Tax applies to items, not delivery. */
export function previewTax(subtotal: number, s: StoreSettings): TaxPreview {
  const rate = s.tax_rate_percent;
  const off = { tax: 0, label: s.tax_label, rate, inclusive: s.tax_inclusive };
  if (!s.tax_enabled || rate <= 0 || subtotal <= 0) return off;
  const tax = s.tax_inclusive
    ? Math.round(subtotal - subtotal / (1 + rate / 100))
    : Math.round((subtotal * rate) / 100);
  return { ...off, tax };
}

/** Everything the cart / checkout summary needs, in one place. */
export function previewTotals(
  subtotal: number,
  deliveryType: "delivery" | "pickup",
  s: StoreSettings,
): { deliveryFee: number; tax: TaxPreview; total: number } {
  const deliveryFee = previewDeliveryFee(subtotal, deliveryType, s);
  const tax = previewTax(subtotal, s);
  const total = subtotal + deliveryFee + (tax.inclusive ? 0 : tax.tax);
  return { deliveryFee, tax, total };
}
