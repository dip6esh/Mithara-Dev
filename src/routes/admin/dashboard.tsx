import { useState, useEffect, useMemo } from "react";
import { useGreeting } from "@/hooks/useGreeting";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "../../lib/supabase";
import { cacheGet, cacheSet, hasCache, useCachedState } from "../../lib/adminCache";
import { Order, Product } from "../../lib/types";
import { STATUS_LABEL, countsAsSale, paymentSummary } from "../../lib/orderFlow";
import { useOrdersRealtime, useProductsRealtime } from "../../hooks/useAdminOrders";
import {
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  Clock,
  ArrowRight,
  CheckCircle2,
  Package,
  PackageX,
  RefreshCw,
  ChefHat,
} from "lucide-react";
import { WhatsAppButton } from "../../components/admin/WhatsAppButton";
import { toast } from "sonner";
import { CountUp } from "../../components/admin/CountUp";
import { StatCard } from "../../components/admin/StatCard";
import { refreshDailyStock } from "../../lib/dailyStock";
import { kitchenStatusOf } from "../../lib/kitchen";
import { LowStockPanel, refreshStockAlerts } from "../../components/admin/LowStockAlert";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({
    meta: [{ title: "Mithara Admin — Dashboard" }],
  }),
  component: AdminDashboardPage,
});

/** YYYY-MM-DD in the viewer's local time (so "today" matches the kitchen's day, not UTC). */
const localKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const formatINR = (n: number) => "₹" + n.toLocaleString("en-IN");

const CATEGORY_STYLE: Record<string, { label: string; tile: string }> = {
  kunafa: { label: "Kunafa", tile: "from-[#d39c54] to-[#b9772a]" },
  baklava: { label: "Baklava", tile: "from-[#6d5fb3] to-[#3a3360]" },
  gelato: { label: "Gelato", tile: "from-[#3a3360] to-[#1c1733]" },
};

type StockLevel = "out" | "low" | "ok" | "untracked";

function stockLevel(p: Product): { level: StockLevel; pct: number } {
  const soldOut =
    p.status === "sold_out" || (p.stock_remaining !== null && p.stock_remaining <= 0);
  if (soldOut) return { level: "out", pct: 0 };
  if (p.daily_stock && p.stock_remaining !== null) {
    const pct = Math.min(100, Math.round((p.stock_remaining / p.daily_stock) * 100));
    return { level: pct <= 25 ? "low" : "ok", pct };
  }
  return { level: "untracked", pct: 100 };
}

