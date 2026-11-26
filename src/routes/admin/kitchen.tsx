import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Clock,
  PackageCheck,
  Printer,
  RefreshCw,
  Store,
  Truck,
  Undo2,
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
  readyLabel,
  timerStart,
  type AgeTone,
} from "../../lib/kitchen";
import { formatINR } from "../../lib/enquiry";
import { paymentSummary } from "../../lib/orderFlow";
import { KOT_SIZE_LABEL, printKotSaved, useKotWidth } from "../../lib/kot";
import type { KitchenStatus, Order } from "../../lib/types";

export const Route = createFileRoute("/admin/kitchen")({
  head: () => ({
    meta: [{ title: "Mithara Admin — Kitchen" }],
  }),
  component: KitchenPage,
});

/**
 * One colour per stage, used everywhere (tab, column, ticket, button) so the stage is readable at a glance:
 *   New = gold · Preparing = violet · Ready = green.
 * Lateness is a separate signal (the timer chip, plus a red ring when very late), so it never gets
 * confused with the stage colour.
 */
const STAGE: Record<
  KitchenStatus,
  {
    hint: string;
    empty: string;
    column: string; // column background + border (kept neutral: the colour lives on the tickets)
    head: string; // column title colour
    dot: string; // small dot / accent bar
    count: string; // count badge
    band: string; // solid colour header band of the ticket
    tabOn: string; // active tab
    tabOff: string; // inactive tab
    action: string; // main action button
    qty: string; // quantity colour on the ticket
  }
> = {
  new: {
    hint: "Just received",
    empty: "No new orders. Nice and quiet.",
    column: "border-border bg-muted/40",
    head: "text-[#8a5517]",
    dot: "bg-[#d39c54]",
    count: "bg-[#d39c54] text-[#1c1733]",
    band: "bg-[#d39c54] text-[#1c1733]",
    tabOn: "border-[#d39c54] bg-[#d39c54] text-[#1c1733] shadow-sm",
    tabOff: "border-border bg-card text-muted-foreground",
    action: "bg-[#6d5fb3] text-white hover:bg-[#5c4fa0]",
    qty: "text-[#a8691d]",
  },
  preparing: {
    hint: "On the counter",
    empty: "Nothing being prepared right now.",
    column: "border-border bg-muted/40",
    head: "text-[#4a3f8f]",
    dot: "bg-[#6d5fb3]",
    count: "bg-[#6d5fb3] text-white",
    band: "bg-[#6d5fb3] text-white",
    tabOn: "border-[#6d5fb3] bg-[#6d5fb3] text-white shadow-sm",
    tabOff: "border-border bg-card text-muted-foreground",
    action: "bg-emerald-600 text-white hover:bg-emerald-700",
    qty: "text-[#5c4fa0]",
  },
  ready: {
    hint: "Waiting for handover",
    empty: "No orders waiting to be handed over.",
    column: "border-border bg-muted/40",
    head: "text-emerald-800",
    dot: "bg-emerald-500",
    count: "bg-emerald-600 text-white",
    band: "bg-emerald-600 text-white",
    tabOn: "border-emerald-600 bg-emerald-600 text-white shadow-sm",
    tabOff: "border-border bg-card text-muted-foreground",
    action: "border border-emerald-600/30 bg-emerald-50 text-emerald-800",
    qty: "text-emerald-700",
  },
};

