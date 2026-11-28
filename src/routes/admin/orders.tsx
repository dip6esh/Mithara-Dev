import { useState, useEffect, useMemo, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "../../lib/supabase";
import { cacheGet, cacheSet, hasCache, useCachedState } from "../../lib/adminCache";
import { fetchInvoiceMap, invoiceHref, issueMissingInvoices, type InvoiceSummary } from "../../lib/invoice";
import { Order, OrderStatus, DeliveryType, PaidVia } from "../../lib/types";
import { isReadyForDispatch, readyLabel } from "../../lib/kitchen";
import { PAID_VIA_LABEL, PAYMENT_TONE_CLASS, STATUS_LABEL, paymentSummary } from "../../lib/orderFlow";
import { useOrdersRealtime } from "../../hooks/useAdminOrders";
import {
  Search,
  Filter,
  ShoppingBag,
  MessageSquare,
  CheckCircle2,
  Clock,
  Truck,
  XCircle,
  Eye,
  Plus,
  RefreshCw,
  Phone,
  MapPin,
  FileText,
  DollarSign,
  AlertCircle,
  X,
  PackageCheck,
} from "lucide-react";
import { WhatsAppButton } from "../../components/admin/WhatsAppButton";
import { toast } from "sonner";
import { ModalBackdrop } from "../../components/ModalBackdrop";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { OrderProgress } from "../../components/admin/OrderProgress";
import { describeAction, type PendingAction } from "../../lib/orderActions";
import { useAuth } from "../../lib/auth";
import { canReverseOrders } from "../../lib/roles";
import { withSortedItems } from "../../lib/orderItems";

/** The note a customer typed at checkout. Manual orders keep their item text in `notes`, so ignore a note that just repeats an item. */
function customerNote(o: Order): string | null {
  const n = o.notes?.trim();
  if (!n) return null;
  return o.order_items?.some((i) => i.name.trim() === n) ? null : n;
}

export const Route = createFileRoute("/admin/orders")({
  // ?tab=ready opens the Ready tab (used by the "order ready" toast).
  validateSearch: (search: Record<string, unknown>): { tab?: "ready" } => ({
    tab: search.tab === "ready" ? "ready" : undefined,
  }),
  head: () => ({
    meta: [{ title: "Mithara Admin — Orders" }],
  }),
  component: AdminOrdersPage,
});

const STATUS_TABS: { label: string; value: string }[] = [
  { label: "Order received", value: "new" },
  { label: "Ready", value: "ready" },
  { label: "Handed over", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Awaiting payment", value: "pending_payment" },
  { label: "All orders", value: "all" },
];

const STATUS_BADGE: Record<OrderStatus, string> = {
  pending_payment: "bg-amber-500/10 text-amber-200 border border-dashed border-amber-500/40",
  new: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
  completed: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  cancelled: "bg-rose-500/20 text-rose-300 border border-rose-500/30",
};

/** Small badge marking orders taken through the demo payment module. */
function DemoBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-amber-300">
      Demo
    </span>
  );
}

