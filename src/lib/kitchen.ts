/**
 * Kitchen Display helpers.
 * The kitchen only ever sees orders whose status is "new" (received). Its own progress lives in
 * orders.kitchen_status and never affects revenue, invoices or stock (see migration 012).
 */
import type { KitchenStatus, Order } from "./types";

/** Cache key of the Kitchen board's order list (also filled by the new-order alert's regular check). */
export const KITCHEN_CACHE_KEY = "admin:kitchen:orders";

export const KITCHEN_STEPS: KitchenStatus[] = ["new", "preparing", "ready"];

export const KITCHEN_LABEL: Record<KitchenStatus, string> = {
  new: "New",
  preparing: "Preparing",
  ready: "Ready",
};

/** Minutes before a ticket turns amber / red. Tune to your real preparation time. */
export const LATE_AFTER_MIN = 15;
export const VERY_LATE_AFTER_MIN = 30;

/** Missing / null means "nothing started yet". */
export const kitchenStatusOf = (o: Pick<Order, "kitchen_status">): KitchenStatus =>
  o.kitchen_status === "preparing" || o.kitchen_status === "ready" ? o.kitchen_status : "new";

export const nextKitchenStatus = (s: KitchenStatus): KitchenStatus | null =>
  s === "new" ? "preparing" : s === "preparing" ? "ready" : null;

export const prevKitchenStatus = (s: KitchenStatus): KitchenStatus | null =>
  s === "ready" ? "preparing" : s === "preparing" ? "new" : null;

/** The moment this ticket's current timer started: arrival for "New", the last tap otherwise. */
export function timerStart(o: Order): number {
  const s = kitchenStatusOf(o);
  const at = s === "new" ? o.created_at : (o.kitchen_status_at ?? o.created_at);
  return new Date(at).getTime();
}

export const minutesSince = (ms: number, now: number) => Math.max(0, Math.floor((now - ms) / 60_000));

export function formatAge(mins: number): string {
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export type AgeTone = "fresh" | "late" | "very-late";
export const ageTone = (mins: number): AgeTone =>
  mins >= VERY_LATE_AFTER_MIN ? "very-late" : mins >= LATE_AFTER_MIN ? "late" : "fresh";

/** "To make now": total quantity per item (and variant) across the orders that are not ready yet. */
export function toMakeNow(orders: Order[]): Array<{ key: string; name: string; variant: string | null; qty: number }> {
  const map = new Map<string, { key: string; name: string; variant: string | null; qty: number }>();
  for (const o of orders) {
    if (kitchenStatusOf(o) === "ready") continue;
    for (const i of o.order_items ?? []) {
      const variant = i.variant?.trim() || null;
      const key = `${i.name.trim().toLowerCase()}|${(variant ?? "").toLowerCase()}`;
      const row = map.get(key) ?? { key, name: i.name.trim(), variant, qty: 0 };
      row.qty += i.qty;
      map.set(key, row);
    }
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty);
}

/** True when a Supabase error means migration 012 has not been run yet. */
export const isMissingKitchenColumn = (err: unknown) => {
  const e = err as { code?: string; message?: string } | null;
  return !!e && (e.code === "42703" || /kitchen_status/i.test(e.message ?? ""));
};

/** Kitchen has finished it and it is waiting for the team to send it out / for the customer to collect. */
export const isReadyForDispatch = (o: Pick<Order, "status" | "kitchen_status">) =>
  o.status === "new" && o.kitchen_status === "ready";

/** Wording shared by the kitchen board and the Orders list. */
export const readyLabel = (o: Pick<Order, "delivery_type">) =>
  o.delivery_type === "pickup" ? "Ready for pickup" : "Ready for delivery";
