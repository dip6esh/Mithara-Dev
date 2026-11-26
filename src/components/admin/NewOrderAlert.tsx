import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, BellOff, BellRing, Phone, MapPin, ShoppingBag, Volume2, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { formatINR } from "../../lib/enquiry";
import { PAYMENT_TONE_CLASS, paymentSummary } from "../../lib/orderFlow";
import {
  isAudioBlocked,
  playOrderChime,
  setSoundEnabled,
  startRinging,
  stopRinging,
  unlockAudio,
  useSoundEnabled,
} from "../../lib/orderSound";
import { hasSeenOrder, markOrdersSeenForTeam } from "../../lib/seenOrders";
import { cacheSet } from "../../lib/adminCache";
import { KITCHEN_CACHE_KEY } from "../../lib/kitchen";
import type { Order } from "../../lib/types";

/* ------------------------------------------------------------------ */
/*  Shared state. Lives outside React because every admin page mounts   */
/*  its own AdminLayout: this keeps the queue and the "already seen"    */
/*  list alive while the admin navigates between pages.                 */
/* ------------------------------------------------------------------ */
const EMPTY: Order[] = [];
const QUEUE_LIMIT = 50;
let known: Set<string> | null = null;
let queue: Order[] = EMPTY;
/** Goes up every time new orders arrive. The bell rings once per arrival, never when an order is acknowledged. */
let arrivalSeq = 0;
/** When each queued order showed up here (ms). 0 = was already waiting when the page loaded: no "NEW" tag. */
const arrivedAt = new Map<string, number>();
const NEW_TAG_MS = 60_000;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function dismissAll() {
  markOrdersSeenForTeam(queue.map((o) => o.id));
  queue = EMPTY;
  arrivedAt.clear();
  stopRinging();
  emit();
}

/** Acknowledge one order. The rest stay on screen; the bell stops only once none are left. */
function dismissOne(id: string) {
  markOrdersSeenForTeam([id]);
  const next = queue.filter((o) => o.id !== id);
  arrivedAt.delete(id);
  queue = next.length > 0 ? next : EMPTY;
  if (next.length === 0) stopRinging();
  emit();
}

/**
 * An order the team has already dealt with: acknowledged by anyone on the team (alert_seen_at) or on this
 * browser (Got it / Dismiss / View orders, or any tap on the Kitchen board), or already being prepared /
 * ready on the kitchen board. These never pop up or ring again, not even after a refresh.
 */
const alreadyHandled = (o: Order) =>
  !!o.alert_seen_at ||
  hasSeenOrder(o.id) ||
  o.kitchen_status === "preparing" ||
  o.kitchen_status === "ready";

/**
 * Looks for "Order received" orders that nobody has acknowledged yet. A refresh or a restart still shows
 * an order that was never seen (an unattended order must never be hidden), but not one that was.
 * Orders handled elsewhere (acknowledged on another device, started in the kitchen) drop out on the next check.
 */
async function checkForNewOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("status", "new")
    .order("created_at", { ascending: false })
    .limit(QUEUE_LIMIT);
  if (error || !data) return;
  const fetched = data as Order[];
  // This check already loads every open order with its items: hand it to the Kitchen board so it opens instantly.
  cacheSet(KITCHEN_CACHE_KEY, [...fetched].reverse());
  const rows = fetched.filter((o) => !alreadyHandled(o));
  const live = new Set(rows.map((o) => o.id));

  if (!known) {
    known = new Set(live);
    if (rows.length > 0) {
      rows.forEach((o) => arrivedAt.set(o.id, 0));
      queue = rows;
      arrivalSeq += 1;
      emit();
    }
    return;
  }

  const fresh = rows.filter((o) => !known!.has(o.id));
  rows.forEach((o) => known!.add(o.id));
  // Only prune when the list was not cut off by the limit, otherwise an old order could drop out by mistake.
  const stillWaiting = fetched.length < QUEUE_LIMIT ? queue.filter((q) => live.has(q.id)) : queue;
  const pruned = stillWaiting.length !== queue.length;
  if (pruned) queue.filter((q) => !live.has(q.id)).forEach((q) => arrivedAt.delete(q.id));

  if (fresh.length > 0) {
    const now = Date.now();
    fresh.forEach((o) => arrivedAt.set(o.id, now));
    queue = [...fresh, ...stillWaiting.filter((q) => !fresh.some((f) => f.id === q.id))];
    arrivalSeq += 1;
    emit();
  } else if (pruned) {
    queue = stillWaiting.length > 0 ? stillWaiting : EMPTY;
    if (stillWaiting.length === 0) stopRinging();
    emit();
  }
}

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function addressLine(o: Order): string {
  const a = o.address_snapshot;
  if (!a) return "";
  return [a.flat, a.building, a.street, a.area, a.city, a.pincode].filter(Boolean).join(", ");
}

