import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

/**
 * Keeps an admin screen fresh: refetches when an order changes (Supabase Realtime, enabled by
 * migration 005) and every 45 s as a fallback in case realtime is unavailable.
 */
export function useOrdersRealtime(refetch: () => void) {
  const latest = useRef(refetch);
  latest.current = refetch;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => latest.current(), 400);
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel("admin-orders")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, schedule)
        .subscribe();
    } catch {
      /* polling below still keeps the screen up to date */
    }
    const poll = setInterval(() => latest.current(), 45_000);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);
}

/**
 * Same idea for the menu: refetches when any menu item changes (an order using up stock, an edit in
 * another tab or on another device). Without this, a page only showed stock as of the moment it
 * opened. Realtime for `products` is enabled by migration 009; the 30 s poll and the refetch when
 * the tab becomes visible again cover the case where realtime is unavailable or the connection slept.
 */
export function useProductsRealtime(refetch: () => void) {
  const latest = useRef(refetch);
  latest.current = refetch;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => latest.current(), 400);
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`admin-products-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "products" }, schedule)
        .subscribe();
    } catch {
      /* polling below still keeps the screen up to date */
    }
    const poll = setInterval(() => latest.current(), 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") latest.current();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);
}
