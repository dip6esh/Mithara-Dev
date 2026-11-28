import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useCachedState, hasCache } from "../lib/adminCache";
import { KITCHEN_CACHE_KEY, isMissingItemColumn, isMissingKitchenColumn, kitchenStatusOf } from "../lib/kitchen";
import { markOrdersSeenForTeam } from "../lib/seenOrders";
import { sortOrderItems } from "../lib/orderItems";
import type { KitchenStatus, Order, OrderItem } from "../lib/types";

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

  /**
   * Item ticks the kitchen has just made. While a tick is being saved, and for a few seconds after, this
   * is the truth for that item: a board refresh or a live update that was already on its way (and so
   * carries the older value) must not flip the switch back. Without this, a tap could appear to "un-tap".
   */
  const guardRef = useRef(new Map<string, { value: string | null; until: number | null }>());
  const writesRef = useRef(new Map<string, { desired: string | null; confirmed: string | null; writing: boolean }>());

  /**
   * Keeps an order's items in one fixed order. With migration 016 that is each item's position number. Without
   * it, the order the board first saw is remembered and kept, so ticking an item never moves it.
   */
  const itemOrderRef = useRef(new Map<string, string[]>());
  const stabilize = useCallback((o: Order): Order => {
    const items = o.order_items;
    if (!items || items.length < 2) return o;
    if (items.every((i) => typeof i.seq === "number")) return { ...o, order_items: sortOrderItems(items) };
    const known = itemOrderRef.current.get(o.id);
    if (!known) {
      itemOrderRef.current.set(o.id, items.map((i) => i.id));
      return o;
    }
    const seen = new Set(known);
    const next = [...known, ...items.filter((i) => !seen.has(i.id)).map((i) => i.id)];
    if (next.length !== known.length) itemOrderRef.current.set(o.id, next);
    const rank = new Map(next.map((id, idx) => [id, idx]));
    return { ...o, order_items: [...items].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)) };
  }, []);

  const reconcile = useCallback((list: Order[]): Order[] => {
    const g = guardRef.current;
    if (g.size === 0) return list;
    const now = Date.now();
    for (const [id, e] of g) if (e.until !== null && e.until < now) g.delete(id);
    if (g.size === 0) return list;
    return list.map((o) =>
      o.order_items?.some((i) => g.has(i.id))
        ? { ...o, order_items: o.order_items.map((i) => (g.has(i.id) ? { ...i, prepared_at: g.get(i.id)!.value } : i)) }
        : o,
    );
  }, []);

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
        setOrders(reconcile((data as Order[]) ?? []).map(stabilize));
      }
      setLoading(false);
    },
    [setOrders, reconcile, stabilize],
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
      const row = stabilize(reconcile([data as Order])[0]);
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
    [setOrders, reconcile, stabilize],
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
        // Item ticks made on another kitchen screen show up here straight away.
        .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, (payload) => {
          if (payload.eventType === "DELETE") return;
          const incoming = payload.new as OrderItem;
          // A live update that arrives after the kitchen's own newer tap carries the older value: ignore that part.
          const g = guardRef.current.get(incoming.id);
          const row = g && (g.until === null || g.until > Date.now()) ? { ...incoming, prepared_at: g.value } : incoming;
          setOrders((prev) =>
            prev.map((o) => {
              if (o.id !== row.order_id) return o;
              const items = o.order_items ?? [];
              return stabilize({
                ...o,
                order_items: items.some((i) => i.id === row.id)
                  ? items.map((i) => (i.id === row.id ? { ...i, ...row } : i))
                  : [...items, row],
              });
            }),
          );
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
  }, [load, loadOne, setOrders, stabilize]);

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

  const setItemLocal = useCallback(
    (orderId: string, itemId: string, value: string | null) =>
      setOrders((prev) =>
        prev.map((o) =>
          o.id !== orderId
            ? o
            : { ...o, order_items: (o.order_items ?? []).map((i) => (i.id === itemId ? { ...i, prepared_at: value } : i)) },
        ),
      ),
    [setOrders],
  );

  /**
   * Saves one item's tick. Taps on the same item are sent one after another and always end on the LAST tap,
   * so quick on/off/on can never land out of order. Only that one item is rolled back if saving fails.
   */
  const flushItem = useCallback(
    async (order: Order, itemId: string): Promise<boolean> => {
      const st = writesRef.current.get(itemId);
      if (!st || st.writing) return false;
      st.writing = true;
      try {
        while (st.confirmed !== st.desired) {
          const target = st.desired;
          const { data, error } = await supabase
            .from("order_items")
            .update({ prepared_at: target })
            .eq("id", itemId)
            .select("id");
          // A refused update (no permission) is not an error from the database: it just changes nothing.
          if (error || !data || data.length === 0) {
            guardRef.current.delete(itemId);
            writesRef.current.delete(itemId);
            setItemLocal(order.id, itemId, st.confirmed);
            toast.error(
              error
                ? isMissingItemColumn(error)
                  ? "Item ticks are not set up yet. Run migration 015_kitchen_item_progress.sql in Supabase."
                  : error.message || "Could not update the item"
                : "This login is not allowed to tick items. Ask the owner to run the latest database updates (014 and 015).",
            );
            return false;
          }
          st.confirmed = target;
        }
        guardRef.current.set(itemId, { value: st.confirmed, until: Date.now() + 5000 });
        writesRef.current.delete(itemId);
        return true;
      } finally {
        st.writing = false;
      }
    },
    [setItemLocal],
  );

  /**
   * Tick one item off (or back). Instant on screen.
   * Ticking the first item of a brand-new order also starts it ("Preparing").
   */
  const toggleItem = useCallback(
    async (order: Order, itemId: string, done: boolean) => {
      const item = order.order_items?.find((i) => i.id === itemId);
      if (!item) return;
      const stamp = done ? new Date().toISOString() : null;
      const existing = writesRef.current.get(itemId);
      if (existing) existing.desired = stamp;
      else writesRef.current.set(itemId, { desired: stamp, confirmed: item.prepared_at ?? null, writing: false });
      guardRef.current.set(itemId, { value: stamp, until: null });
      setItemLocal(order.id, itemId, stamp);

      const ok = await flushItem(order, itemId);
      if (ok && done && kitchenStatusOf(order) === "new") void setStatus(order, "preparing");
    },
    [flushItem, setItemLocal, setStatus],
  );

  /** Tick every item of an order in one go (for when the whole thing is already made). */
  const markAllItems = useCallback(
    async (order: Order) => {
      const pending = (order.order_items ?? []).filter((i) => !i.prepared_at).map((i) => i.id);
      if (pending.length === 0) return;
      const stamp = new Date().toISOString();
      const ids = new Set(pending);
      pending.forEach((id) => guardRef.current.set(id, { value: stamp, until: null }));
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? { ...o, order_items: (o.order_items ?? []).map((i) => (ids.has(i.id) ? { ...i, prepared_at: stamp } : i)) }
            : o,
        ),
      );
      const { data, error } = await supabase.from("order_items").update({ prepared_at: stamp }).in("id", pending).select("id");
      if (error || !data || data.length < pending.length) {
        pending.forEach((id) => guardRef.current.delete(id));
        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id
              ? { ...o, order_items: (o.order_items ?? []).map((i) => (ids.has(i.id) ? { ...i, prepared_at: null } : i)) }
              : o,
          ),
        );
        toast.error(
          error?.message || "This login is not allowed to tick items. Ask the owner to run the latest database updates (014 and 015).",
        );
        return;
      }
      pending.forEach((id) => guardRef.current.set(id, { value: stamp, until: Date.now() + 5000 }));
      if (kitchenStatusOf(order) === "new") void setStatus(order, "preparing");
    },
    [setOrders, setStatus],
  );

  const counts = {
    new: orders.filter((o) => kitchenStatusOf(o) === "new").length,
    preparing: orders.filter((o) => kitchenStatusOf(o) === "preparing").length,
    ready: orders.filter((o) => kitchenStatusOf(o) === "ready").length,
  };

  return { orders, counts, loading, busyId, setStatus, toggleItem, markAllItems, refresh: () => load(false) };
}