function ProductThumb({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  const style = CATEGORY_STYLE[product.category] ?? CATEGORY_STYLE.kunafa;
  const usable =
    !!product.image_url && (product.image_url.startsWith("http") || product.image_url.startsWith("/"));
  if (usable && !failed) {
    return (
      <img
        src={product.image_url!}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-12 w-12 rounded-xl object-cover ring-1 ring-black/5"
      />
    );
  }
  return (
    <div
      className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${style.tile} text-base font-bold text-white shadow-sm`}
    >
      {product.name.charAt(0).toUpperCase()}
    </div>
  );
}

const STATUS_STYLE: Record<string, { chip: string; dot: string }> = {
  new: { chip: "bg-[#d39c54]/15 text-[#9a6420]", dot: "bg-[#d39c54]" },
  completed: { chip: "bg-emerald-500/10 text-emerald-700", dot: "bg-emerald-600" },
};

function AdminDashboardPage() {
  const [orders, setOrders] = useCachedState<Order[]>("admin:dashboard:orders", []);
  const [products, setProducts] = useCachedState<Product[]>("admin:dashboard:products", []);
  // Returning to this page shows the last data straight away and refreshes it quietly.
  const [isLoading, setIsLoading] = useState(() => !hasCache("admin:dashboard:orders"));
  const [stockFilter, setStockFilter] = useState<"all" | "kunafa" | "baklava" | "gelato">("all");

  const fetchData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      await refreshDailyStock(); // a new day starts with full stock
      // Orders and products are independent — fetch them at the same time.
      const [ordersRes, productsRes] = await Promise.all([
        supabase
          .from("orders")
          .select("*, order_items(*)")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("products").select("*").neq("status", "deleted"),
      ]);
      if (ordersRes.error) throw ordersRes.error;
      if (productsRes.error) throw productsRes.error;
      setOrders(ordersRes.data || []);
      setProducts(productsRes.data || []);
      void refreshStockAlerts();
    } catch (err: any) {
      console.error("Dashboard error:", err);
      if (!silent) toast.error("Failed to load dashboard metrics");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData(hasCache("admin:dashboard:orders"));
  }, []);

  // Live updates + a chime/toast when a new order arrives.
  useOrdersRealtime(() => fetchData(true));
  // Menu edits (stock, availability) from another tab or device also refresh the stock cards.
  useProductsRealtime(() => fetchData(true));

  const todayKey = localKey(new Date());
  // Sales = orders received or handed over (never abandoned online payments or cancelled orders).
  const todayOrders = orders.filter(
    (o) => countsAsSale(o) && localKey(new Date(o.created_at)) === todayKey,
  );
  const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.total_inr || 0), 0);

  // Last 7 days of order value (abandoned and cancelled orders excluded)
  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return { key: localKey(d), label: d.toLocaleDateString("en-IN", { weekday: "short" }), total: 0 };
    });
    for (const o of orders) {
      if (!countsAsSale(o)) continue;
      const day = days.find((d) => d.key === localKey(new Date(o.created_at)));
      if (day) day.total += o.total_inr || 0;
    }
    return days;
  }, [orders]);
  const weekMax = Math.max(...week.map((d) => d.total), 1);
  const weekTotal = week.reduce((s, d) => s + d.total, 0);
  const yesterday = week[5].total;
  const delta = yesterday > 0 ? Math.round(((todayRevenue - yesterday) / yesterday) * 100) : null;

  const actionOrders = orders.filter((o) => o.status === "new");
  const toCollect = actionOrders
    .filter((o) => o.payment_status !== "paid")
    .reduce((sum, o) => sum + (o.total_inr || 0), 0);
  const countBy = (s: string) => orders.filter((o) => o.status === s).length;
  // Kitchen progress of the orders still waiting to be handed over (live: this page refetches on every order change).
  const kitchenCount = (k: "new" | "preparing" | "ready") =>
    actionOrders.filter((o) => kitchenStatusOf(o) === k).length;

  const activeProducts = products.filter((p) => p.status === "active");
  const soldOutProducts = products.filter(
    (p) => p.status === "sold_out" || (p.stock_remaining !== null && p.stock_remaining <= 0)
  );
  const healthPct = products.length ? Math.round((activeProducts.length / products.length) * 100) : 0;
  const lowStockCount = products.filter((p) => stockLevel(p).level === "low").length;
  const urgency: Record<StockLevel, number> = { out: 0, low: 1, ok: 2, untracked: 3 };
  const stockCards = products
    .filter((p) => stockFilter === "all" || p.category === stockFilter)
    .sort((a, b) => urgency[stockLevel(a).level] - urgency[stockLevel(b).level])
    .slice(0, 8);

  /** Hand over from the dashboard. Unpaid orders are opened on the Orders page to record cash/UPI. */
  const handleHandover = async (order: Order) => {
    // Same safety net as the Orders page: a customer may have paid early, before the kitchen finished.
    if (
      order.kitchen_status !== "ready" &&
      !window.confirm(
        `The kitchen has not marked ${order.order_number} ready yet. Hand it over anyway?`,
      )
    ) {
      return;
    }
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", order.id);
      if (error) throw error;
      toast.success(`${order.order_number} handed over`);
      fetchData(true);
    } catch (err: any) {
      toast.error(err.message || "Could not update order");
    }
  };

  const greeting = useGreeting();

  return (
    <>
      <div className="adm-stagger space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              {new Date().toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
            <h1 className="mt-1 font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {greeting}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {actionOrders.length > 0
                ? `${actionOrders.length} order${actionOrders.length > 1 ? "s" : ""} need your attention.`
                : "The kitchen is all caught up."}
            </p>
          </div>

          <div className="grid grid-cols-2 items-center gap-2 sm:flex">
            <button
              onClick={() => fetchData()}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-[#d39c54] disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link
              to="/admin/orders"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#282345] px-4 py-2.5 text-xs font-semibold whitespace-nowrap text-white shadow-md shadow-[#282345]/20 transition-colors hover:bg-[#1c1733]"
            >
              <ShoppingBag className="h-3.5 w-3.5 text-[#ebb976]" />
              Manage orders
            </Link>
          </div>
        </div>

        {/* Items at or below their low-stock alert number (set per item in Menu Control) */}
        <LowStockPanel />

        {/* Kitchen snapshot: the full board lives on /admin/kitchen */}
        <Link
          to="/admin/kitchen"
          className="adm-panel group/kd flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm sm:px-5"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#d39c54]/15 text-[#a8691d]">
              <ChefHat className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-foreground">In the kitchen</span>
              <span className="block text-xs text-muted-foreground">
                {actionOrders.length === 0 ? "Nothing to cook right now" : "Live from the kitchen display"}
              </span>
            </span>
          </span>
          <span className="flex items-center gap-2 text-xs font-semibold">
            <span className="rounded-full bg-[#d39c54]/15 px-2.5 py-1 text-[#9a6420]">{kitchenCount("new")} new</span>
            <span className="rounded-full bg-[#282345]/10 px-2.5 py-1 text-[#282345]">{kitchenCount("preparing")} preparing</span>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-700">{kitchenCount("ready")} ready</span>
            <ArrowRight className="h-3.5 w-3.5 text-[#a8691d] transition-transform duration-300 group-hover/kd:translate-x-1" aria-hidden="true" />
          </span>
        </Link>

        {/* Hero + stats */}
        <div className="grid gap-4 lg:grid-cols-12">
          {/* Revenue hero */}
          <div className="adm-hero relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#2f2952] via-[#282345] to-[#1c1733] p-5 text-white shadow-xl shadow-[#282345]/20 sm:p-8 lg:col-span-7">
            <div className="pointer-events-none absolute inset-0 bg-pattern opacity-50" aria-hidden />
            <div className="adm-float pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[#d39c54]/25 blur-3xl" aria-hidden />

            <div className="relative z-10 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/60">
                  Today's revenue
                </p>
                <p className="mt-3 font-serif text-3xl font-semibold tracking-tight min-[400px]:text-4xl sm:text-5xl">
                  <CountUp value={todayRevenue} prefix="₹" />
                </p>
                <p className="mt-2 text-xs text-white/60">
                  From {todayOrders.length} order{todayOrders.length === 1 ? "" : "s"} today
                </p>
              </div>
              {delta !== null && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    delta >= 0 ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300"
                  }`}
                >
                  {delta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {delta >= 0 ? "+" : ""}
                  {delta}% vs yesterday
                </span>
              )}
            </div>

            {/* 7-day bars */}
            <div className="relative z-10 mt-6 sm:mt-8">
              <div className="mb-3 flex items-center justify-between text-xs text-white/60">
                <span>Last 7 days</span>
                <span className="font-medium text-[#ebb976]"><CountUp value={weekTotal} prefix="₹" /></span>
              </div>
              <div className="flex h-28 items-end gap-1.5 sm:h-32 sm:gap-3">
                {week.map((d, i) => {
                  const isToday = i === 6;
                  const h = Math.max((d.total / weekMax) * 100, d.total > 0 ? 6 : 3);
                  return (
                    <div key={d.key} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
                      <div
                        title={`${d.label}: ${formatINR(d.total)}`}
                        style={{ height: `${h}%`, ["--i" as string]: i }}
                        className={`adm-bar w-full cursor-pointer rounded-t-lg transition-[background-color,filter,transform] duration-300 hover:brightness-125 ${
                          isToday
                            ? "bg-gradient-to-t from-[#c48b3f] to-[#ebb976] shadow-[0_0_24px_-4px_rgba(211,156,84,0.6)]"
                            : "bg-white/15 group-hover:bg-white/35"
                        }`}
                      />
                      <span className={`text-[10px] font-medium ${isToday ? "text-[#ebb976]" : "text-white/50"}`}>
                        {d.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:col-span-5">
            <StatCard
              icon={ShoppingBag}
              label="Orders today"
              value={todayOrders.length}
              sub={`${todayOrders.filter((o) => o.status === "completed").length} handed over`}
              tone="indigo"
              to="/admin/orders"
            />
            <StatCard
              icon={Clock}
              label="Needs action"
              value={actionOrders.length}
              sub={
                <span className="font-medium text-[#a8691d]">
                  {toCollect > 0 ? `${formatINR(toCollect)} to collect` : "all paid"}
                </span>
              }
              tone="gold"
              to="/admin/orders"
            />
            <StatCard
              icon={Package}
              label="Active menu items"
              value={activeProducts.length}
              sub={`of ${products.length} in catalog`}
              tone="green"
              to="/admin/menu"
            />
            <StatCard
              icon={PackageX}
              label="Sold out"
              value={soldOutProducts.length}
              sub={soldOutProducts.length > 0 ? "Restock to resume sales" : "All items stocked"}
              tone={soldOutProducts.length > 0 ? "rose" : "green"}
              to="/admin/menu"
            />
          </div>
        </div>

        {/* Orders + menu */}
        <div className="space-y-6">
          {/* Orders needing action */}
          <section className="adm-panel rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-serif text-xl font-semibold text-foreground">Orders needing action</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Received and waiting to be handed over</p>
              </div>
              <Link
                to="/admin/orders"
                className="group/link inline-flex items-center gap-1 text-xs font-semibold text-[#a8691d] hover:text-[#8f5a17]"
              >
                View all <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover/link:translate-x-1" />
              </Link>
            </div>

            {/* Pipeline */}
            <div className="mt-5 grid grid-cols-2 gap-2">
              {(["new", "completed"] as const).map((s) => (
                <div key={s} className="rounded-xl bg-background px-3 py-2.5 transition-all duration-300 hover:-translate-y-0.5 hover:bg-secondary hover:shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${STATUS_STYLE[s].dot}`} />
                    <span className="text-[11px] font-medium text-muted-foreground">{STATUS_LABEL[s]}</span>
                  </div>
                  <p className="mt-1 font-serif text-xl font-semibold text-foreground"><CountUp value={countBy(s)} /></p>
                </div>
              ))}
            </div>

            {actionOrders.length === 0 ? (
              <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-12 text-center">
                <div className="adm-float flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-foreground">Kitchen is completely up to date</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  No orders are waiting to be handed over right now.
                </p>
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-border">
                {actionOrders.map((order, orderIdx) => {
                  const pay = paymentSummary(order);
                  const itemsSummary =
                    order.order_items
                      ?.map((i) => `${i.name}${i.variant ? ` (${i.variant})` : ""} × ${i.qty}`)
                      .join(", ") || "No items recorded";
                  const cleanPhone = order.customer_phone?.replace(/[^0-9]/g, "");
                  const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
                    `Hello ${order.customer_name}, this is Mithara regarding order ${order.order_number}. We have received your order and it is being taken care of.`
                  )}`;
                  const st = STATUS_STYLE[order.status] ?? STATUS_STYLE.new;

                  return (
                    <li
                      key={order.id}
                      style={{ ["--i" as string]: orderIdx }}
                      className="adm-item -mx-3 flex flex-col gap-3 rounded-xl px-3 py-4 transition-colors duration-200 hover:bg-[#d39c54]/[0.07] sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold text-foreground">
                            {order.order_number}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${st.chip}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${st.dot} ${
                                order.status === "new" ? "animate-pulse" : ""
                              }`}
                            />
                            {STATUS_LABEL[order.status]}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(order.created_at).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          {order.customer_name}{" "}
                          <span className="font-normal text-muted-foreground">· {order.customer_phone}</span>
                        </p>
                        <p className="line-clamp-1 text-xs text-muted-foreground">{itemsSummary}</p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 sm:flex-nowrap sm:justify-end sm:gap-4">
                        <div className="sm:text-right">
                          <p className="font-serif text-lg font-semibold text-foreground">
                            {formatINR(order.total_inr)}
                          </p>
                          <p
                            className={`text-[10px] font-semibold uppercase tracking-wide ${
                              pay.tone === "paid" ? "text-emerald-600" : "text-[#a8691d]"
                            }`}
                          >
                            {pay.label} · {order.delivery_type}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 max-sm:ml-auto">
                          <WhatsAppButton href={waUrl} label="Message customer on WhatsApp" />
                          {order.payment_status === "paid" ? (
                            <button
                              onClick={() => handleHandover(order)}
                              className="rounded-full bg-[#282345] px-4 py-2 text-xs font-semibold whitespace-nowrap text-white transition-all hover:-translate-y-0.5 hover:bg-[#1c1733] hover:shadow-lg hover:shadow-[#282345]/30"
                            >
                              Mark handed over
                            </button>
                          ) : (
                            <Link
                              to="/admin/orders"
                              className="rounded-full bg-[#282345] px-4 py-2 text-xs font-semibold whitespace-nowrap text-white transition-all hover:-translate-y-0.5 hover:bg-[#1c1733] hover:shadow-lg hover:shadow-[#282345]/30"
                            >
                              Hand over &amp; collect
                            </Link>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Menu stock */}
          <section className="adm-panel rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-serif text-xl font-semibold text-foreground">Stock at a glance</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {soldOutProducts.length} sold out · {lowStockCount} running low · {activeProducts.length} active
                  <span className="mx-1.5 text-muted-foreground/40">|</span>
                  items needing attention show first
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-full bg-background p-1">
                  {(["all", "kunafa", "baklava", "gelato"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setStockFilter(f)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-all duration-300 ${
                        stockFilter === f
                          ? "bg-[#282345] text-white shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <Link
                  to="/admin/menu"
                  className="group/link inline-flex items-center gap-1 text-xs font-semibold text-[#a8691d] hover:text-[#8f5a17]"
                >
                  Manage menu <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover/link:translate-x-1" />
                </Link>
              </div>
            </div>

            {/* Overall availability */}
            <div className="mt-5 flex items-center gap-3">
              <span className="text-xs font-medium text-muted-foreground">Menu availability</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
                <div
                  className="adm-fill h-full rounded-full bg-gradient-gold transition-all duration-700"
                  style={{ width: `${healthPct}%` }}
                />
              </div>
              <span className="text-xs font-bold text-foreground">{healthPct}%</span>
            </div>

            {stockCards.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-border py-10 text-center text-xs text-muted-foreground">
                No menu items in this category yet.
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {stockCards.map((product, cardIdx) => {
                  const { level, pct } = stockLevel(product);
                  const cat = CATEGORY_STYLE[product.category];
                  const chip =
                    level === "out"
                      ? { text: "Sold out", cls: "bg-rose-500/10 text-rose-500", dot: "bg-rose-500" }
                      : product.status !== "active"
                        ? {
                            text: product.status.replace(/_/g, " "),
                            cls: "bg-secondary text-muted-foreground",
                            dot: "bg-muted-foreground/50",
                          }
                        : level === "low"
                          ? { text: "Low stock", cls: "bg-[#d39c54]/15 text-[#9a6420]", dot: "bg-[#d39c54]" }
                          : { text: "Active", cls: "bg-emerald-500/10 text-emerald-600", dot: "bg-emerald-500" };
                  const bar =
                    level === "out" ? "bg-rose-500" : level === "low" ? "bg-[#d39c54]" : "bg-emerald-500";

                  return (
                    <Link
                      key={product.id}
                      to="/admin/menu"
                      style={{ ["--i" as string]: cardIdx }}
                      className="adm-card adm-item group flex flex-col overflow-hidden rounded-2xl border border-border bg-background/60 p-4 hover:bg-card"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="adm-icon"><ProductThumb product={product} /></div>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${chip.cls}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${chip.dot}`} />
                          {chip.text}
                        </span>
                      </div>

                      <p className="mt-3 truncate text-sm font-semibold text-foreground">{product.name}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {cat?.label ?? product.category}
                        {product.price_label ? ` · ${product.price_label}` : ""}
                      </p>

                      <div className="mt-4">
                        {level === "untracked" ? (
                          <p className="text-[11px] font-medium text-muted-foreground">Stock not tracked</p>
                        ) : (
                          <>
                            <div className="flex items-baseline justify-between text-[11px]">
                              <span className="font-semibold text-foreground">
                                {level === "out" ? "Out of stock" : `${product.stock_remaining} left`}
                              </span>
                              <span className="text-muted-foreground">of {product.daily_stock ?? "—"}</span>
                            </div>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border">
                              <div
                                className={`adm-fill h-full rounded-full transition-all duration-700 ${bar}`}
                                style={{ width: `${Math.max(pct, level === "out" ? 0 : 4)}%` }}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
