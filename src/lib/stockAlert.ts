import type { Product } from "./types";

export type StockAlertLevel = "low" | "out";

export type StockAlertItem = {
  id: string;
  name: string;
  category: string;
  /** Portions left today. */
  left: number;
  /** Daily stock limit. */
  limit: number;
  /** The admin's alert number: warn when this many or fewer are left. */
  alertAt: number;
  level: StockAlertLevel;
};

type StockFields = Pick<
  Product,
  "id" | "name" | "category" | "status" | "daily_stock" | "stock_remaining" | "low_stock_alert_at"
>;

/**
 * Is this item at or below the admin's alert number?
 * Returns null when it needs no alert: no daily limit, no alert number set, not sold on the menu,
 * or still comfortably above the number.
 */
export function stockAlertFor(p: StockFields): StockAlertItem | null {
  if (p.status === "deleted" || p.status === "hidden" || p.status === "draft") return null;
  if (p.daily_stock === null || p.daily_stock === undefined) return null;
  const alertAt = p.low_stock_alert_at;
  if (alertAt === null || alertAt === undefined) return null;

  const left = p.stock_remaining ?? p.daily_stock;
  if (left > alertAt) return null;
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    left: Math.max(0, left),
    limit: p.daily_stock,
    alertAt,
    level: left <= 0 ? "out" : "low",
  };
}

/** Out of stock first, then the fewest left. */
export function sortStockAlerts(items: StockAlertItem[]): StockAlertItem[] {
  return [...items].sort((a, b) => {
    if (a.level !== b.level) return a.level === "out" ? -1 : 1;
    return a.left - b.left;
  });
}
