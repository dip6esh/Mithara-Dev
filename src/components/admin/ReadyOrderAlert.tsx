import { useEffect, useRef } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { playReadyOrderSound } from "../../lib/orderSound";
import { readyLabel } from "../../lib/kitchen";

type ReadyRow = { id: string; order_number: string; customer_name: string | null; delivery_type: "delivery" | "pickup" };

/** Orders already known to be ready. null until the first check, so opening the page is never noisy. */
let seen: Set<string> | null = null;

/**
 * Invisible watcher mounted once in the admin shell. When the kitchen marks an order ready it plays the
 * "order ready" bell and shows a toast, on every admin page except the Kitchen board itself (the kitchen
 * already knows: they just tapped it). Updates through Supabase Realtime, with a 30 s poll as a fallback.
 * Before migration 012 the column does not exist: the query errors and there are simply no alerts.
 */
export function ReadyOrderWatcher() {
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const onKitchenRef = useRef(false);
  onKitchenRef.current = path.startsWith("/admin/kitchen");
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    let alive = true;

    const check = async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, customer_name, delivery_type")
        .eq("status", "new")
        .eq("kitchen_status", "ready")
        .limit(100);
      if (!alive || error || !data) return;

      const rows = data as ReadyRow[];
      const next = new Set(rows.map((r) => r.id));
      if (seen && !onKitchenRef.current) {
        const fresh = rows.filter((r) => !seen!.has(r.id));
        if (fresh.length > 0) announce(fresh);
      }
      seen = next;
    };

    const announce = (fresh: ReadyRow[]) => {
      playReadyOrderSound();
      const view = {
        label: "View",
        onClick: () => routerRef.current.navigate({ to: "/admin/orders", search: { tab: "ready" } as never }),
      };
      if (fresh.length <= 3) {
        fresh.forEach((r) =>
          toast.success(`#${r.order_number}: ${readyLabel(r)}`, {
            description: r.customer_name ? `${r.customer_name}, finished by the kitchen.` : "Finished by the kitchen.",
            duration: 12000,
            action: view,
          }),
        );
      } else {
        toast.success(`${fresh.length} orders are ready`, {
          description: "Finished by the kitchen.",
          duration: 12000,
          action: view,
        });
      }
    };

    void check();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void check(), 600);
    };
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`admin-ready-orders-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, soon)
        .subscribe();
    } catch {
      /* polling below still keeps it current */
    }
    const poll = setInterval(() => void check(), 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