/** Bell button for the admin header: turns the new-order sound on or off (and plays a test ring). */
export function OrderSoundToggle({ tone = "light" }: { tone?: "light" | "dark" }) {
  const on = useSoundEnabled();
  const Icon = on ? BellRing : BellOff;
  return (
    <button
      type="button"
      onClick={() => {
        unlockAudio();
        const next = !on;
        setSoundEnabled(next);
        if (next) playOrderChime(); // test ring, also proves the browser allows sound
      }}
      aria-pressed={on}
      title={on ? "New-order sound is on (click to mute)" : "New-order sound is muted (click to turn on)"}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors sm:text-xs ${
        tone === "dark"
          ? "border-white/15 bg-white/10 text-white hover:bg-white/15"
          : "border-border bg-card text-foreground hover:border-[#d39c54]"
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">{on ? "Sound on" : "Muted"}</span>
    </button>
  );
}

/**
 * Pop-up + repeating sound whenever a new order arrives, on every admin page.
 * Detects orders through Supabase Realtime, with a 15 s poll as a fallback.
 */
export function NewOrderAlert() {
  const navigate = useNavigate();
  const orders = useSyncExternalStore(
    subscribe,
    () => queue,
    () => EMPTY,
  );
  const soundOn = useSoundEnabled();
  const [blocked, setBlocked] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [, tick] = useState(0);
  const count = orders.length;

  // Detection
  useEffect(() => {
    void checkForNewOrders();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void checkForNewOrders(), 400);
    };
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`admin-new-order-alert-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, schedule)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, schedule)
        .subscribe();
    } catch {
      /* polling below still catches new orders */
    }
    const poll = setInterval(() => void checkForNewOrders(), 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkForNewOrders();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // Browsers need one tap before they allow sound. iPhones only accept a finished tap (touchend / click),
  // and drop the permission again after a screen lock or app switch, so keep listening instead of "once".
  useEffect(() => {
    const unlock = () => unlockAudio();
    const events = ["touchend", "click", "pointerup", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, unlock, { passive: true }));
    const onVisible = () => {
      if (document.visibilityState === "visible") setBlocked(isAudioBlocked());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      events.forEach((e) => window.removeEventListener(e, unlock));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Ring when new orders arrive, then remind every 90 s until every order is acknowledged.
  // The key is the arrival number, so acknowledging one order never makes the bell ring again.
  const batch = String(arrivalSeq);
  useEffect(() => {
    if (count > 0 && soundOn) startRinging(batch);
    else stopRinging();
  }, [count, soundOn, batch]);

  // "Dismiss all" needs a second tap (when several orders wait) so nobody clears orders they never saw.
  useEffect(() => setConfirmAll(false), [count]);
  useEffect(() => {
    if (!confirmAll) return;
    const t = setTimeout(() => setConfirmAll(false), 4000);
    return () => clearTimeout(t);
  }, [confirmAll]);
  const requestDismissAll = () => {
    if (count > 1 && !confirmAll) {
      setConfirmAll(true);
      return;
    }
    dismissAll();
  };

  // Tab title + "is sound blocked?" + live "x min ago" while the popup is open.
  useEffect(() => {
    if (count === 0) {
      setBlocked(false);
      return;
    }
    const original = document.title;
    let flip = false;
    const t = setInterval(() => {
      flip = !flip;
      document.title = flip ? `🔔 ${count} new order${count > 1 ? "s" : ""}!` : original;
      setBlocked(isAudioBlocked());
      tick((n) => n + 1);
    }, 1000);
    setBlocked(isAudioBlocked());
    return () => {
      clearInterval(t);
      document.title = original;
    };
  }, [count]);

  const viewOrders = useCallback(() => {
    dismissAll();
    navigate({ to: "/admin/orders" });
  }, [navigate]);

  if (count === 0) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="new-order-title"
      className="adm-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-[#1c1733]/75 p-4 backdrop-blur-sm"
      onTouchEnd={unlockAudio}
      onClick={unlockAudio}
    >
      <div className="adm-modal relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900 text-neutral-200 shadow-2xl">
        <div className="flex items-center gap-4 border-b border-neutral-800 p-5 pr-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/30">
            <Bell className="adm-bell h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="new-order-title" className="font-serif text-xl font-bold text-neutral-100">
              {count === 1 ? "New order received!" : `${count} new orders received!`}
            </h2>
            <p className="text-xs text-neutral-400">
              {count > 1
                ? "Tap Got it on each order once you’ve seen it. The bell keeps reminding until you do."
                : "Open the order, confirm it and start baking."}
            </p>
          </div>
          <button
            type="button"
            onClick={requestDismissAll}
            aria-label="Dismiss all"
            className="ml-auto shrink-0 self-start rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {blocked && soundOn && (
          <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-950 px-5 py-2.5 text-xs text-neutral-200">
            <Volume2 className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
            <span>Your browser is blocking sound. Tap anywhere on this window to hear the bell. On iPhone, also turn the silent switch off.</span>
          </div>
        )}

        <ul className="flex-1 space-y-3 overflow-y-auto p-5">
          {orders.map((o) => {
            const pay = paymentSummary(o);
            const addr = addressLine(o);
            const isNew = (arrivedAt.get(o.id) ?? 0) > Date.now() - NEW_TAG_MS;
            return (
              <li
                key={o.id}
                className={`rounded-2xl border bg-neutral-950 p-4 ${
                  isNew ? "border-amber-500/70 shadow-lg shadow-amber-500/10" : "border-neutral-800"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-100">
                      {o.order_number}
                      {isNew && (
                        <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-foreground">
                          New
                        </span>
                      )}
                      <span className="ml-2 rounded-full border border-neutral-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                        {o.delivery_type}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-400">{ago(o.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-serif text-xl font-bold tabular-nums text-neutral-100">{formatINR(o.total_inr)}</p>
                    <span
                      className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PAYMENT_TONE_CLASS[pay.tone]}`}
                    >
                      {pay.label}
                    </span>
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-xs text-neutral-300">
                  <p className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden="true" />
                    {o.customer_name} · {o.customer_phone}
                  </p>
                  {o.delivery_type === "delivery" && addr && (
                    <p className="flex items-start gap-1.5">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden="true" />
                      {addr}
                    </p>
                  )}
                </div>

                {o.order_items && o.order_items.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-dashed border-neutral-800 pt-3 text-sm">
                    {o.order_items.map((it) => (
                      <li key={it.id}>
                        <div className="flex justify-between gap-3">
                          <span className="min-w-0 text-neutral-200">
                            {it.name}
                            {it.variant ? <span className="text-neutral-400"> · {it.variant}</span> : null}
                            <span className="text-neutral-400"> × {it.qty}</span>
                          </span>
                          <span className="shrink-0 tabular-nums text-neutral-300">{formatINR(it.unit_price * it.qty)}</span>
                        </div>
                        {it.note && (
                          <p className="mt-1 rounded-lg border-l-2 border-amber-500 bg-neutral-900 px-2.5 py-1 text-xs font-medium text-amber-300">
                            Note: {it.note}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {o.notes && (
                  <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-neutral-900 px-3 py-2 text-xs text-neutral-300">
                    Order note: {o.notes}
                  </p>
                )}

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => dismissOne(o.id)}
                    className="rounded-lg border border-neutral-700 px-3.5 py-1.5 text-xs font-semibold text-neutral-200 hover:border-amber-500/50 hover:text-neutral-100"
                  >
                    Got it
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col-reverse gap-2 border-t border-neutral-800 p-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={requestDismissAll}
            className="rounded-xl border border-neutral-800 px-5 py-2.5 text-sm font-medium text-neutral-300 hover:border-amber-500/40 hover:text-neutral-100"
          >
            {confirmAll ? `Tap again to dismiss all ${count}` : count > 1 ? `Dismiss all (${count})` : "Dismiss"}
          </button>
          <button
            type="button"
            onClick={viewOrders}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-gold-foreground shadow-lg shadow-amber-500/20 hover:bg-amber-400"
          >
            <ShoppingBag className="h-4 w-4" aria-hidden="true" />
            View orders
          </button>
        </div>
      </div>
    </div>
  );
}
