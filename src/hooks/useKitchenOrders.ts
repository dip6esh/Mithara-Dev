import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useCachedState, hasCache } from "../lib/adminCache";
import { KITCHEN_CACHE_KEY, isMissingKitchenColumn, kitchenStatusOf } from "../lib/kitchen";
import { markOrdersSeenForTeam } from "../lib/seenOrders";
import type { KitchenStatus, Order } from "../lib/types";

const CACHE_KEY = KITCHEN_CACHE_KEY;
const POLL_MS = 45_000;

/**
 * Live list of orders the kitchen is working on (status "new" only).
 *
 * Built to stay light:
 *  - one small query (open orders only, no history, no invoices);
 *  - realtime events are applied to the list in place, so a tap on one ticket never reloads the board;
 *  - a slow poll + a refetch when the tab wakes up covers a dropped realtime connection.
 */
export function useKitchenOrders() {
  const [orders, setOrders] = useCachedState<Order[]>(CACHE_KEY, []);
  const [loading, setLoading] = useState(() => !hasCache(CACHE_KEY));
  const [busyId, setBusyId] = useState<string | null>(null);
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  const load = useCallback(
    async (silent = true) => {
      if (!silent) setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("status", "new")
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) {
        console.error("Kitchen load error:", error);
        if (!silent) toast.error("Could not load kitchen orders");
      } else {
        setOrders((data as Order[]) ?? []);
      }
      setLoading(false);
    },
    [setOrders],
  );

  /** One order, with its items: used when realtime reports an order we do not have yet. */
  const loadOne = useCallback(
    async (id: string, retry = true) => {
      const { data } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("id", id)
        .eq("status", "new")
        .maybeSingle();
      if (!data) return;
      const row = data as Order;
      setOrders((prev) =>
        prev.some((o) => o.id === row.id)
          ? prev.map((o) => (o.id === row.id ? row : o))
          : [...prev, row].sort((a, b) => a.created_at.localeCompare(b.created_at)),
      );
      // Orders typed in by hand are saved first and their items a moment later: look once more.
      if (retry && !(row.order_items && row.order_items.length)) {
        setTimeout(() => void loadOne(id, false), 2000);
      }
    },
    [setOrders],
  );

  useEffect(() => {
    void load(hasCache(CACHE_KEY));

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`admin-kitchen-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string })?.id;
            if (id) setOrders((prev) => prev.filter((o) => o.id !== id));
            return;
          }
          const row = payload.new as Order;
          if (row.status !== "new") {
            // Handed over, cancelled, or still awaiting payment: not the kitchen's business.
            setOrders((prev) => (prev.some((o) => o.id === row.id) ? prev.filter((o) => o.id !== row.id) : prev));
            return;
          }
          if (ordersRef.current.some((o) => o.id === row.id)) {
            // Known order: patch its fields, keep the items we already loaded.
            setOrders((prev) => prev.map((o) => (o.id === row.id ? { ...o, ...row, order_items: o.order_items } : o)));
          } else {
            void loadOne(row.id);
          }
        })
        .subscribe();
    } catch {
      /* the poll below still keeps the board fresh */
    }

    const poll = setInterval(() => void load(true), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, [load, loadOne, setOrders]);

  /** Move a ticket to a new kitchen step. Instant on screen; rolls back if it could not be saved. */
  const setStatus = useCallback(
    async (order: Order, next: KitchenStatus) => {
      markOrdersSeenForTeam([order.id]); // the kitchen has clearly seen it: no new-order pop-up for anyone
      const before = ordersRef.current;
      const nowIso = new Date().toISOString();
      setBusyId(order.id);
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, kitchen_status: next, kitchen_status_at: nowIso } : o)),
      );
      const { data, error } = await supabase
        .from("orders")
        .update({ kitchen_status: next, updated_at: nowIso })
        .eq("id", order.id)
        .eq("status", "new") // never touch an order that was handed over or cancelled meanwhile
        .select("id");
      setBusyId(null);

      if (error) {
        setOrders(before);
        toast.error(
          isMissingKitchenColumn(error)
            ? "Kitchen status is not set up yet. Run migration 012_kitchen_status.sql in Supabase."
            : error.message || "Could not update the order",
        );
        return;
      }
      if (!data || data.length === 0) {
        // Someone handed it over or cancelled it just now.
        setOrders((prev) => prev.filter((o) => o.id !== order.id));
        toast.info(`Order ${order.order_number} is no longer in the kitchen.`);
      }
    },
    [setOrders],
  );

  const counts = {
    new: orders.filter((o) => kitchenStatusOf(o) === "new").length,
    preparing: orders.filter((o) => kitchenStatusOf(o) === "preparing").length,
    ready: orders.filter((o) => kitchenStatusOf(o) === "ready").length,
  };

  return { orders, counts, loading, busyId, setStatus, refresh: () => load(false) };
}
