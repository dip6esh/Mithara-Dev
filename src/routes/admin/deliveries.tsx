import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ChefHat, Clock, MapPin, Phone, RefreshCw, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { useOrdersRealtime } from "../../hooks/useAdminOrders";
import { formatINR } from "../../lib/enquiry";
import { PAID_VIA_LABEL } from "../../lib/orderFlow";
import { describeAction, type PendingAction } from "../../lib/orderActions";
import { formatAge, minutesSince } from "../../lib/kitchen";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import type { Order, PaidVia } from "../../lib/types";

export const Route = createFileRoute("/admin/deliveries")({
  head: () => ({ meta: [{ title: "Deliveries — Mithara Admin" }] }),
  component: DeliveriesPage,
});

/** One printable line for the delivery address. */
function addressLines(o: Order): string[] {
  const a = o.address_snapshot ?? {};
  const line1 = [a.flat, a.building].filter(Boolean).join(", ");
  const line2 = [a.street, a.area].filter(Boolean).join(", ");
  const line3 = [a.city, a.pincode].filter(Boolean).join(" ");
  return [line1, line2, line3].filter(Boolean);
}

function DeliveriesPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (silent = true) => {
    if (!silent) setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("delivery_type", "delivery")
      .in("status", ["new", "completed"])
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) {
      console.error("Deliveries load error:", error);
      if (!silent) toast.error("Could not load deliveries");
    } else {
      setOrders((data as Order[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);
  useOrdersRealtime(() => void load(true));
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  // Ready orders first (they can go out now), then the oldest waiting.
  const open = useMemo(
    () =>
      orders
        .filter((o) => o.status === "new")
        .sort((a, b) => {
          const ar = a.kitchen_status === "ready" ? 0 : 1;
          const br = b.kitchen_status === "ready" ? 0 : 1;
          return ar - br || a.created_at.localeCompare(b.created_at);
        }),
    [orders],
  );
  const done = useMemo(
    () =>
      orders
        .filter((o) => o.status === "completed")
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 15),
    [orders],
  );

  const handOver = async (order: Order, via?: PaidVia) => {
    setBusy(true);
    try {
      const update: Record<string, unknown> = { status: "completed", updated_at: new Date().toISOString() };
      if (order.payment_status !== "paid") {
        update.payment_status = "paid";
        update.paid_via = via ?? "cash";
      }
      const { error } = await supabase.from("orders").update(update).eq("id", order.id);
      if (error) throw error;
      toast.success(
        order.payment_status === "paid"
          ? "Order handed over"
          : `Handed over · ${PAID_VIA_LABEL[via ?? "cash"]} received`,
      );
      setPending(null);
      void load(true);
    } catch (err: any) {
      toast.error(err?.message || "Could not update the order");
    } finally {
      setBusy(false);
    }
  };

  const copy = pending ? describeAction(pending, undefined) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-foreground">Deliveries</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Orders going out. Mark each one as handed over when it reaches the customer.
          </p>
        </div>
        <button
          onClick={() => void load(false)}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-foreground shadow-sm hover:border-[#d39c54]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading && orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : open.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
          <Truck className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium text-foreground">No deliveries waiting</p>
          <p className="mt-1 text-xs text-muted-foreground">New delivery orders appear here automatically.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {open.map((o) => {
            const ready = o.kitchen_status === "ready";
            const paid = o.payment_status === "paid";
            const lines = addressLines(o);
            const mapQuery = encodeURIComponent([o.address_snapshot?.recipient_name, ...lines].filter(Boolean).join(", "));
            const phone = o.address_snapshot?.phone || o.customer_phone;
            const mins = minutesSince(new Date(o.created_at).getTime(), now);
            return (
              <article key={o.id} className="flex flex-col rounded-3xl border border-border bg-card p-5 shadow-sm">
                <header className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground">{o.order_number}</p>
                    <h2 className="mt-0.5 text-lg font-semibold text-foreground">{o.customer_name}</h2>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      ready ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-700"
                    }`}
                  >
                    {ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ChefHat className="h-3.5 w-3.5" />}
                    {ready ? "Ready to go" : "Being prepared"}
                  </span>
                </header>

                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-start gap-2 text-foreground">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#b9772a]" />
                    <div className="min-w-0">
                      {lines.length ? lines.map((l, i) => <p key={i}>{l}</p>) : <p className="text-muted-foreground">No address saved</p>}
                      {o.address_snapshot?.instructions && (
                        <p className="mt-1 text-xs text-muted-foreground">Note: {o.address_snapshot.instructions}</p>
                      )}
                      {lines.length > 0 && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-xs font-semibold text-[#b9772a] hover:underline"
                        >
                          Open in Maps
                        </a>
                      )}
                    </div>
                  </div>
                  <a href={`tel:${phone}`} className="flex items-center gap-2 font-medium text-foreground hover:text-[#b9772a]">
                    <Phone className="h-4 w-4 text-[#b9772a]" />
                    {phone}
                  </a>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    Ordered {formatAge(mins)} ago
                  </p>
                </div>

                <ul className="mt-3 space-y-1 rounded-2xl bg-muted/50 p-3 text-xs text-foreground">
                  {(o.order_items ?? []).map((i) => (
                    <li key={i.id}>
                      <span className="font-semibold">{i.qty}×</span> {i.name}
                      {i.variant ? <span className="text-muted-foreground"> ({i.variant})</span> : null}
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{paid ? "Paid" : "To collect"}</span>
                  <span className={`text-lg font-semibold ${paid ? "text-emerald-600" : "text-amber-700"}`}>
                    {formatINR(o.total_inr)}
                  </span>
                </div>

                <div className="mt-4 grid gap-2">
                  {paid ? (
                    <button
                      disabled={busy}
                      onClick={() => setPending({ kind: "handover_paid", order: o })}
                      className="h-11 rounded-xl bg-[#282345] text-sm font-semibold text-white transition hover:bg-[#1c1733] disabled:opacity-60"
                    >
                      Mark handed over
                    </button>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        disabled={busy}
                        onClick={() => setPending({ kind: "collect", order: o, via: "cash" })}
                        className="h-11 rounded-xl bg-[#282345] text-sm font-semibold text-white transition hover:bg-[#1c1733] disabled:opacity-60"
                      >
                        Cash received
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => setPending({ kind: "collect", order: o, via: "upi" })}
                        className="h-11 rounded-xl border border-[#282345] text-sm font-semibold text-[#282345] transition hover:bg-[#282345]/5 disabled:opacity-60"
                      >
                        UPI received
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Handed over in the last 24 hours
          </h2>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {done.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="font-medium text-foreground">
                  {o.order_number} · {o.customer_name}
                </span>
                <span className="text-xs text-muted-foreground">{formatINR(o.total_inr)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {pending && copy && (
        <ConfirmDialog
          title={copy.title}
          intro={copy.intro}
          effects={copy.effects}
          confirmLabel={copy.confirmLabel}
          cancelLabel={copy.cancelLabel}
          tone={copy.tone}
          busy={busy}
          onConfirm={() =>
            void handOver(pending.order, pending.kind === "collect" ? pending.via : undefined)
          }
          onClose={() => setPending(null)}
        />
      )}
    </div>
  );
}
