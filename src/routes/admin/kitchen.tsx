import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  ChefHat,
  Clock,
  CookingPot,
  PackageCheck,
  RefreshCw,
  Store,
  Truck,
  Undo2,
  UtensilsCrossed,
} from "lucide-react";
import { useKitchenOrders } from "../../hooks/useKitchenOrders";
import {
  KITCHEN_LABEL,
  KITCHEN_STEPS,
  ageTone,
  formatAge,
  kitchenStatusOf,
  minutesSince,
  nextKitchenStatus,
  prevKitchenStatus,
  timerStart,
  toMakeNow,
  type AgeTone,
} from "../../lib/kitchen";
import type { KitchenStatus, Order } from "../../lib/types";

export const Route = createFileRoute("/admin/kitchen")({
  head: () => ({
    meta: [{ title: "Mithara Admin — Kitchen" }],
  }),
  component: KitchenPage,
});

const COLUMN_META: Record<
  KitchenStatus,
  { hint: string; icon: React.ComponentType<{ className?: string }>; head: string; dot: string; empty: string }
> = {
  new: {
    hint: "Just received",
    icon: UtensilsCrossed,
    head: "text-[#a8691d]",
    dot: "bg-[#d39c54]",
    empty: "No new orders. Nice and quiet.",
  },
  preparing: {
    hint: "On the counter",
    icon: CookingPot,
    head: "text-[#282345]",
    dot: "bg-[#6d5fb3]",
    empty: "Nothing being prepared right now.",
  },
  ready: {
    hint: "Waiting for handover",
    icon: PackageCheck,
    head: "text-emerald-700",
    dot: "bg-emerald-500",
    empty: "No orders waiting to be handed over.",
  },
};

const AGE_CLASS: Record<AgeTone, string> = {
  fresh: "bg-emerald-500/10 text-emerald-700",
  late: "bg-amber-500/15 text-amber-700",
  "very-late": "bg-rose-500/15 text-rose-700 animate-pulse",
};

