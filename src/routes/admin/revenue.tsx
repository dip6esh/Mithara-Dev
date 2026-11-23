import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "../../lib/supabase";
import { cacheGet, cacheSet, hasCache, useCachedState } from "../../lib/adminCache";
import { Order } from "../../lib/types";
import {
  TrendingUp,
  Download,
  Calendar,
  CreditCard,
  PieChart as PieChartIcon,
  ShoppingBag,
  DollarSign,
  RefreshCw,
  Award,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/revenue")({
  head: () => ({
    meta: [{ title: "Mithara Admin — Revenue & Analytics" }],
  }),
  component: AdminRevenuePage,
});

type ProductSales = {
  name: string;
  qty: number;
  revenue: number;
};

function AdminRevenuePage() {
  const [orders, setOrders] = useState<Order[]>(() => cacheGet<Order[]>("admin:revenue:30d") ?? []);
  const [isLoading, setIsLoading] = useState(() => !hasCache("admin:revenue:30d"));
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "all">("30d");

  const fetchRevenueData = async (range: "7d" | "30d" | "all") => {
    // Show this range's last result immediately (if we have one) and refresh it quietly.
    const cached = cacheGet<Order[]>(`admin:revenue:${range}`);
    if (cached) {
      setOrders(cached);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
    try {
      let query = supabase
        .from("orders")
        .select("*, order_items(*)")
        .in("status", ["new", "completed"])
        .order("created_at", { ascending: true });

      // Only download the window being shown (plus a day of slack for timezones).
      if (range !== "all") {
        const days = range === "7d" ? 8 : 31;
        query = query.gte("created_at", new Date(Date.now() - days * 86_400_000).toISOString());
      }
      const { data, error } = await query;

      if (error) throw error;
      cacheSet(`admin:revenue:${range}`, data || []);
      setOrders(data || []);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load revenue metrics");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRevenueData(timeRange);
  }, [timeRange]);

  const formatINR = (n: number) => "₹" + n.toLocaleString("en-IN");

  // Filter orders by timeRange
  const now = new Date();
  const filteredOrders = orders.filter((o) => {
    if (timeRange === "all") return true;
    const orderDate = new Date(o.created_at);
    const diffDays = (now.getTime() - orderDate.getTime()) / (1000 * 3600 * 24);
    if (timeRange === "7d") return diffDays <= 7;
    if (timeRange === "30d") return diffDays <= 30;
    return true;
  });

  // Calculate totals
  const totalRevenue = filteredOrders.reduce((sum, o) => sum + (o.total_inr || 0), 0);
  const totalOrders = filteredOrders.length;
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  // Today's metrics
  const todayStr = new Date().toISOString().split("T")[0];
  const todayOrders = orders.filter((o) => o.created_at.startsWith(todayStr));
  const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.total_inr || 0), 0);

  // Group daily revenue for chart
  const dailyMap = new Map<string, number>();
  filteredOrders.forEach((o) => {
    const d = new Date(o.created_at).toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
    });
    dailyMap.set(d, (dailyMap.get(d) || 0) + (o.total_inr || 0));
  });

  const chartData = Array.from(dailyMap.entries()).map(([date, sales]) => ({
    date,
    sales,
  }));

  // Group by Product
  const productSalesMap = new Map<string, ProductSales>();
  filteredOrders.forEach((o) => {
    o.order_items?.forEach((item) => {
      const key = item.name;
      if (!productSalesMap.has(key)) {
        productSalesMap.set(key, { name: key, qty: 0, revenue: 0 });
      }
      const p = productSalesMap.get(key)!;
      p.qty += item.qty;
      p.revenue += item.unit_price * item.qty;
    });
  });

  const topProducts = Array.from(productSalesMap.values()).sort(
    (a, b) => b.revenue - a.revenue
  );

  // Payment method breakdown
  const paymentBreakdown = {
    upi: filteredOrders.filter((o) => o.payment_method === "upi").length,
    cash: filteredOrders.filter((o) => o.payment_method === "cash").length,
    card: filteredOrders.filter((o) => o.payment_method === "card").length,
    other: filteredOrders.filter((o) => !["upi", "cash", "card"].includes(o.payment_method))
      .length,
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (orders.length === 0) {
      toast.error("No orders to export");
      return;
    }

    const headers = [
      "Order Number",
      "Date",
      "Customer Name",
      "Customer Phone",
      "Delivery Type",
      "Payment Method",
      "Payment Status",
      "Status",
      "Total INR",
    ];

    const rows = filteredOrders.map((o) => [
      o.order_number,
      new Date(o.created_at).toISOString(),
      `"${o.customer_name?.replace(/"/g, '""')}"`,
      `"${o.customer_phone}"`,
      o.delivery_type,
      o.payment_method,
      o.payment_status,
      o.status,
      o.total_inr,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `mithara_sales_report_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Sales report exported successfully");
  };

  return (
    <>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-serif text-2xl font-bold tracking-tight text-neutral-100 sm:text-3xl">
              Revenue & Sales Intelligence
            </h1>
            <p className="mt-1 text-xs text-neutral-400">
              Track income, volume, average ticket size, and top dessert best sellers
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-neutral-900 border border-neutral-800 p-1">
              <button
                onClick={() => setTimeRange("7d")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  timeRange === "7d"
                    ? "bg-amber-500 text-gold-foreground font-bold"
                    : "text-neutral-400 hover:text-foreground"
                }`}
              >
                7 Days
              </button>
              <button
                onClick={() => setTimeRange("30d")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  timeRange === "30d"
                    ? "bg-amber-500 text-gold-foreground font-bold"
                    : "text-neutral-400 hover:text-foreground"
                }`}
              >
                30 Days
              </button>
              <button
                onClick={() => setTimeRange("all")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  timeRange === "all"
                    ? "bg-amber-500 text-gold-foreground font-bold"
                    : "text-neutral-400 hover:text-foreground"
                }`}
              >
                All Time
              </button>
            </div>

            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 py-2 text-xs font-semibold text-neutral-200 hover:border-amber-500/40 hover:text-amber-300 transition-colors shadow-sm"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="adm-card overflow-hidden rounded-2xl border border-neutral-800/80 bg-neutral-900/70 p-5">
            <span className="text-xs uppercase tracking-wider text-neutral-400">
              Selected Period Sales
            </span>
            <div className="mt-2 font-serif text-3xl font-bold text-neutral-100">
              {formatINR(totalRevenue)}
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Across {totalOrders} customer orders
            </p>
          </div>

          <div className="adm-card overflow-hidden rounded-2xl border border-neutral-800/80 bg-neutral-900/70 p-5">
            <span className="text-xs uppercase tracking-wider text-neutral-400">
              Today's Gross Sales
            </span>
            <div className="mt-2 font-serif text-3xl font-bold text-amber-300">
              {formatINR(todayRevenue)}
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              From {todayOrders.length} orders logged today
            </p>
          </div>

          <div className="adm-card overflow-hidden rounded-2xl border border-neutral-800/80 bg-neutral-900/70 p-5">
            <span className="text-xs uppercase tracking-wider text-neutral-400">
              Average Order Value (AOV)
            </span>
            <div className="mt-2 font-serif text-3xl font-bold text-neutral-100">
              {formatINR(avgOrderValue)}
            </div>
            <p className="mt-1 text-xs text-neutral-500">Per paying customer transaction</p>
          </div>

          <div className="adm-card overflow-hidden rounded-2xl border border-neutral-800/80 bg-neutral-900/70 p-5">
            <span className="text-xs uppercase tracking-wider text-neutral-400">
              Primary Payment Channel
            </span>
            <div className="mt-2 font-serif text-3xl font-bold text-emerald-400">
              UPI
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              {paymentBreakdown.upi} of {totalOrders} orders completed via UPI
            </p>
          </div>
        </div>

        {/* Daily Sales Bar Chart */}
        <div className="adm-panel rounded-2xl border border-neutral-800/80 bg-neutral-900/60 p-6 backdrop-blur">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="font-serif text-lg font-semibold text-neutral-100">
                Daily Sales Trajectory
              </h2>
              <p className="text-xs text-neutral-400">
                Order value per calendar day (received and handed-over orders)
              </p>
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-xs text-neutral-500">
              No sales data recorded in this period yet.
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#737373"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#737373"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `₹${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#171717",
                      borderColor: "#262626",
                      borderRadius: "12px",
                      color: "#fff",
                      fontSize: "12px",
                    }}
                    formatter={(v: any) => [`₹${Number(v).toLocaleString("en-IN")}`, "Sales"]}
                  />
                  <Bar dataKey="sales" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Top Products Table */}
        <div className="adm-panel rounded-2xl border border-neutral-800/80 bg-neutral-900/60 p-6 backdrop-blur">
          <div className="mb-4 flex items-center gap-2">
            <Award className="h-5 w-5 text-amber-400" />
            <div>
              <h2 className="font-serif text-lg font-semibold text-neutral-100">
                Best Selling Delicacies
              </h2>
              <p className="text-xs text-neutral-400">
                Ranked by cumulative revenue and units sold
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-800 text-[11px] uppercase tracking-wider text-neutral-400">
                <tr>
                  <th className="py-3 px-4">Rank</th>
                  <th className="py-3 px-4">Delicacy</th>
                  <th className="py-3 px-4 text-center">Units Sold</th>
                  <th className="py-3 px-4 text-right">Revenue Generated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {topProducts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-neutral-500">
                      No product sales recorded yet.
                    </td>
                  </tr>
                ) : (
                  topProducts.map((p, idx) => (
                    <tr key={p.name} className="hover:bg-neutral-800/20">
                      <td className="py-3 px-4 font-mono font-bold text-amber-400">
                        #{idx + 1}
                      </td>
                      <td className="py-3 px-4 font-semibold text-neutral-200">{p.name}</td>
                      <td className="py-3 px-4 text-center font-mono text-neutral-300">
                        {p.qty}
                      </td>
                      <td className="py-3 px-4 text-right font-serif font-bold text-amber-300">
                        {formatINR(p.revenue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
