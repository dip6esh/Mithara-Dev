import { supabase } from "./supabase";
import { DELIVERIES_CACHE_KEY, STAFF_LIST_CACHE_KEY, cacheSet, hasCache } from "./adminCache";
import { withSortedItems } from "./orderItems";
import { canAccess, type AppRole } from "./roles";
import type { Order } from "./types";
import type { StaffMember } from "./staffApi";

let running = "";

/**
 * Warms the pages a person is allowed to open, right after sign-in, so the first visit to Deliveries or
 * Staff shows its data immediately (like Orders and the Kitchen board already do) instead of a "Loading…"
 * moment. Quiet and best-effort: if anything fails the page simply loads its own data as before.
 */
export async function prefetchForRoles(roles: AppRole[]) {
  const sig = roles.join(",");
  if (!sig || running === sig) return;
  running = sig;

  const jobs: Array<PromiseLike<unknown>> = [];

  if (canAccess(roles, "deliveries") && !hasCache(DELIVERIES_CACHE_KEY)) {
    jobs.push(
      supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("delivery_type", "delivery")
        .in("status", ["new", "completed"])
        .order("created_at", { ascending: true })
        .limit(200)
        .then(({ data, error }) => {
          if (!error && data) cacheSet(DELIVERIES_CACHE_KEY, withSortedItems(data as Order[]));
        }),
    );
  }

  if (canAccess(roles, "staff") && !hasCache(STAFF_LIST_CACHE_KEY)) {
    jobs.push(
      supabase
        .from("staff_members")
        .select("*")
        .order("created_at", { ascending: true })
        .then(({ data, error }) => {
          if (!error && data) cacheSet(STAFF_LIST_CACHE_KEY, data as StaffMember[]);
        }),
    );
  }

  await Promise.allSettled(jobs);
}
