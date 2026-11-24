import { useState, useEffect, useMemo } from "react";
import { useGreeting } from "@/hooks/useGreeting";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  useAuth,
  signOut,
  fetchCustomerAddresses,
  saveCustomerAddress,
  deleteCustomerAddress,
  fetchCustomerProfile,
} from "../../lib/auth";
import { CustomerAddress, CustomerProfile, Order, type PaymentMethod } from "../../lib/types";
import { supabase } from "../../lib/supabase";
import { fetchInvoiceMap, invoiceHref, type InvoiceSummary } from "../../lib/invoice";
import { cacheGet, cacheSet, hasCache } from "../../lib/adminCache";
import { confirmPayment, startPayment } from "../../lib/payment";
import {
  Plus,
  Trash2,
  ShoppingBag,
  LogOut,
  X,
  Loader2,
  MapPin,
  Clock,
  Wallet,
  Sparkles,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ArrowRight,
  Phone,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { CountUp } from "../../components/admin/CountUp";
import { StatCard } from "../../components/admin/StatCard";
import { useCardSpotlight } from "../../components/admin/useCardSpotlight";
import { ModalBackdrop } from "../../components/ModalBackdrop";

export const Route = createFileRoute("/account/profile")({
  head: () => ({
    meta: [{ title: "My Mithara — Dashboard" }],
  }),
  component: CustomerProfilePage,
});

const formatINR = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;

type Status = Order["status"];

const STATUS_STYLE: Record<Status, { chip: string; dot: string; label: string }> = {
  new: { chip: "bg-[#d39c54]/15 text-[#9a6420]", dot: "bg-[#d39c54]", label: "Order received" },
  completed: { chip: "bg-emerald-500/10 text-emerald-700", dot: "bg-emerald-600", label: "Handed over" },
  cancelled: { chip: "bg-rose-500/10 text-rose-500", dot: "bg-rose-500", label: "Cancelled" },
  pending_payment: { chip: "bg-amber-500/10 text-amber-700", dot: "bg-amber-500", label: "Awaiting payment" },
};

const isActive = (o: Order) =>
  o.status !== "completed" && o.status !== "cancelled" && o.status !== "pending_payment";

/** Small badge shown on orders paid through the demo module. */
function DemoBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-[#d39c54]/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#9a6420]">
      Demo
    </span>
  );
}

/** Two simple steps: the kitchen has your order, then it is handed over. */
const stepsFor = (_o: Order): Status[] => ["new", "completed"];

/** Plain-language payment line for the customer. */
const paymentLine = (o: Order) => {
  if (o.status === "pending_payment") return "Awaiting payment";
  if (o.payment_status === "paid") return o.payment_method === "cash" ? "Paid at handover" : "Paid online";
  return "Pay at handover";
};

const joinAddress = (a: Partial<CustomerAddress> | null | undefined) =>
  a ? [a.flat, a.building, a.street, a.area, a.city, a.pincode].filter(Boolean).join(", ") : "";