const AGE_CLASS: Record<AgeTone, string> = {
  fresh: "bg-black/15",
  late: "bg-white text-amber-700",
  "very-late": "bg-rose-600 text-white ring-2 ring-white animate-pulse",
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

  // Very late tickets per stage ("Ready" never raises an alarm: it only waits for the customer).
  const lateCount = useMemo(() => {
    const out: Record<KitchenStatus, number> = { new: 0, preparing: 0, ready: 0 };
    for (const s of ["new", "preparing"] as const) {
      out[s] = columns[s].filter((o) => ageTone(minutesSince(timerStart(o), now)) === "very-late").length;
    }
    return out;
  }, [columns, now]);


  return (
    // On large screens the board fills the screen and each column scrolls on its own, so a long queue in
    // one stage never pushes the other stages out of view. Phones/tablets keep the one-stage-at-a-time tabs.
    <div className="adm-stagger space-y-4 lg:flex lg:h-[calc(100dvh-8rem)] lg:min-h-[34rem] lg:flex-col">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between lg:shrink-0">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-neutral-100 sm:text-3xl">
            Kitchen Display
          </h1>
          <p className="mt-1 text-xs text-neutral-400">
            Live board to start, prepare and hand over orders as they come in
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

      {/* Mobile / tablet: one column at a time */}
      <div className="grid grid-cols-3 gap-2 lg:hidden" role="tablist" aria-label="Kitchen stage">
        {KITCHEN_STEPS.map((s) => {
          const st = STAGE[s];
          return (
            <button
              key={s}
              role="tab"
              aria-selected={tab === s}
              onClick={() => setTab(s)}
              className={`relative rounded-full border px-2 py-2.5 text-sm font-semibold transition-colors ${
                tab === s ? st.tabOn : st.tabOff
              }`}
            >
              {KITCHEN_LABEL[s]}
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${
                  tab === s ? "bg-white text-[#1c1733]" : "bg-black/5"
                }`}
              >
                {counts[s]}
              </span>
              {lateCount[s] > 0 && (
                <span
                  className="absolute -top-1 -right-1 flex h-5 min-w-5 animate-pulse items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white"
                  title={`${lateCount[s]} very late`}
                >
                  {lateCount[s]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Board */}
      {loading && orders.length === 0 ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-3xl border border-border bg-card" />
          ))}
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-3 lg:grid-rows-[minmax(0,1fr)] lg:items-stretch">
          {KITCHEN_STEPS.map((s) => {
            const st = STAGE[s];
            return (
              <section
                key={s}
                aria-label={KITCHEN_LABEL[s]}
                className={`${tab === s ? "flex" : "hidden"} min-h-0 flex-col overflow-hidden rounded-3xl border lg:flex ${st.column}`}
              >
                {/* Coloured title band across the top of the column (large screens; phones use the tabs) */}
                <header className={`hidden items-center justify-between gap-2 px-4 py-3 lg:flex ${st.band}`}>
                  <div className="min-w-0">
                    <h2 className="font-serif text-lg font-semibold leading-tight">{KITCHEN_LABEL[s]}</h2>
                    <p className="text-xs opacity-80">{st.hint}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {lateCount[s] > 0 && (
                      <span className="animate-pulse rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white ring-1 ring-white">
                        {lateCount[s]} late
                      </span>
                    )}
                    <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-[#1c1733] shadow-sm">
                      {columns[s].length}
                    </span>
                  </div>
                </header>

                <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-4">
                {columns[s].length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-card/50 px-4 py-10 text-center text-sm text-muted-foreground">
                    {st.empty}
                  </div>
                ) : (
                  // The list scrolls inside its own column on large screens (header above stays put).
                  // Padding on every side (cancelled out by the negative margins) gives the red "very late" ring
                  // room to draw; without it the scrolling list clips the ring on the left and top.
                  <ul className="kd-scroll space-y-3 lg:-mx-2 lg:-mt-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:px-2 lg:py-1">
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
                </div>
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
  const st = STAGE[status];
  const kotWidth = useKotWidth();
  // "Ready" tickets are collapsed to a slim card (they only wait for the customer); tap to see the items.
  const [expanded, setExpanded] = useState(false);
  const collapsed = status === "ready" && !expanded;

  const mins = minutesSince(timerStart(order), now);
  // "Ready" tickets are only waiting for the customer: a plain timer, no alarm colours.
  const tone: AgeTone = status === "ready" ? "fresh" : ageTone(mins);
  const next = nextKitchenStatus(status);
  const prev = prevKitchenStatus(status);
  const pickup = order.delivery_type === "pickup";
  const items = order.order_items ?? [];

  const typeBadge = (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold ${
        pickup ? "text-sky-700" : "text-[#282345]"
      }`}
    >
      {pickup ? <Store className="h-3 w-3" aria-hidden="true" /> : <Truck className="h-3 w-3" aria-hidden="true" />}
      {pickup ? "Pickup" : "Delivery"}
    </span>
  );

  const ageChip = (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${AGE_CLASS[tone]}`}
      title={status === "new" ? "Time since the order arrived" : "Time in this stage"}
    >
      <Clock className="h-3 w-3" aria-hidden="true" />
      {formatAge(mins)}
    </span>
  );

  // Paid or still to collect, so whoever hands the order over knows whether to ask for money.
  const pay = paymentSummary(order);
  // A small, quiet tag: white with a hairline border and a status dot. Colour is limited to the dot,
  // so it reads as information rather than a sticker. Unpaid shows the amount in bold, since that is
  // the number whoever hands the order over needs.
  const isPaid = pay.tone === "paid";
  const payPill = (
    <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs leading-none">
      <span
        className={`h-1.5 w-1.5 rounded-full ${isPaid ? "bg-emerald-500" : "bg-amber-500"}`}
        aria-hidden="true"
      />
      {isPaid ? (
        <span className="font-medium text-foreground">{pay.label}</span>
      ) : (
        <>
          <span className="font-medium uppercase tracking-wider text-muted-foreground">Collect</span>
          <span className="font-semibold tabular-nums text-foreground">{formatINR(order.total_inr)}</span>
        </>
      )}
    </span>
  );

  const backBtn = prev && (
    <button
      onClick={() => onMove(prev)}
      disabled={busy}
      aria-label={`Move back to ${KITCHEN_LABEL[prev]}`}
      title={`Back to ${KITCHEN_LABEL[prev]}`}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:border-[#d39c54] hover:text-foreground disabled:opacity-60"
    >
      <Undo2 className="h-4 w-4" />
    </button>
  );

  // White card, solid colour header band: the stage colour pops against the clean background.
  const shell = `overflow-hidden rounded-2xl border border-border bg-card shadow-sm ${
    tone === "very-late" ? "border-rose-500 ring-2 ring-rose-500" : ""
  }`;

  const band = (
    <div className={`flex items-start justify-between gap-3 px-4 py-3 ${st.band}`}>
      <div className="min-w-0">
        <p className="font-serif text-lg leading-tight font-semibold">#{order.order_number}</p>
        <p className="mt-0.5 truncate text-xs opacity-80">{order.customer_name}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {ageChip}
        {typeBadge}
      </div>
    </div>
  );

  // ---- Collapsed "Ready" card -----------------------------------------------------------------
  if (collapsed) {
    return (
      <li className={shell}>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          className="block w-full text-left"
        >
          {band}
          <p className="truncate px-4 pt-3 text-xs text-muted-foreground">
            {items.length === 0 ? "Loading items…" : items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
          </p>
        </button>
        <div className="px-4 pt-2">{payPill}</div>
        <div className="flex items-center gap-2 p-3 pt-2.5">
          <div
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold ${st.action}`}
          >
            <PackageCheck className="h-4 w-4" aria-hidden="true" />
            {readyLabel(order)}
          </div>
          {backBtn}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Show order details"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </li>
    );
  }

  // ---- Full ticket ----------------------------------------------------------------------------
  return (
    <li className={shell}>
      {band}

      <div className="p-4">
        <ul className="space-y-2.5">
          {items.length === 0 ? (
            <li className="text-sm text-muted-foreground italic">Loading items…</li>
          ) : (
            items.map((i) => (
              <li key={i.id} className="flex items-baseline gap-2">
                <span className={`min-w-8 font-serif text-xl leading-none font-bold ${st.qty}`}>{i.qty}×</span>
                <div className="min-w-0">
                  <p className="text-sm leading-snug font-semibold text-foreground">
                    {i.name}
                    {i.variant && <span className="ml-1.5 font-normal text-muted-foreground">({i.variant})</span>}
                  </p>
                  {i.note && (
                    <p className="mt-1 rounded-lg border-l-4 border-amber-500 bg-amber-500/15 px-2.5 py-1.5 text-[13px] leading-snug font-semibold text-amber-900">
                      <span className="mr-1.5 text-[10px] font-bold tracking-wider uppercase opacity-70">Note</span>
                      {i.note}
                    </p>
                  )}
                </div>
              </li>
            ))
          )}
        </ul>

        {order.notes && (
          <p className="mt-3 rounded-xl bg-amber-500/15 px-3 py-2 text-xs text-amber-900">
            <span className="font-semibold">Order note: </span>
            {order.notes}
          </p>
        )}
        {order.admin_notes && (
          <p className="mt-2 rounded-xl bg-[#282345]/8 px-3 py-2 text-xs text-[#282345]">
            <span className="font-semibold">Staff note: </span>
            {order.admin_notes}
          </p>
        )}

        <div className="mt-3">{payPill}</div>

        {/* Print the kitchen slip (paper size is chosen once in Settings → KOT printing) */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => printKotSaved(order)}
            title={`Print KOT on ${KOT_SIZE_LABEL[kotWidth]} paper (change in Settings)`}
            className="adm-no-lift inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-[#d39c54]"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            Print KOT
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          {next ? (
            <button
              onClick={() => onMove(next)}
              disabled={busy}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-sm transition-colors disabled:opacity-60 ${st.action}`}
            >
              {status === "new" ? "Start preparing" : "Mark ready"}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <div
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${st.action}`}
            >
              <PackageCheck className="h-4 w-4" aria-hidden="true" />
              {readyLabel(order)}
            </div>
          )}
          {backBtn}
          {status === "ready" && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Collapse order"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:text-foreground"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
