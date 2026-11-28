import type { OrderItem } from "./types";

/**
 * Items always appear in the order they were added to the order.
 *
 * The database returns rows in no promised order, and a row that was just updated (the kitchen ticking an
 * item off) comes back last, so items used to jump to the bottom. Migration 016 gives each item a fixed
 * position number (seq); sorting by it keeps every screen the same. Without that migration this does nothing
 * and the list stays as the database returned it.
 */
export function sortOrderItems<T extends Pick<OrderItem, "seq">>(items: T[]): T[] {
  if (items.length < 2 || !items.every((i) => typeof i.seq === "number")) return items;
  return [...items].sort((a, b) => (a.seq as number) - (b.seq as number));
}

/** Same, for a list of orders that each carry their items. */
export function withSortedItems<T extends { order_items?: OrderItem[] | null }>(orders: T[]): T[] {
  return orders.map((o) => (o.order_items && o.order_items.length > 1 ? { ...o, order_items: sortOrderItems(o.order_items) } : o));
}