function StatusChip({ status }: { status: Status }) {
  const st = STATUS_STYLE[status] ?? STATUS_STYLE.new;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${st.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${st.dot} ${status === "new" ? "animate-pulse" : ""}`} />
      {STATUS_STYLE[status]?.label ?? status}
    </span>
  );
}

/** Thin segmented tracker for an order that is still in progress. */
function OrderProgress({ order }: { order: Order }) {
  const steps = stepsFor(order);
  const idx = Math.max(steps.indexOf(order.status), 0);
  return (
    <div className="mt-3">
      <div className="flex gap-1">
        {steps.map((s, i) => (
          <div key={s} className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
            <div
              style={{ ["--i" as string]: i }}
              className={`adm-fill h-full rounded-full ${
                i <= idx ? "bg-gradient-to-r from-[#c48b3f] to-[#ebb976]" : "w-0"
              }`}
            />
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">
        {STATUS_STYLE[order.status].label}{order.payment_status !== "paid" && order.status === "new" ? ` · ${paymentLine(order)}` : ""}
      </p>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60";

function CustomerProfilePage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  // Last loaded copy for this customer (per user id, so accounts never mix): shown instantly when
  // you come back to this page, while a quiet refresh brings it up to date.
  type Snapshot = {
    profile: CustomerProfile | null;
    addresses: CustomerAddress[];
    orders: Order[];
    invoices: Record<string, InvoiceSummary>;
  };
  const cacheKey = user ? `account:${user.id}` : "";
  const snap = cacheKey ? cacheGet<Snapshot>(cacheKey) : undefined;
  const [profile, setProfile] = useState<CustomerProfile | null>(snap?.profile ?? null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>(snap?.addresses ?? []);
  const [orders, setOrders] = useState<Order[]>(snap?.orders ?? []);
  /** Invoice per order id; issued automatically once the payment is received. */
  const [invoiceMap, setInvoiceMap] = useState<Record<string, InvoiceSummary>>(snap?.invoices ?? {});
  const [loadingData, setLoadingData] = useState(!snap);

  const [orderFilter, setOrderFilter] = useState<"all" | "active" | "past">("all");
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);

  // Address modal
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [addressLabel, setAddressLabel] = useState("Home");
  const [flat, setFlat] = useState("");
  const [building, setBuilding] = useState("");
  const [street, setStreet] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("Mumbai");
  const [pincode, setPincode] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [savingAddr, setSavingAddr] = useState(false);

  useCardSpotlight();

  useEffect(() => {
    if (!authLoading && !user) {
      router.navigate({ to: "/account/login" });
    }
  }, [user, authLoading, router]);

  // `silent` refreshes in the background (after saving/deleting an address, payment, etc.)
  // so the page doesn't get swapped for a full-screen spinner every time.
  const loadData = async (silent = false) => {
    if (!user) return;
    if (!silent) setLoadingData(true);
    try {
      // The three requests don't depend on each other, so run them together.
      const [p, addrs, ordersRes, invoices] = await Promise.all([
        fetchCustomerProfile(user.id),
        fetchCustomerAddresses(user.id),
        supabase
          .from("orders")
          .select("*, order_items(*)")
          .eq("customer_id", user.id)
          .order("created_at", { ascending: false }),
        fetchInvoiceMap(), // RLS returns only this customer's invoices
      ]);
      setInvoiceMap(invoices);
      setProfile(p);
      setAddresses(addrs);
      setOrders(ordersRes.data || []);
      cacheSet(`account:${user.id}`, {
        profile: p,
        addresses: addrs,
        orders: ordersRes.data || [],
        invoices,
      } satisfies Snapshot);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingData(false);
    }
  };

  // Depend on the id, not the user object: onAuthStateChange hands back a new object on
  // token refresh / tab focus, which used to re-trigger a full reload with a spinner.
  const userId = user?.id;
  useEffect(() => {
    if (userId) loadData(hasCache(`account:${userId}`));
  }, [userId]);

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!flat || !street || !area) {
      toast.error("Please fill in flat, street, and area.");
      return;
    }

    setSavingAddr(true);
    try {
      await saveCustomerAddress({
        customer_id: user.id,
        label: addressLabel,
        recipient_name: profile?.name || null,
        phone: altPhone || profile?.phone || null,
        flat,
        building,
        street,
        area,
        city,
        pincode,
        instructions,
        is_default: isDefault || addresses.length === 0,
      });

      toast.success("Address saved to your address book!");
      setShowAddAddress(false);
      setFlat("");
      setBuilding("");
      setStreet("");
      setArea("");
      setPincode("");
      setInstructions("");
      setAltPhone("");
      loadData(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to save address");
    } finally {
      setSavingAddr(false);
    }
  };

  const handleDeleteAddress = async (id: string) => {
    if (!user) return;
    try {
      await deleteCustomerAddress(id, user.id);
      toast.success("Address removed");
      setConfirmDeleteId(null);
      loadData(true);
    } catch {
      toast.error("Failed to delete address");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out");
    router.navigate({ to: "/" });
  };

  const handleCompletePayment = async (order: Order) => {
    setPayingOrderId(order.id);
    try {
      const res = await startPayment();
      if (!res.available) {
        toast.error(res.message || "Online payment is unavailable right now.");
        return;
      }
      const result = await confirmPayment(order.id, order.payment_method as PaymentMethod, true);
      if (result.status === "new") {
        toast.success("Payment complete — your order is confirmed!");
        setSelectedOrder(null);
        await loadData(true);
      } else {
        toast.error("Payment was not completed. Please try again.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Payment failed. Please try again.");
    } finally {
      setPayingOrderId(null);
    }
  };

  // ── Derived numbers ────────────────────────────────────────────────────────
  const counted = useMemo(
    () => orders.filter((o) => o.status === "new" || o.status === "completed"),
    [orders],
  );
  const totalSpent = counted.reduce((s, o) => s + (o.total_inr || 0), 0);
  const avgOrder = counted.length ? totalSpent / counted.length : 0;
  const activeOrders = orders.filter(isActive);
  const completedCount = orders.filter((o) => o.status === "completed").length;

  // Last 6 months of spend (cancelled orders excluded)
  const months = useMemo(() => {
    const list = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - (5 - i));
      return {
        key: monthKey(d),
        label: d.toLocaleDateString("en-IN", { month: "short" }),
        total: 0,
      };
    });
    for (const o of counted) {
      const m = list.find((x) => x.key === monthKey(new Date(o.created_at)));
      if (m) m.total += o.total_inr || 0;
    }
    return list;
  }, [counted]);
  const monthMax = Math.max(...months.map((m) => m.total), 1);
  const sixMonthTotal = months.reduce((s, m) => s + m.total, 0);
  const thisMonth = months[5].total;
  const lastMonth = months[4].total;
  const delta = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;

  // Most-ordered item
  const favourite = useMemo(() => {
    const tally = new Map<string, number>();
    for (const o of counted)
      for (const it of o.order_items ?? []) tally.set(it.name, (tally.get(it.name) ?? 0) + (it.qty || 1));
    let best: [string, number] | null = null;
    for (const e of tally) if (!best || e[1] > best[1]) best = e;
    return best;
  }, [counted]);

  const shownOrders = useMemo(() => {
    const list =
      orderFilter === "active" ? orders.filter(isActive) : orderFilter === "past" ? orders.filter((o) => !isActive(o)) : orders;
    return showAllOrders ? list : list.slice(0, 5);
  }, [orders, orderFilter, showAllOrders]);
  const filteredCount =
    orderFilter === "active"
      ? activeOrders.length
      : orderFilter === "past"
        ? orders.length - activeOrders.length
        : orders.length;

  const defaultAddress = addresses.find((a) => a.is_default);
  const fullName: string = profile?.name || user?.user_metadata?.name || "";
  const firstName = fullName.trim().split(/\s+/)[0];
  const phone: string | undefined = profile?.phone || user?.user_metadata?.phone;
  const greeting = useGreeting();
  const latestActive = activeOrders[0];
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
    : null;

  if (authLoading || loadingData) {
    return (
      <div className="admin-theme flex min-h-[70vh] items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-[#d39c54]" />
      </div>
    );
  }

  return (
    <div className="admin-theme min-h-[70vh] bg-background text-foreground">
      <div className="adm-stagger mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2f2952] to-[#1c1733] font-serif text-xl font-semibold text-[#ebb976] shadow-md shadow-[#282345]/25">
              {(firstName || user?.email || "M").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                {new Date().toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <h1 className="mt-0.5 font-serif text-3xl font-semibold tracking-tight text-foreground">
                {greeting}
                {firstName ? `, ${firstName}` : ""}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {latestActive
                  ? `Your order ${latestActive.order_number}: ${STATUS_STYLE[latestActive.status].label.toLowerCase()}.`
                  : "Nothing in progress — ready for something sweet?"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => loadData()}
              disabled={loadingData}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-foreground shadow-sm hover:border-[#d39c54] disabled:opacity-60"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-foreground shadow-sm hover:border-rose-300 hover:text-rose-500"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
            <Link
              to="/kunafa"
              className="inline-flex items-center gap-2 rounded-full bg-[#282345] px-4 py-2 text-xs font-semibold text-white shadow-md shadow-[#282345]/20 hover:bg-[#1c1733]"
            >
              <ShoppingBag className="h-3.5 w-3.5 text-[#ebb976]" />
              Order now
            </Link>
          </div>
        </div>

        {/* Hero + stats */}
        <div className="grid gap-4 lg:grid-cols-12">
          {/* Spend hero */}
          <div className="adm-hero relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#2f2952] via-[#282345] to-[#1c1733] p-6 text-white shadow-xl shadow-[#282345]/20 sm:p-8 lg:col-span-7">
            <div className="pointer-events-none absolute inset-0 bg-pattern opacity-50" aria-hidden />
            <div
              className="adm-float pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[#d39c54]/25 blur-3xl"
              aria-hidden
            />

            <div className="relative z-10 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/60">
                  Total spent with Mithara
                </p>
                <p className="mt-3 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
                  <CountUp value={totalSpent} prefix="₹" />
                </p>
                <p className="mt-2 text-xs text-white/60">
                  Across {counted.length} order{counted.length === 1 ? "" : "s"}
                  {memberSince ? ` · member since ${memberSince}` : ""}
                </p>
              </div>
              {delta !== null && (
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    delta >= 0 ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300"
                  }`}
                >
                  {delta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {delta >= 0 ? "+" : ""}
                  {delta}% vs last month
                </span>
              )}
            </div>

            {favourite && (
              <p className="relative z-10 mt-4 inline-flex max-w-full items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/80">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#ebb976]" />
                <span className="truncate">
                  Your favourite: <span className="font-semibold text-[#ebb976]">{favourite[0]}</span> · {favourite[1]}×
                </span>
              </p>
            )}

            {/* 6-month bars */}
            <div className="relative z-10 mt-7">
              <div className="mb-3 flex items-center justify-between text-xs text-white/60">
                <span>Last 6 months</span>
                <span className="font-medium text-[#ebb976]">
                  <CountUp value={sixMonthTotal} prefix="₹" />
                </span>
              </div>
              <div className="flex h-28 items-end gap-2 sm:gap-3">
                {months.map((m, i) => {
                  const isNow = i === 5;
                  const h = Math.max((m.total / monthMax) * 100, m.total > 0 ? 6 : 3);
                  return (
                    <div key={m.key} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
                      <div
                        title={`${m.label}: ${formatINR(m.total)}`}
                        style={{ height: `${h}%`, ["--i" as string]: i }}
                        className={`adm-bar w-full cursor-pointer rounded-t-lg transition-[background-color,filter,transform] duration-300 hover:brightness-125 ${
                          isNow
                            ? "bg-gradient-to-t from-[#c48b3f] to-[#ebb976] shadow-[0_0_24px_-4px_rgba(211,156,84,0.6)]"
                            : "bg-white/15 group-hover:bg-white/35"
                        }`}
                      />
                      <span className={`text-[10px] font-medium ${isNow ? "text-[#ebb976]" : "text-white/50"}`}>
                        {m.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-2 gap-4 lg:col-span-5">
            <StatCard
              icon={ShoppingBag}
              label="Orders placed"
              value={orders.length}
              sub={`${completedCount} completed`}
              tone="indigo"
            />
            <StatCard
              icon={Clock}
              label="In progress"
              value={activeOrders.length}
              sub={
                activeOrders.length > 0 ? (
                  <span className="font-medium text-[#a8691d]">We're on it</span>
                ) : (
                  "All caught up"
                )
              }
              tone="gold"
            />
            <StatCard
              icon={MapPin}
              label="Saved addresses"
              value={addresses.length}
              sub={defaultAddress ? `Default: ${defaultAddress.label}` : "Add your first address"}
              tone="green"
            />
            <StatCard
              icon={Wallet}
              label="Average order"
              value={Math.round(avgOrder)}
              prefix="₹"
              sub="per order"
              tone="indigo"
            />
          </div>
        </div>

        {/* Orders */}
        <section className="adm-panel rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-serif text-xl font-semibold text-foreground">Your orders</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Track what's cooking and revisit past favourites</p>
            </div>
            <div className="inline-flex self-start rounded-full bg-background p-1 sm:self-auto">
              {(
                [
                  ["all", "All"],
                  ["active", "In progress"],
                  ["past", "Past"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => {
                    setOrderFilter(v);
                    setShowAllOrders(false);
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-300 ${
                    orderFilter === v
                      ? "bg-[#282345] text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {shownOrders.length === 0 ? (
            <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-12 text-center">
              <div className="adm-float flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d39c54]/15">
                <ShoppingBag className="h-6 w-6 text-[#a8691d]" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-foreground">
                {orders.length === 0 ? "No orders yet" : "Nothing here"}
              </h3>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                {orders.length === 0
                  ? "Browse the menu and pick your favourite kunafa or baklava!"
                  : "No orders match this filter."}
              </p>
              {orders.length === 0 && (
                <Link
                  to="/kunafa"
                  className="group/link mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#a8691d] hover:text-[#8f5a17]"
                >
                  Browse the menu{" "}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover/link:translate-x-1" />
                </Link>
              )}
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {shownOrders.map((o, i) => {
                const itemsSummary =
                  o.order_items
                    ?.map((it) => `${it.name}${it.variant ? ` (${it.variant})` : ""} × ${it.qty}`)
                    .join(", ") || "No items recorded";
                return (
                  <li
                    key={o.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedOrder(o)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedOrder(o);
                      }
                    }}
                    style={{ ["--i" as string]: i }}
                    className="adm-item -mx-3 cursor-pointer rounded-xl px-3 py-4 transition-colors duration-200 hover:bg-[#d39c54]/[0.07] focus-visible:bg-[#d39c54]/[0.07] focus-visible:outline-none"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold text-foreground">{o.order_number}</span>
                          <StatusChip status={o.status} />
                          {o.payment_mode === "demo" && o.payment_method !== "cash" && <DemoBadge />}
                          <span className="text-xs text-muted-foreground">
                            {new Date(o.created_at).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                        <p className="line-clamp-1 text-xs text-muted-foreground">{itemsSummary}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-serif text-lg font-semibold text-foreground">{formatINR(o.total_inr)}</p>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {paymentLine(o)} · {o.delivery_type}
                        </p>
                        {invoiceMap[o.id] && (
                          <a
                            href={invoiceHref(invoiceMap[o.id].id)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#a8691d] hover:text-[#8f5a17]"
                          >
                            <FileText className="h-3 w-3" /> Invoice
                          </a>
                        )}
                        {o.status === "pending_payment" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCompletePayment(o);
                            }}
                            disabled={payingOrderId === o.id}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#282345] px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-[#1c1733] disabled:opacity-60"
                          >
                            {payingOrderId === o.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Wallet className="h-3 w-3 text-[#ebb976]" />
                            )}
                            Complete payment
                          </button>
                        )}
                      </div>
                    </div>
                    {isActive(o) && <OrderProgress order={o} />}
                  </li>
                );
              })}
            </ul>
          )}

          {!showAllOrders && filteredCount > 5 && (
            <button
              onClick={() => setShowAllOrders(true)}
              className="mt-3 w-full rounded-xl bg-background py-2.5 text-xs font-semibold text-[#a8691d] hover:bg-secondary"
            >
              Show all {filteredCount} orders
            </button>
          )}
        </section>

        {/* Addresses */}
        <section className="adm-panel rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-serif text-xl font-semibold text-foreground">Saved addresses</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Pick one at checkout for seamless one-tap WhatsApp orders
              </p>
            </div>
            <button
              onClick={() => setShowAddAddress(true)}
              className="inline-flex items-center gap-2 self-start rounded-full bg-[#282345] px-4 py-2 text-xs font-semibold text-white shadow-md shadow-[#282345]/20 hover:bg-[#1c1733] sm:self-auto"
            >
              <Plus className="h-3.5 w-3.5 text-[#ebb976]" />
              Add address
            </button>
          </div>

          {addresses.length === 0 ? (
            <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-12 text-center">
              <div className="adm-float flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
                <MapPin className="h-6 w-6 text-emerald-500" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-foreground">No addresses saved yet</h3>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Save your home or office once and we'll fill it in for every order.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {addresses.map((addr, i) => (
                <div
                  key={addr.id}
                  style={{ ["--i" as string]: i }}
                  className="adm-card adm-item flex flex-col rounded-2xl border border-border bg-background/60 p-4 hover:bg-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="adm-icon flex h-10 w-10 items-center justify-center rounded-xl bg-[#282345]/8 text-[#282345]">
                      <MapPin className="h-[18px] w-[18px]" />
                    </div>
                    {addr.is_default && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#d39c54]/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#9a6420]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#d39c54]" />
                        Default
                      </span>
                    )}
                  </div>

                  <p className="mt-3 text-sm font-semibold text-foreground">{addr.label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{joinAddress(addr)}</p>

                  {addr.phone && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Phone className="h-3 w-3" /> {addr.phone}
                    </p>
                  )}
                  {addr.instructions && (
                    <p className="mt-1 text-[11px] italic text-muted-foreground">Note: “{addr.instructions}”</p>
                  )}

                  <div className="mt-auto flex items-center justify-end pt-3">
                    {confirmDeleteId === addr.id ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Remove?</span>
                        <button
                          onClick={() => handleDeleteAddress(addr.id)}
                          className="rounded-full bg-rose-500 px-3 py-1 font-semibold text-white hover:bg-rose-600"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-full border border-border px-3 py-1 font-medium text-foreground hover:bg-secondary"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(addr.id)}
                        aria-label={`Remove ${addr.label} address`}
                        title="Remove address"
                        className="rounded-full p-2 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Order detail */}
      {selectedOrder && (
        <ModalBackdrop onClose={() => setSelectedOrder(null)}>
          <div className="adm-modal relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-card p-6 text-foreground shadow-2xl">
            <button
              onClick={() => setSelectedOrder(null)}
              aria-label="Close"
              className="absolute top-5 right-5 rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex flex-wrap items-center gap-2 pr-8">
              <span className="font-mono text-xl font-bold text-foreground">{selectedOrder.order_number}</span>
              <StatusChip status={selectedOrder.status} />
              {selectedOrder.payment_mode === "demo" && selectedOrder.payment_method !== "cash" && <DemoBadge />}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Placed on{" "}
              {new Date(selectedOrder.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              {" · "}
              <span className="capitalize">{selectedOrder.delivery_type}</span>
            </p>

            {isActive(selectedOrder) && <OrderProgress order={selectedOrder} />}

            <div className="mt-5 rounded-2xl border border-border bg-background/60 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Items</p>
              <ul className="mt-2 divide-y divide-border">
                {(selectedOrder.order_items ?? []).map((it) => (
                  <li key={it.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {it.name} <span className="text-muted-foreground">× {it.qty}</span>
                      </p>
                      {it.variant && <p className="text-xs text-muted-foreground">{it.variant}</p>}
                      {it.note && <p className="text-xs italic text-muted-foreground">“{it.note}”</p>}
                    </div>
                    <span className="shrink-0 font-medium text-foreground">{formatINR(it.unit_price * it.qty)}</span>
                  </li>
                ))}
                {(selectedOrder.order_items ?? []).length === 0 && (
                  <li className="py-2 text-xs text-muted-foreground">No items recorded</li>
                )}
              </ul>

              <div className="mt-2 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatINR(selectedOrder.subtotal_inr)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Delivery</span>
                  <span>{selectedOrder.delivery_fee_inr ? formatINR(selectedOrder.delivery_fee_inr) : "Free"}</span>
                </div>
                {(selectedOrder.tax_inr ?? 0) > 0 && (
                  <div className="flex justify-between">
                    <span>
                      {selectedOrder.tax_label || "Tax"}
                      {selectedOrder.tax_inclusive ? " (included)" : ""}
                    </span>
                    <span>{formatINR(selectedOrder.tax_inr ?? 0)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 text-sm font-semibold text-foreground">
                  <span>Total</span>
                  <span className="font-serif text-lg">{formatINR(selectedOrder.total_inr)}</span>
                </div>
                <div className="flex justify-between pt-1 uppercase tracking-wide">
                  <span>Payment</span>
                  <span>
                    {paymentLine(selectedOrder)}
                    {selectedOrder.payment_mode === "demo" && selectedOrder.payment_method !== "cash" ? " · demo" : ""}
                  </span>
                </div>
              </div>
            </div>

            {invoiceMap[selectedOrder.id] && (
              <a
                href={invoiceHref(invoiceMap[selectedOrder.id].id)}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#d39c54]/40 bg-[#d39c54]/10 py-3 text-sm font-semibold text-[#8f5a17] hover:bg-[#d39c54]/20"
              >
                <FileText className="h-4 w-4" />
                View invoice · <span className="font-mono">{invoiceMap[selectedOrder.id].invoice_number}</span>
              </a>
            )}

            {selectedOrder.status === "pending_payment" && (
              <button
                onClick={() => handleCompletePayment(selectedOrder)}
                disabled={payingOrderId === selectedOrder.id}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#282345] py-3 text-sm font-semibold text-white shadow-md shadow-[#282345]/20 hover:bg-[#1c1733] disabled:opacity-60"
              >
                {payingOrderId === selectedOrder.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wallet className="h-4 w-4 text-[#ebb976]" />
                )}
                Complete payment
              </button>
            )}

            {selectedOrder.delivery_type === "delivery" && joinAddress(selectedOrder.address_snapshot) && (
              <div className="mt-3 rounded-2xl border border-border bg-background/60 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Delivering to
                </p>
                <p className="mt-1 text-sm text-foreground">{joinAddress(selectedOrder.address_snapshot)}</p>
              </div>
            )}

            {selectedOrder.notes && (
              <p className="mt-3 text-xs italic text-muted-foreground">Your note: “{selectedOrder.notes}”</p>
            )}
          </div>
        </ModalBackdrop>
      )}

      {/* Add address */}
      {showAddAddress && (
        <ModalBackdrop onClose={() => setShowAddAddress(false)}>
          <div className="adm-modal relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-card p-6 text-foreground shadow-2xl">
            <button
              onClick={() => setShowAddAddress(false)}
              aria-label="Close"
              className="absolute top-5 right-5 rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="pr-8 font-serif text-xl font-semibold text-foreground">Add a delivery address</h2>
            <p className="mt-1 text-xs text-muted-foreground">Label it Home, Office, or a friend's place</p>

            <form onSubmit={handleSaveAddress} className="mt-5 space-y-3 text-xs">
              <div>
                <label className="mb-1.5 block font-medium text-foreground">Address label *</label>
                <div className="flex flex-wrap gap-2">
                  {["Home", "Office", "Friend's Home", "Other"].map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setAddressLabel(l)}
                      className={`rounded-full border px-3 py-1.5 font-semibold transition-colors ${
                        addressLabel === l
                          ? "border-[#282345] bg-[#282345] text-white"
                          : "border-border bg-background text-muted-foreground hover:border-[#d39c54]"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block font-medium text-foreground">Flat / house number *</label>
                <input
                  type="text"
                  value={flat}
                  onChange={(e) => setFlat(e.target.value)}
                  required
                  placeholder="e.g. Flat 302, 3rd Floor"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="mb-1.5 block font-medium text-foreground">Building / apartment name</label>
                <input
                  type="text"
                  value={building}
                  onChange={(e) => setBuilding(e.target.value)}
                  placeholder="e.g. Gulmohar Residency"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="mb-1.5 block font-medium text-foreground">Street / landmark *</label>
                <input
                  type="text"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  required
                  placeholder="e.g. 14th Road, Near Starbucks"
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1.5 block font-medium text-foreground">Area / locality *</label>
                  <input
                    type="text"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    required
                    placeholder="e.g. Bandra West"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block font-medium text-foreground">Pincode</label>
                  <input
                    type="text"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    placeholder="e.g. 400050"
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block font-medium text-foreground">Alternate contact phone (optional)</label>
                <input
                  type="text"
                  value={altPhone}
                  onChange={(e) => setAltPhone(e.target.value)}
                  placeholder="Leave empty to use your main WhatsApp number"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="mb-1.5 block font-medium text-foreground">Delivery instructions</label>
                <input
                  type="text"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Ring bell twice, leave with security"
                  className={inputCls}
                />
              </div>

              {addresses.length > 0 && (
                <label className="flex cursor-pointer items-center gap-2 pt-1 font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="h-4 w-4 accent-[#282345]"
                  />
                  Make this my default address
                </label>
              )}

              <button
                type="submit"
                disabled={savingAddr}
                className="mt-3 w-full rounded-xl bg-[#282345] py-3 text-sm font-semibold text-white shadow-md shadow-[#282345]/20 hover:bg-[#1c1733] disabled:opacity-50"
              >
                {savingAddr ? "Saving..." : "Save address"}
              </button>
            </form>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}
