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