function AdminOrdersPage() {
  const [orders, setOrders] = useCachedState<Order[]>("admin:orders:list", []);
  /** Current invoice per order id (issued automatically when payment is received). */
  const [invoiceMap, setInvoiceMap] = useCachedState<Record<string, InvoiceSummary>>("admin:orders:invoices", {});
  const [isLoading, setIsLoading] = useState(() => !hasCache("admin:orders:list"));
  // Order history is never dropped: we load the newest PAGE_SIZE orders and the admin can keep
  // loading older ones. `limitRef` makes live refreshes keep everything already loaded.
  const PAGE_SIZE = 500;
  const limitRef = useRef(PAGE_SIZE);
  /** The quiet "invoice catch-up" runs at most once per visit to this page. */
  const invoiceCatchUpTried = useRef(false);
  const [hasMore, setHasMore] = useCachedState<boolean>("admin:orders:hasMore", false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Matches found by searching the *whole* history on the server (beyond what is loaded).
  const [searchExtra, setSearchExtra] = useState<Order[]>([]);
  const { tab: tabFromLink } = Route.useSearch();
  const [activeTab, setActiveTab] = useState(tabFromLink ?? "new");
  // The "order ready" toast can point here while this page is already open.
  useEffect(() => {
    if (tabFromLink) setActiveTab(tabFromLink);
  }, [tabFromLink]);
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [deliveryFilter, setDeliveryFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [adminNoteInput, setAdminNoteInput] = useState("");
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false);
  /** The action waiting for the admin's "yes" in the confirmation box. */
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  // Cancel, restore and the "undo" actions belong to the Owner and Managers; a Counter / Biller cannot do them.
  const { roles } = useAuth();
  const canReverse = canReverseOrders(roles);

  // Manual order modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newDeliveryType, setNewDeliveryType] = useState<DeliveryType>("delivery");
  const [newAddress, setNewAddress] = useState("");
  const [newItemsText, setNewItemsText] = useState("");
  const [newTotal, setNewTotal] = useState("");

  const fetchOrders = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .order("created_at", { ascending: false })
        .limit(limitRef.current + 1); // one extra row tells us whether older orders exist

      if (error) throw error;
      const rows = data || [];
      setHasMore(rows.length > limitRef.current);
      const page = rows.slice(0, limitRef.current);
      setOrders(withSortedItems(page));
      const paidIds = page.filter((o) => o.payment_status === "paid" && o.status !== "cancelled").map((o) => o.id);
      fetchInvoiceMap(paidIds).then(async (map) => {
        setInvoiceMap(map);
        // Safety net, run quietly: a paid order should always have an invoice. If one is missing,
        // create it now so staff never see a gap or need a special button.
        if (!invoiceCatchUpTried.current && paidIds.some((id) => !map[id])) {
          invoiceCatchUpTried.current = true;
          try {
            if ((await issueMissingInvoices()) > 0) setInvoiceMap(await fetchInvoiceMap(paidIds));
          } catch (e) {
            console.warn("Invoice catch-up skipped", e);
          }
        }
      });
      if (selectedOrder) {
        const updated = page.find((o) => o.id === selectedOrder.id);
        if (updated) setSelectedOrder(updated);
      }
    } catch (err: any) {
      console.error(err);
      if (!silent) toast.error("Failed to load orders");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders(hasCache("admin:orders:list"));
  }, []);

  const loadOlder = async () => {
    setLoadingMore(true);
    limitRef.current += PAGE_SIZE;
    await fetchOrders(true);
    setLoadingMore(false);
  };

  // Search the full history on the server so an old order can always be found by number,
  // name or phone, even when it hasn't been loaded yet.
  useEffect(() => {
    const q = searchQuery.trim().replace(/[,()%*\\]/g, " ").trim();
    if (!hasMore || q.length < 2) {
      setSearchExtra([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .or(`order_number.ilike.%${q}%,customer_name.ilike.%${q}%,customer_phone.ilike.%${q}%`)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!cancelled && !error) setSearchExtra(withSortedItems(data || []));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchQuery, hasMore]);

  // Loaded orders plus any older search matches, newest first, no duplicates.
  const allOrders = useMemo(() => {
    if (searchExtra.length === 0) return orders;
    const seen = new Set(orders.map((o) => o.id));
    const extra = searchExtra.filter((o) => !seen.has(o.id));
    return extra.length === 0
      ? orders
      : [...orders, ...extra].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [orders, searchExtra]);

  // Live updates + a chime/toast when a new order arrives.
  useOrdersRealtime(() => fetchOrders(true));

  useEffect(() => {
    if (selectedOrder) {
      setAdminNoteInput(selectedOrder.admin_notes || "");
    }
  }, [selectedOrder]);

  const handleUpdateStatus = async (orderId: string, status: OrderStatus) => {
    setIsUpdatingOrder(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", orderId);

      if (error) throw error;
      toast.success(`Order marked as ${STATUS_LABEL[status].toLowerCase()}`);
      fetchOrders(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    } finally {
      setIsUpdatingOrder(false);
    }
  };

  /** Hand the order over. If it is not paid yet, `via` records how the money was received. */
  const handleHandover = async (order: Order, via?: PaidVia) => {
    setIsUpdatingOrder(true);
    try {
      const update: Record<string, unknown> = {
        status: "completed",
        updated_at: new Date().toISOString(),
      };
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
      fetchOrders(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to hand over order");
    } finally {
      setIsUpdatingOrder(false);
    }
  };

  /**
   * Record a payment taken before the order is ready (e.g. a pick-up customer who arrives early).
   * Only the payment changes: the order stays "Order received", so it stays on the Kitchen board.
   * The invoice is created by the database the moment the order is marked paid.
   */
  const handleRecordPayment = async (order: Order, via: PaidVia) => {
    setIsUpdatingOrder(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ payment_status: "paid", paid_via: via, updated_at: new Date().toISOString() })
        .eq("id", order.id)
        .eq("status", "new");
      if (error) throw error;
      toast.success(`${PAID_VIA_LABEL[via]} payment recorded`);
      fetchOrders(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to record payment");
    } finally {
      setIsUpdatingOrder(false);
    }
  };

  /** Every action that changes an order or its invoice goes through the confirmation box first. */
  const ask = (action: PendingAction) => {
    const reversing = ["cancel", "restore", "undo_payment", "undo_handover"].includes(action.kind);
    if (reversing && !canReverse) {
      toast.error("Please ask a manager to do this.");
      return;
    }
    setPendingAction(action);
  };

  const runPendingAction = async () => {
    const a = pendingAction;
    if (!a) return;
    switch (a.kind) {
      case "handover_paid":
        await handleHandover(a.order);
        break;
      case "collect":
        await handleHandover(a.order, a.via);
        break;
      case "record_payment":
        await handleRecordPayment(a.order, a.via);
        break;
      case "cancel":
        await handleUpdateStatus(a.order.id, "cancelled");
        break;
      case "restore":
      case "undo_handover":
        await handleUpdateStatus(a.order.id, "new");
        break;
      case "undo_payment":
        await handleMarkUnpaid(a.order.id);
        break;
    }
    setPendingAction(null);
  };

  /** Correction only: undo a "paid" mark. Normal payments are recorded at handover. */
  const handleMarkUnpaid = async (orderId: string) => {
    setIsUpdatingOrder(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ payment_status: "unpaid", updated_at: new Date().toISOString() })
        .eq("id", orderId);

      if (error) throw error;
      toast.success("Payment undone");
      fetchOrders();
    } catch (err: any) {
      toast.error(err.message || "Failed to update payment");
    } finally {
      setIsUpdatingOrder(false);
    }
  };

  const handleSaveAdminNote = async () => {
    if (!selectedOrder) return;
    try {
      const { error } = await supabase
        .from("orders")
        .update({ admin_notes: adminNoteInput, updated_at: new Date().toISOString() })
        .eq("id", selectedOrder.id);

      if (error) throw error;
      toast.success("Admin note saved");
      fetchOrders();
    } catch (err: any) {
      toast.error("Failed to save note");
    }
  };

  const handleCreateManualOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName || !newCustPhone || !newTotal) {
      toast.error("Please fill in customer name, phone, and total amount.");
      return;
    }

    try {
      const totalNum = parseInt(newTotal.replace(/[^0-9]/g, ""), 10) || 0;
      const { data: orderData, error: orderErr } = await supabase
        .from("orders")
        .insert({
          customer_name: newCustName,
          customer_phone: newCustPhone,
          delivery_type: newDeliveryType,
          status: "new",
          payment_status: "unpaid",
          payment_method: "cash",
          total_inr: totalNum,
          subtotal_inr: totalNum,
          address_snapshot: { street: newAddress },
        })
        .select()
        .single();

      if (orderErr) throw orderErr;

      // Add order item
      await supabase.from("order_items").insert({
        order_id: orderData.id,
        name: newItemsText || "Custom Order",
        unit_price: totalNum,
        qty: 1,
      });

      toast.success(`Created order ${orderData.order_number}`);
      setShowCreateModal(false);
      setNewCustName("");
      setNewCustPhone("");
      setNewAddress("");
      setNewItemsText("");
      setNewTotal("");
      fetchOrders();
    } catch (err: any) {
      toast.error(err.message || "Failed to create manual order");
    }
  };

  // Filtered orders
  const filteredOrders = allOrders.filter((order) => {
    if (activeTab === "ready") {
      if (!isReadyForDispatch(order)) return false;
    } else if (activeTab !== "all" && order.status !== activeTab) return false;
    if (paymentFilter !== "all" && order.payment_status !== paymentFilter) return false;
    if (deliveryFilter !== "all" && order.delivery_type !== deliveryFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNumber = order.order_number.toLowerCase().includes(q);
      const matchName = order.customer_name?.toLowerCase().includes(q);
      const matchPhone = order.customer_phone?.toLowerCase().includes(q);
      if (!matchNumber && !matchName && !matchPhone) return false;
    }

    return true;
  });

  const formatINR = (n: number) => "₹" + n.toLocaleString("en-IN");

  return (
    <>
      <div className="adm-stagger space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-serif text-2xl font-bold tracking-tight text-neutral-100 sm:text-3xl">
              Order Management
            </h1>
            <p className="mt-1 text-xs text-neutral-400">
              Track lifecycle, delivery fulfillment, and WhatsApp communication
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchOrders()}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-xl border border-neutral-800 bg-neutral-900/80 px-3.5 py-2 text-xs font-medium text-neutral-300 hover:border-amber-500/30 hover:text-amber-300 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-gold-foreground hover:bg-amber-400 transition-colors shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>Create Manual Order</span>
            </button>
          </div>
        </div>

        {/* Status Tabs */}
        <div className="no-scrollbar flex overflow-x-auto border-b border-neutral-800 pb-1 gap-2">
          {STATUS_TABS.map((tab) => {
            const count =
              tab.value === "all"
                ? orders.length
                : tab.value === "ready"
                  ? orders.filter(isReadyForDispatch).length
                  : orders.filter((o) => o.status === tab.value).length;
            const countLabel = hasMore && tab.value === "all" ? `${count}+` : count;
            const active = activeTab === tab.value;
            if (tab.value === "pending_payment" && count === 0 && !active) return null;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium transition-all ${
                  active
                    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold"
                    : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    tab.value === "ready" && count > 0
                      ? "bg-[#059669] text-white"
                      : active
                        ? "bg-amber-400/20 text-amber-300"
                        : "bg-neutral-800 text-neutral-500"
                  }`}
                >
                  {countLabel}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute top-2.5 left-3 h-4 w-4 text-neutral-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by order # (e.g. MTH-1001), customer name, or phone..."
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950/80 py-2 pr-4 pl-9 text-xs text-neutral-200 placeholder-neutral-600 focus:border-amber-500/50 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="rounded-xl border border-neutral-800 bg-neutral-950/80 px-3 py-2 text-xs text-neutral-300 focus:outline-none"
            >
              <option value="all">All Payments</option>
              <option value="unpaid">To collect</option>
              <option value="paid">Paid</option>
            </select>

            <select
              value={deliveryFilter}
              onChange={(e) => setDeliveryFilter(e.target.value)}
              className="rounded-xl border border-neutral-800 bg-neutral-950/80 px-3 py-2 text-xs text-neutral-300 focus:outline-none"
            >
              <option value="all">All Deliveries</option>
              <option value="delivery">Delivery</option>
              <option value="pickup">Pickup</option>
            </select>
          </div>
        </div>

        {/* Orders Table */}
        <div className="adm-panel overflow-hidden rounded-2xl border border-neutral-800/80 bg-neutral-900/50 backdrop-blur">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-800 bg-neutral-900/80 text-[11px] uppercase tracking-wider text-neutral-400">
                <tr>
                  <th className="py-3.5 px-4 font-semibold">Order</th>
                  <th className="py-3.5 px-4 font-semibold">Customer</th>
                  <th className="py-3.5 px-4 font-semibold">Items</th>
                  <th className="py-3.5 px-4 font-semibold">Total</th>
                  <th className="py-3.5 px-4 font-semibold">Payment</th>
                  <th className="py-3.5 px-4 font-semibold">Status</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-neutral-500">
                      Loading orders...
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-neutral-500">
                      No matching orders found.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => {
                    const cleanPhone = order.customer_phone?.replace(/[^0-9]/g, "");
                    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
                      `Hello ${order.customer_name}, about your Mithara order ${order.order_number} (${STATUS_LABEL[order.status]}).`
                    )}`;

                    const ready = isReadyForDispatch(order);

                    return (
                      <tr
                        key={order.id}
                        className={`cursor-pointer transition-colors ${
                          ready ? "bg-[#10b981]/10 hover:bg-[#10b981]/15" : "hover:bg-neutral-800/30"
                        }`}
                        onClick={() => setSelectedOrder(order)}
                      >
                        <td className="relative py-3.5 px-4">
                          {ready && <span className="absolute inset-y-0 left-0 w-1 bg-[#10b981]" aria-hidden="true" />}
                          <div className="font-mono font-bold text-amber-300">
                            {order.order_number}
                          </div>
                          <div className="text-[10px] text-neutral-500">
                            {new Date(order.created_at).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-medium text-neutral-200">
                            {order.customer_name}
                          </div>
                          <div className="text-[11px] text-neutral-400">
                            {order.customer_phone}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 max-w-xs text-neutral-300">
                          <div className="truncate">
                            {order.order_items?.map((i) => `${i.name} × ${i.qty}`).join(", ") ||
                              order.notes ||
                              "—"}
                          </div>
                          {(customerNote(order) || order.order_items?.some((i) => i.note)) && (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-[10px] font-semibold text-neutral-200">
                              <MessageSquare className="h-3 w-3 text-amber-500" aria-hidden="true" />
                              Customer note
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="font-serif font-bold text-neutral-100">
                            {formatINR(order.total_inr)}
                          </span>
                          <div className="text-[10px] text-neutral-500 capitalize">
                            {order.delivery_type}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          {(() => {
                            const pay = paymentSummary(order);
                            return (
                              <>
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PAYMENT_TONE_CLASS[pay.tone]}`}
                                >
                                  {pay.label}
                                </span>
                                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-neutral-500">
                                  <span className="uppercase tracking-wider">{pay.detail}</span>
                                  {order.payment_mode === "demo" && order.payment_method !== "cash" && <DemoBadge />}
                                </div>
                              </>
                            );
                          })()}
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_BADGE[order.status]}`}
                          >
                            {STATUS_LABEL[order.status]}
                          </span>
                          {ready && (
                            <div className="mt-1.5">
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#059669] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                                <PackageCheck className="h-3 w-3" aria-hidden="true" />
                                {readyLabel(order)}
                              </span>
                            </div>
                          )}
                          {order.status === "new" && order.kitchen_status === "preparing" && (
                            <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#6d5fb3]">
                              In the kitchen
                            </div>
                          )}
                        </td>

                        <td
                          className="py-3.5 px-4 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            <WhatsAppButton href={waUrl} size="sm" />
                            <button
                              onClick={() => setSelectedOrder(order)}
                              title="View Order Details"
                              className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-amber-300"
                            >
                              <Eye className="h-4 w-4" />
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
          {!isLoading && (
            <div className="flex flex-col items-center gap-2 border-t border-neutral-800 px-4 py-4 text-xs text-neutral-400 sm:flex-row sm:justify-between">
              <span>
                {hasMore
                  ? `Showing the ${orders.length} most recent orders. Older orders are kept — load them below, or search to find any order.`
                  : `All ${orders.length} orders loaded.`}
              </span>
              {hasMore && (
                <button
                  onClick={loadOlder}
                  disabled={loadingMore}
                  className="rounded-xl border border-neutral-700 px-4 py-2 font-semibold text-neutral-200 transition-colors hover:bg-neutral-800 disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : `Load ${PAGE_SIZE} older orders`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Selected Order Detail Modal */}
        {selectedOrder && (
          <ModalBackdrop onClose={() => setSelectedOrder(null)}>
            <div className="adm-modal relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-200 shadow-2xl">

              {/* Modal Header */}
              <div className="mb-5 flex items-start justify-between gap-3 border-b border-neutral-800 pb-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xl font-bold text-amber-300">
                      {selectedOrder.order_number}
                    </span>
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-400 border border-amber-500/20">
                      {selectedOrder.delivery_type.toUpperCase()}
                    </span>
                    {selectedOrder.payment_mode === "demo" && selectedOrder.payment_method !== "cash" && <DemoBadge />}
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">
                    Placed on{" "}
                    {new Date(selectedOrder.created_at).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>

                <div className="flex shrink-0 items-start gap-2">
                  <div className="text-right">
                    <div className="font-serif text-2xl font-bold leading-none text-neutral-100">
                      {formatINR(selectedOrder.total_inr)}
                    </div>
                    <div className="mt-2 flex justify-end">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PAYMENT_TONE_CLASS[paymentSummary(selectedOrder).tone]}`}
                      >
                        {paymentSummary(selectedOrder).label}
                      </span>
                    </div>
                  </div>
                  <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  aria-label="Close"
                  className="-mr-2 -mt-1 shrink-0 rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
                >
                  <X className="h-5 w-5" />
                </button>
                </div>
              </div>

              {isReadyForDispatch(selectedOrder) && (
                <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[#10b981]/40 bg-[#10b981]/10 px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#059669] text-white">
                    <PackageCheck className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-neutral-100">{readyLabel(selectedOrder)}</p>
                    <p className="text-xs text-neutral-400">The kitchen has finished this order.</p>
                  </div>
                </div>
              )}

              {/* Bill breakdown: subtotal, delivery (with free-delivery rule), tax, total */}
              <div className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 text-sm">
                <div className="flex justify-between text-neutral-400">
                  <span>Subtotal</span>
                  <span className="tabular-nums text-neutral-200">{formatINR(selectedOrder.subtotal_inr)}</span>
                </div>
                <div className="mt-1.5 flex justify-between text-neutral-400">
                  <span>{selectedOrder.delivery_type === "pickup" ? "Pickup" : "Delivery"}</span>
                  <span
                    className={`tabular-nums ${
                      selectedOrder.delivery_fee_inr > 0 ? "text-neutral-200" : "text-emerald-300"
                    }`}
                  >
                    {selectedOrder.delivery_fee_inr > 0 ? formatINR(selectedOrder.delivery_fee_inr) : "Free"}
                  </span>
                </div>
                {(selectedOrder.tax_inr ?? 0) > 0 && (
                  <div className="mt-1.5 flex justify-between text-neutral-400">
                    <span>
                      {selectedOrder.tax_label || "Tax"}
                      {selectedOrder.tax_rate ? ` (${selectedOrder.tax_rate}%)` : ""}
                      {selectedOrder.tax_inclusive ? " · included in prices" : ""}
                    </span>
                    <span className="tabular-nums text-neutral-200">{formatINR(selectedOrder.tax_inr ?? 0)}</span>
                  </div>
                )}
                <div className="mt-2 flex justify-between border-t border-dashed border-neutral-800 pt-2 font-semibold text-neutral-100">
                  <span>Total</span>
                  <span className="tabular-nums">{formatINR(selectedOrder.total_inr)}</span>
                </div>
              </div>

              {/* Order handling: Received -> Paid -> Ready -> Handed over */}
              <section className="mb-6 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/60">
                <header className="flex items-center justify-between gap-2 border-b border-neutral-800 px-4 py-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Order status</h3>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_BADGE[selectedOrder.status]}`}
                  >
                    {STATUS_LABEL[selectedOrder.status]}
                  </span>
                </header>

                <div className="space-y-4 px-4 py-4">
                  <OrderProgress order={selectedOrder} />

                  {/* Next step: one clear thing to do */}
                  {selectedOrder.status === "new" && selectedOrder.payment_status === "paid" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900/70 px-3.5 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-neutral-100">Payment received</p>
                          <p className="text-xs text-neutral-400">
                            {selectedOrder.paid_via ? PAID_VIA_LABEL[selectedOrder.paid_via] : paymentSummary(selectedOrder).detail}
                            {" · "}nothing to collect
                          </p>
                        </div>
                        <span className="shrink-0 font-serif text-lg font-bold tabular-nums text-neutral-100">
                          {formatINR(selectedOrder.total_inr)}
                        </span>
                      </div>
                      {selectedOrder.kitchen_status !== "ready" && (
                        <p className="text-xs text-neutral-400">The kitchen has not marked this order ready yet.</p>
                      )}
                      <button
                        disabled={isUpdatingOrder}
                        onClick={() => ask({ kind: "handover_paid", order: selectedOrder })}
                        className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-gold-foreground shadow-md shadow-amber-500/20 hover:bg-amber-400 disabled:opacity-60"
                      >
                        Mark handed over
                      </button>
                    </div>
                  )}

                  {selectedOrder.status === "new" && selectedOrder.payment_status !== "paid" && (() => {
                    // Kitchen finished: collect and hand over in one go. Not finished yet (e.g. a pick-up
                    // customer arrived early and wants to pay): only record the payment, order stays in the kitchen.
                    const ready = selectedOrder.kitchen_status === "ready";
                    const kind = ready ? "collect" : "record_payment";
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900/70 px-3.5 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-neutral-100">Amount to collect</p>
                            <p className="text-xs text-neutral-400">
                              {ready ? "Collect at handover" : "Collect now or at handover"}
                            </p>
                          </div>
                          <span className="shrink-0 font-serif text-lg font-bold tabular-nums text-amber-300">
                            {formatINR(selectedOrder.total_inr)}
                          </span>
                        </div>

                        <div>
                          <p className="mb-2 text-xs font-medium text-neutral-400">How was it paid?</p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              disabled={isUpdatingOrder}
                              onClick={() => ask({ kind, order: selectedOrder, via: "cash" })}
                              className="rounded-xl bg-amber-500 px-3 py-2.5 text-sm font-bold text-gold-foreground shadow-md shadow-amber-500/20 hover:bg-amber-400 disabled:opacity-60"
                            >
                              {ready ? "Cash & hand over" : "Record cash"}
                            </button>
                            <button
                              disabled={isUpdatingOrder}
                              onClick={() => ask({ kind, order: selectedOrder, via: "upi" })}
                              className="rounded-xl bg-amber-500 px-3 py-2.5 text-sm font-bold text-gold-foreground shadow-md shadow-amber-500/20 hover:bg-amber-400 disabled:opacity-60"
                            >
                              {ready ? "UPI & hand over" : "Record UPI"}
                            </button>
                          </div>
                        </div>

                        {!ready && (
                          <p className="text-xs leading-relaxed text-neutral-500">
                            The order is not ready yet. Recording a payment keeps it in the kitchen until you hand it over.
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {selectedOrder.status === "completed" && (
                    <p className="text-sm text-neutral-300">
                      Handed over · {paymentSummary(selectedOrder).label} ({paymentSummary(selectedOrder).detail})
                      {selectedOrder.paid_at
                        ? ` · ${new Date(selectedOrder.paid_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`
                        : ""}
                    </p>
                  )}

                  {selectedOrder.status === "pending_payment" && (
                    <p className="text-sm text-neutral-400">
                      The customer is still paying online. It becomes an order once payment goes through.
                    </p>
                  )}

                  {selectedOrder.status === "cancelled" && (
                    <p className="text-sm text-neutral-400">
                      Cancelled orders do not count as sales. You can bring it back if this was a mistake.
                    </p>
                  )}
                </div>

                {/* Same place on every order: undo / cancel / restore */}
                {canReverse && (
                <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 bg-neutral-900/40 px-4 py-3">
                  {selectedOrder.status === "cancelled" ? (
                    <button
                      disabled={isUpdatingOrder}
                      onClick={() => ask({ kind: "restore", order: selectedOrder })}
                      className="text-xs font-semibold text-amber-300 hover:text-amber-200 disabled:opacity-60"
                    >
                      Restore this order
                    </button>
                  ) : (
                    <button
                      disabled={isUpdatingOrder}
                      onClick={() => ask({ kind: "cancel", order: selectedOrder })}
                      className="text-xs font-semibold text-rose-300 hover:text-rose-200 disabled:opacity-60"
                    >
                      Cancel this order
                    </button>
                  )}
                  {selectedOrder.status === "completed" && (
                    <button
                      disabled={isUpdatingOrder}
                      onClick={() => ask({ kind: "undo_handover", order: selectedOrder })}
                      className="text-xs font-medium text-neutral-400 hover:text-neutral-200 disabled:opacity-60"
                    >
                      Move back to Order received
                    </button>
                  )}
                </footer>
                )}
              </section>

              {/* Customer & Address Info */}
              <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                      Customer
                    </span>
                    <WhatsAppButton
                      href={`https://wa.me/${selectedOrder.customer_phone.replace(/[^0-9]/g, "")}`}
                      size="sm"
                    />
                  </div>
                  <div className="text-sm font-semibold text-neutral-200">
                    {selectedOrder.customer_name}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-neutral-400">
                    <Phone className="h-3 w-3" />
                    <span>{selectedOrder.customer_phone}</span>
                  </div>
                  {selectedOrder.customer_email && (
                    <div className="text-xs text-neutral-500 mt-0.5">
                      {selectedOrder.customer_email}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    Fulfillment & Address
                  </span>
                  {selectedOrder.delivery_type === "pickup" ? (
                    <div className="text-sm text-neutral-300">
                      Self-pickup at Mithara kitchen
                    </div>
                  ) : selectedOrder.address_snapshot ? (
                    <div className="text-xs text-neutral-300 space-y-0.5">
                      <div className="font-medium text-amber-300">
                        {selectedOrder.address_snapshot.label || "Delivery Address"}
                      </div>
                      <div>
                        {[
                          selectedOrder.address_snapshot.flat,
                          selectedOrder.address_snapshot.building,
                          selectedOrder.address_snapshot.street,
                          selectedOrder.address_snapshot.area,
                          selectedOrder.address_snapshot.city,
                          selectedOrder.address_snapshot.pincode,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                      {selectedOrder.address_snapshot.instructions && (
                        <div className="text-neutral-500 italic">
                          Note: {selectedOrder.address_snapshot.instructions}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-neutral-500">No address recorded</div>
                  )}
                </div>
              </div>

              {/* Note the customer typed at checkout */}
              {customerNote(selectedOrder) && (
                <div className="mb-6 rounded-2xl border border-neutral-800 border-l-2 border-l-amber-500 bg-neutral-950 p-4">
                  <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    <MessageSquare className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                    Customer&apos;s note
                  </span>
                  <p className="whitespace-pre-wrap break-words text-sm text-neutral-100">
                    {customerNote(selectedOrder)}
                  </p>
                </div>
              )}

              {/* Order Items */}
              <div className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <span className="mb-3 block text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Itemized Order
                </span>
                <div className="divide-y divide-neutral-800/80">
                  {selectedOrder.order_items?.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-2 text-xs"
                    >
                      <div>
                        <span className="font-medium text-neutral-200">{item.name}</span>
                        {item.variant && (
                          <span className="text-neutral-500 ml-1.5">({item.variant})</span>
                        )}
                        <span className="text-amber-400 ml-2">× {item.qty}</span>
                        {item.note && (
                          <p className="mt-0.5 border-l-2 border-amber-500 pl-2 text-xs font-medium text-amber-300">Note: {item.note}</p>
                        )}
                      </div>
                      <span className="font-mono font-semibold text-neutral-200">
                        {formatINR(item.unit_price * item.qty)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment record */}
              <div className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Payment
                </span>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-neutral-200">
                    {selectedOrder.payment_method === "cash"
                      ? "Customer chose: pay at handover"
                      : `Customer chose: pay online (${selectedOrder.payment_method})`}
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PAYMENT_TONE_CLASS[paymentSummary(selectedOrder).tone]}`}
                  >
                    {paymentSummary(selectedOrder).label}
                  </span>
                </div>
                {selectedOrder.payment_status === "paid" && selectedOrder.status !== "cancelled" && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-xs">
                    <span className="text-neutral-400">
                      Invoice{" "}
                      {invoiceMap[selectedOrder.id] ? (
                        <span className="font-mono font-bold text-neutral-100">
                          {invoiceMap[selectedOrder.id].invoice_number}
                          {invoiceMap[selectedOrder.id].is_test ? " (test)" : ""}
                        </span>
                      ) : (
                        <span className="text-neutral-500">is being created…</span>
                      )}
                    </span>
                    {invoiceMap[selectedOrder.id] && (
                      <a
                        href={invoiceHref(invoiceMap[selectedOrder.id].id)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-neutral-800 px-2.5 py-1 font-medium text-neutral-300 hover:border-amber-500/40 hover:text-amber-300"
                      >
                        <FileText className="h-3.5 w-3.5" /> View invoice
                      </a>
                    )}
                  </div>
                )}
                {selectedOrder.payment_status !== "paid" && selectedOrder.status !== "cancelled" && (
                  <p className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-xs text-neutral-400">
                    Invoice: created automatically when payment is received.
                  </p>
                )}
                {canReverse && selectedOrder.payment_status === "paid" && selectedOrder.status !== "cancelled" && (
                  <button
                    disabled={isUpdatingOrder}
                    onClick={() => ask({ kind: "undo_payment", order: selectedOrder })}
                    title="Use this if payment was recorded by mistake. The invoice will be marked Cancelled."
                    className="mt-3 text-xs font-medium text-neutral-500 hover:text-neutral-300 disabled:opacity-60"
                  >
                    Marked paid by mistake? Undo payment
                  </button>
                )}
              </div>

              {/* Private Admin Notes */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Staff note (shown on Kitchen and KOT)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={adminNoteInput}
                    onChange={(e) => setAdminNoteInput(e.target.value)}
                    placeholder="Add private note (e.g. VIP client, extra pistachios requested)..."
                    className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    onClick={handleSaveAdminNote}
                    className="rounded-xl bg-amber-500/20 px-4 py-2 text-xs font-semibold text-amber-300 border border-amber-500/30 hover:bg-amber-500/30"
                  >
                    Save Note
                  </button>
                </div>
              </div>
            </div>
          </ModalBackdrop>
        )}

        {/* Manual Order Creation Modal */}
        {showCreateModal && (
          <ModalBackdrop onClose={() => setShowCreateModal(false)}>
            <div className="adm-modal relative w-full max-w-lg rounded-3xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-200 shadow-2xl">

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-serif text-xl font-bold text-neutral-100">
                    Create Manual Phone / Walk-in Order
                  </h2>
                  <p className="mt-1 text-xs text-neutral-400">
                    Log an offline order into the Mithara system
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  aria-label="Close"
                  className="-mr-2 -mt-1 shrink-0 rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateManualOrder} className="mt-6 space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-300">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    required
                    placeholder="e.g. Priya Sharma"
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-300">
                    Customer Phone (WhatsApp) *
                  </label>
                  <input
                    type="text"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    required
                    placeholder="e.g. +91 98765 43210"
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-300">
                      Type
                    </label>
                    <select
                      value={newDeliveryType}
                      onChange={(e) => setNewDeliveryType(e.target.value as DeliveryType)}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-xs text-neutral-200 focus:outline-none"
                    >
                      <option value="delivery">Delivery</option>
                      <option value="pickup">Pickup</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-300">
                      Total INR (₹) *
                    </label>
                    <input
                      type="number"
                      value={newTotal}
                      onChange={(e) => setNewTotal(e.target.value)}
                      required
                      placeholder="e.g. 1150"
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-300">
                    Items & Notes
                  </label>
                  <textarea
                    rows={2}
                    value={newItemsText}
                    onChange={(e) => setNewItemsText(e.target.value)}
                    placeholder="e.g. 1x Classic Kunafa, 1x 12pc Pistachio Square"
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {newDeliveryType === "delivery" && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-300">
                      Delivery Address
                    </label>
                    <textarea
                      rows={2}
                      value={newAddress}
                      onChange={(e) => setNewAddress(e.target.value)}
                      placeholder="e.g. Flat 402, Sunshine Heights, Bandra West"
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full rounded-xl bg-amber-500 py-3 text-xs font-bold text-gold-foreground hover:bg-amber-400 transition-colors shadow"
                >
                  Confirm & Save Order
                </button>
              </form>
            </div>
          </ModalBackdrop>
        )}
      </div>

      {/* Confirmation box: says what will happen before any order/payment/invoice change */}
      {pendingAction && (() => {
        const copy = describeAction(pendingAction, invoiceMap[pendingAction.order.id]);
        return (
          <ConfirmDialog
            title={copy.title}
            intro={copy.intro}
            effects={copy.effects}
            confirmLabel={copy.confirmLabel}
            cancelLabel={copy.cancelLabel}
            tone={copy.tone}
            busy={isUpdatingOrder}
            onConfirm={runPendingAction}
            onClose={() => setPendingAction(null)}
          />
        );
      })()}
    </>
  );
}
