import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "../../lib/supabase";
import { cacheGet, cacheSet, hasCache, useCachedState } from "../../lib/adminCache";
import { STATUS_LABEL } from "../../lib/orderFlow";
import { Order, CustomerAddress } from "../../lib/types";
import {
  Users,
  Search,
  MessageSquare,
  ShoppingBag,
  MapPin,
  Calendar,
  FileText,
  X,
  RefreshCw,
  Phone,
  Mail,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { ModalBackdrop } from "../../components/ModalBackdrop";

export const Route = createFileRoute("/admin/customers")({
  head: () => ({
    meta: [{ title: "Mithara Admin — Customers" }],
  }),
  component: AdminCustomersPage,
});

type CustomerRow = {
  key: string;
  id: string | null;
  name: string;
  phone: string;
  email: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderDate: string;
  orders: Order[];
  addresses: CustomerAddress[];
};

function AdminCustomersPage() {
  const [customers, setCustomers] = useCachedState<CustomerRow[]>("admin:customers:list", []);
  const [isLoading, setIsLoading] = useState(() => !hasCache("admin:customers:list"));
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);

  const fetchCustomers = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      // Orders and saved addresses are independent — fetch them together.
      const [ordersRes, addressesRes] = await Promise.all([
        supabase.from("orders").select("*, order_items(*)").order("created_at", { ascending: false }),
        supabase.from("customer_addresses").select("*"),
      ]);
      const { data: orders, error: ordersErr } = ordersRes;

      if (ordersErr) throw ordersErr;

      // Group orders by phone or customer_id
      const map = new Map<string, CustomerRow>();

      (orders || []).forEach((order: Order) => {
        const key = order.customer_phone?.trim() || order.customer_id || order.id;
        if (!map.has(key)) {
          map.set(key, {
            key,
            id: order.customer_id,
            name: order.customer_name || "Guest Customer",
            phone: order.customer_phone || "",
            email: order.customer_email || null,
            orderCount: 0,
            totalSpent: 0,
            lastOrderDate: order.created_at,
            orders: [],
            addresses: [],
          });
        }

        const row = map.get(key)!;
        row.orderCount += 1;
        if (order.status === "new" || order.status === "completed") {
          row.totalSpent += order.total_inr || 0;
        }
        row.orders.push(order);
      });

      // Attach saved addresses to registered customers (index by id once, instead of
      // scanning every customer for every address).
      const addresses = addressesRes.data;
      if (addresses) {
        const byCustomerId = new Map<string, CustomerRow[]>();
        for (const row of map.values()) {
          if (!row.id) continue;
          const list = byCustomerId.get(row.id);
          if (list) list.push(row);
          else byCustomerId.set(row.id, [row]);
        }
        addresses.forEach((addr: CustomerAddress) => {
          byCustomerId.get(addr.customer_id)?.forEach((row) => row.addresses.push(addr));
        });
      }

      setCustomers(Array.from(map.values()));
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load customer profiles");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers(hasCache("admin:customers:list"));
  }, []);

  const filteredCustomers = customers.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      (c.email && c.email.toLowerCase().includes(q))
    );
  });

  const formatINR = (n: number) => "₹" + n.toLocaleString("en-IN");

  return (
    <>
      <div className="adm-stagger space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-serif text-2xl font-bold tracking-tight text-neutral-100 sm:text-3xl">
              Customer Directory
            </h1>
            <p className="mt-1 text-xs text-neutral-400">
              Profiles, lifetime order history, and saved address books
            </p>
          </div>

          <button
            onClick={() => fetchCustomers()}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-xl border border-neutral-800 bg-neutral-900/80 px-3.5 py-2 text-xs font-medium text-neutral-300 hover:border-amber-500/30 hover:text-amber-300 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute top-2.5 left-3 h-4 w-4 text-neutral-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer name, phone, or email..."
            className="w-full rounded-xl border border-neutral-800 bg-neutral-900/70 py-2 pr-4 pl-9 text-xs text-neutral-200 placeholder-neutral-600 focus:border-amber-500/50 focus:outline-none"
          />
        </div>

        {/* Table */}
        <div className="adm-panel overflow-hidden rounded-2xl border border-neutral-800/80 bg-neutral-900/50 backdrop-blur">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-800 bg-neutral-900/80 text-[11px] uppercase tracking-wider text-neutral-400">
                <tr>
                  <th className="py-3.5 px-4 font-semibold">Customer</th>
                  <th className="py-3.5 px-4 font-semibold">Contact</th>
                  <th className="py-3.5 px-4 font-semibold">Total Orders</th>
                  <th className="py-3.5 px-4 font-semibold">Lifetime Spend</th>
                  <th className="py-3.5 px-4 font-semibold">Last Ordered</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-neutral-500">
                      Loading customer directory...
                    </td>
                  </tr>
                ) : filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-neutral-500">
                      No customer profiles found.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((cust) => {
                    const cleanPhone = cust.phone?.replace(/[^0-9]/g, "");
                    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
                      `Hello ${cust.name}, warmest greetings from Mithara!`
                    )}`;

                    return (
                      <tr
                        key={cust.key}
                        onClick={() => setSelectedCustomer(cust)}
                        className="hover:bg-neutral-800/30 transition-colors cursor-pointer"
                      >
                        <td className="py-3.5 px-4 font-medium text-neutral-200">
                          <div className="font-semibold text-sm text-neutral-100">
                            {cust.name}
                          </div>
                          {cust.id && (
                            <span className="rounded bg-amber-500/10 px-1.5 py-0.2 text-[9px] font-bold text-amber-400 border border-amber-500/20">
                              REGISTERED PROFILE
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="text-neutral-300 font-mono">{cust.phone}</div>
                          {cust.email && (
                            <div className="text-[11px] text-neutral-500">{cust.email}</div>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs font-semibold text-neutral-300">
                            {cust.orderCount} {cust.orderCount === 1 ? "order" : "orders"}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="font-serif font-bold text-amber-200 text-sm">
                            {formatINR(cust.totalSpent)}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-neutral-400 text-xs">
                          {new Date(cust.lastOrderDate).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>

                        <td
                          className="py-3.5 px-4 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Message on WhatsApp"
                              className="rounded-lg p-1.5 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                            >
                              <MessageSquare className="h-4 w-4" />
                            </a>
                            <button
                              onClick={() => setSelectedCustomer(cust)}
                              className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-amber-300"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Customer Detail Drawer */}
        {selectedCustomer && (
          <ModalBackdrop onClose={() => setSelectedCustomer(null)}>
            <div className="adm-modal relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-200 shadow-2xl">
              <button
                onClick={() => setSelectedCustomer(null)}
                className="absolute top-6 right-6 text-neutral-400 hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Customer Profile Header */}
              <div className="mb-6 border-b border-neutral-800 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-serif text-2xl font-bold text-neutral-100">
                      {selectedCustomer.name}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-400">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3 text-amber-400" />
                        {selectedCustomer.phone}
                      </span>
                      {selectedCustomer.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3 text-neutral-400" />
                          {selectedCustomer.email}
                        </span>
                      )}
                    </div>
                  </div>

                  <a
                    href={`https://wa.me/${selectedCustomer.phone.replace(/[^0-9]/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>WhatsApp</span>
                  </a>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-neutral-950/60 p-3 border border-neutral-800">
                    <span className="text-[10px] uppercase text-neutral-500">
                      Lifetime Orders
                    </span>
                    <p className="font-serif text-lg font-bold text-neutral-100">
                      {selectedCustomer.orderCount}
                    </p>
                  </div>

                  <div className="rounded-xl bg-neutral-950/60 p-3 border border-neutral-800">
                    <span className="text-[10px] uppercase text-neutral-500">
                      Lifetime Spend
                    </span>
                    <p className="font-serif text-lg font-bold text-amber-300">
                      {formatINR(selectedCustomer.totalSpent)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-neutral-950/60 p-3 border border-neutral-800">
                    <span className="text-[10px] uppercase text-neutral-500">
                      Avg. Order Value
                    </span>
                    <p className="font-serif text-lg font-bold text-neutral-100">
                      {selectedCustomer.orderCount > 0
                        ? formatINR(
                            Math.round(
                              selectedCustomer.totalSpent / selectedCustomer.orderCount
                            )
                          )
                        : "₹0"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Saved Addresses (if any) */}
              <div className="mb-6">
                <span className="mb-3 block text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Saved Address Book ({selectedCustomer.addresses.length})
                </span>

                {selectedCustomer.addresses.length === 0 ? (
                  <p className="text-xs text-neutral-500 italic">
                    No recurring addresses saved to profile yet. Addresses are captured with individual orders.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {selectedCustomer.addresses.map((addr) => (
                      <div
                        key={addr.id}
                        className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3 text-xs"
                      >
                        <div className="flex items-center justify-between font-semibold text-amber-300">
                          <span>{addr.label}</span>
                          {addr.is_default && (
                            <span className="text-[9px] rounded bg-amber-500/20 px-1 py-0.2 text-amber-400">
                              DEFAULT
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-neutral-300">
                          {[addr.flat, addr.building, addr.street, addr.area, addr.city, addr.pincode]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                        {addr.instructions && (
                          <p className="mt-1 text-[11px] text-neutral-500 italic">
                            "{addr.instructions}"
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Order History */}
              <div>
                <span className="mb-3 block text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Full Order History ({selectedCustomer.orders.length})
                </span>

                <div className="space-y-2">
                  {selectedCustomer.orders.map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-amber-300">
                            {o.order_number}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.2 text-[9px] font-bold uppercase ${
                              o.status === "completed"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : o.status === "cancelled"
                                ? "bg-rose-500/20 text-rose-300"
                                : "bg-amber-500/20 text-amber-300"
                            }`}
                          >
                            {STATUS_LABEL[o.status]}
                          </span>
                        </div>
                        <p className="mt-0.5 text-neutral-400 text-[11px]">
                          {new Date(o.created_at).toLocaleString("en-IN", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="font-serif font-bold text-neutral-200">
                          {formatINR(o.total_inr)}
                        </span>
                        <div className="text-[10px] text-neutral-500 uppercase">
                          {o.delivery_type}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ModalBackdrop>
        )}
      </div>
    </>
  );
}