function KitchenPage() {
  const { orders, counts, loading, busyId, setStatus, refresh } = useKitchenOrders();
  const [tab, setTab] = useState<KitchenStatus>("new");
  // Re-draw the timers every 30 s (no data is fetched for this).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const columns = useMemo(() => {
    const by: Record<KitchenStatus, Order[]> = { new: [], preparing: [], ready: [] };
    for (const o of orders) by[kitchenStatusOf(o)].push(o);
    // Longest-waiting first in every column.
    for (const s of KITCHEN_STEPS) by[s].sort((a, b) => timerStart(a) - timerStart(b));
    return by;
  }, [orders]);

  const makeNow = useMemo(() => toMakeNow(orders), [orders]);
  const open = counts.new + counts.preparing + counts.ready;

  return (
    <div className="adm-stagger space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Kitchen display</p>
          <h1 className="mt-1 flex items-center gap-2 font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            <ChefHat className="h-6 w-6 text-[#d39c54]" aria-hidden="true" />
            Kitchen
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {open === 0
              ? "The kitchen is all caught up."
              : `${open} order${open > 1 ? "s" : ""} in the kitchen · ${counts.new} to start`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-[#d39c54] disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* To make now */}
      {makeNow.length > 0 && (
        <section className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5" aria-label="To make now">
          <h2 className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">To make now</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {makeNow.map((m) => (
              <li
                key={m.key}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm"
              >
                <span className="font-serif text-base font-bold text-[#a8691d]">{m.qty}×</span>
                <span className="font-medium text-foreground">{m.name}</span>
                {m.variant && <span className="text-xs text-muted-foreground">({m.variant})</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Mobile / tablet: one column at a time */}
      <div className="grid grid-cols-3 gap-2 lg:hidden" role="tablist" aria-label="Kitchen stage">
        {KITCHEN_STEPS.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={tab === s}
            onClick={() => setTab(s)}
            className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition-colors ${
              tab === s
                ? "border-[#d39c54] bg-[#d39c54]/15 text-[#7d4d12]"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            {KITCHEN_LABEL[s]}
            <span className="ml-1.5 rounded-full bg-black/5 px-1.5 py-0.5 text-[11px]">{counts[s]}</span>
          </button>
        ))}
      </div>

      {/* Board */}
      {loading && orders.length === 0 ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-3xl border border-border bg-card" />
          ))}
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {KITCHEN_STEPS.map((s) => {
            const meta = COLUMN_META[s];
            const Icon = meta.icon;
            return (
              <section
                key={s}
                aria-label={KITCHEN_LABEL[s]}
                className={`${tab === s ? "block" : "hidden"} rounded-3xl border border-border bg-muted/40 p-3 lg:block sm:p-4`}
              >
                <header className="mb-3 hidden items-center justify-between px-1 lg:flex">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} aria-hidden="true" />
                    <h2 className={`flex items-center gap-1.5 font-serif text-lg font-semibold ${meta.head}`}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {KITCHEN_LABEL[s]}
                    </h2>
                  </div>
                  <span className="rounded-full bg-card px-2.5 py-0.5 text-xs font-semibold text-foreground shadow-sm">
                    {columns[s].length}
                  </span>
                </header>
                <p className="mb-3 hidden px-1 text-xs text-muted-foreground lg:block">{meta.hint}</p>

                {columns[s].length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                    {meta.empty}
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {columns[s].map((o) => (
                      <Ticket
                        key={o.id}
                        order={o}
                        status={s}
                        now={now}
                        busy={busyId === o.id}
                        onMove={(next) => void setStatus(o, next)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Ticket({
  order,
  status,
  now,
  busy,
  onMove,
}: {
  order: Order;
  status: KitchenStatus;
  now: number;
  busy: boolean;
  onMove: (next: KitchenStatus) => void;
}) {
  const mins = minutesSince(timerStart(order), now);
  // "Ready" tickets are only waiting for the customer: a plain timer, no alarm colours.
  const tone: AgeTone = status === "ready" ? "fresh" : ageTone(mins);
  const next = nextKitchenStatus(status);
  const prev = prevKitchenStatus(status);
  const pickup = order.delivery_type === "pickup";
  const items = order.order_items ?? [];

  return (
    <li
      className={`rounded-2xl border bg-card p-4 shadow-sm ${
        tone === "very-late" ? "border-rose-300" : tone === "late" ? "border-amber-300" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-serif text-lg leading-tight font-semibold text-foreground">#{order.order_number}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{order.customer_name}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${AGE_CLASS[tone]}`}
            title={status === "new" ? "Time since the order arrived" : "Time in this stage"}
          >
            <Clock className="h-3 w-3" aria-hidden="true" />
            {formatAge(mins)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#282345]/8 px-2 py-0.5 text-[11px] font-medium text-[#282345]">
            {pickup ? <Store className="h-3 w-3" aria-hidden="true" /> : <Truck className="h-3 w-3" aria-hidden="true" />}
            {pickup ? "Pickup" : "Delivery"}
          </span>
        </div>
      </div>

      <ul className="mt-3 space-y-2 border-t border-border pt-3">
        {items.length === 0 ? (
          <li className="text-sm text-muted-foreground italic">Loading items…</li>
        ) : (
          items.map((i) => (
            <li key={i.id} className="flex items-baseline gap-2">
              <span className="min-w-8 font-serif text-xl leading-none font-bold text-[#a8691d]">{i.qty}×</span>
              <div className="min-w-0">
                <p className="text-sm leading-snug font-semibold text-foreground">
                  {i.name}
                  {i.variant && <span className="ml-1.5 font-normal text-muted-foreground">({i.variant})</span>}
                </p>
                {i.note && (
                  <p className="mt-1 rounded-lg bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-800 italic">
                    “{i.note}”
                  </p>
                )}
              </div>
            </li>
          ))
        )}
      </ul>

      {order.notes && (
        <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
          <span className="font-semibold">Customer note: </span>
          {order.notes}
        </p>
      )}
      {order.admin_notes && (
        <p className="mt-2 rounded-xl bg-[#282345]/6 px-3 py-2 text-xs text-[#282345]">
          <span className="font-semibold">Kitchen note: </span>
          {order.admin_notes}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        {next ? (
          <button
            onClick={() => onMove(next)}
            disabled={busy}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-sm transition-colors disabled:opacity-60 ${
              status === "new"
                ? "bg-[#d39c54] text-[#1c1733] hover:bg-[#c48b3f]"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {status === "new" ? "Start preparing" : "Mark ready"}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <Link
            to="/admin/orders"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-[#d39c54]"
          >
            Hand over in Orders
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
        {prev && (
          <button
            onClick={() => onMove(prev)}
            disabled={busy}
            aria-label={`Move back to ${KITCHEN_LABEL[prev]}`}
            title={`Back to ${KITCHEN_LABEL[prev]}`}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:border-[#d39c54] hover:text-foreground disabled:opacity-60"
          >
            <Undo2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  );
}
