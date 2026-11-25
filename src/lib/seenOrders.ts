import { supabase } from "./supabase";

/**
 * Remembers which orders have already been acknowledged ("Got it" / "Dismiss" / "View orders",
 * or a tap on the Kitchen board), so the new-order pop-up and bell do not fire again for them.
 *
 * Two layers:
 *  - the database (orders.alert_seen_at, migration 013): shared by the whole team, on every browser
 *    and device, so one person acknowledging an order clears it for everyone;
 *  - this browser's storage: instant, and the fallback if the database could not be written
 *    (offline, or migration 013 not run yet). Capped so it never grows without limit.
 */
const KEY = "mithara-admin-seen-orders";
const MAX = 300;
let cache: Set<string> | null = null;

function read(): Set<string> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set(); // storage unavailable: acknowledgements last until the next refresh
  }
}

export function hasSeenOrder(id: string): boolean {
  return (cache ??= read()).has(id);
}

export function markOrdersSeen(ids: string[]) {
  if (ids.length === 0) return;
  const set = (cache ??= read());
  ids.forEach((id) => set.add(id));
  // A Set remembers insertion order, so this keeps the most recent acknowledgements.
  const kept = [...set].slice(-MAX);
  cache = new Set(kept);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    /* ignore */
  }
}

/** Acknowledge orders for the whole team (database) and this browser (instant, works offline). */
export function markOrdersSeenForTeam(ids: string[]) {
  if (ids.length === 0) return;
  markOrdersSeen(ids);
  void supabase
    .from("orders")
    .update({ alert_seen_at: new Date().toISOString() })
    .in("id", ids)
    .is("alert_seen_at", null)
    .then(({ error }) => {
      if (error) console.warn("Could not share the 'seen' mark with the team (run migration 013):", error.message);
    });
}

// Acknowledged in another tab of the same browser: pick it up on the next check.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) cache = null;
  });
}
