import { useEffect, useSyncExternalStore } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { playStockAlertSound } from "../../lib/orderSound";
import { refreshDailyStock } from "../../lib/dailyStock";
import { sortStockAlerts, stockAlertFor, type StockAlertItem, type StockAlertLevel } from "../../lib/stockAlert";

/* ------------------------------------------------------------------ */
/*  Shared state, outside React so it survives moving between pages.     */
/* ------------------------------------------------------------------ */
const EMPTY: StockAlertItem[] = [];
let items: StockAlertItem[] = EMPTY;
/** What we saw last time (id -> level). null until the first check, so opening the page is never noisy. */
let previous: Map<string, StockAlertLevel> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const rank = (l: StockAlertLevel | undefined) => (l === "out" ? 2 : l === "low" ? 1 : 0);

function describe(i: StockAlertItem): string {
  return i.level === "out"
    ? `${i.name} is out of stock.`
    : `${i.name} is running low: ${i.left} left (alert set at ${i.alertAt}).`;
}

/** Reads stock and updates the alert list. Sound + toast only when an item newly gets worse while the page is open. */
export async function refreshStockAlerts(): Promise<void> {
  await refreshDailyStock(); // a new day starts with full stock
  const { data, error } = await supabase
    .from("products")
    .select("id, name, category, status, daily_stock, stock_remaining, low_stock_alert_at")
    .not("daily_stock", "is", null)
    .not("low_stock_alert_at", "is", null)
    .neq("status", "deleted");
  // Before migration 009 the column does not exist and this errors: simply no alerts, nothing else breaks.
  if (error || !data) return;

  const next = sortStockAlerts(
    (data as any[]).map((p) => stockAlertFor(p)).filter((x): x is StockAlertItem => x !== null),
  );
  const nextLevels = new Map(next.map((i) => [i.id, i.level] as const));

  if (previous) {
    const worse = next.filter((i) => rank(i.level) > rank(previous!.get(i.id)));
    if (worse.length > 0) {
      playStockAlertSound();
      if (worse.length <= 3) {
        worse.forEach((i) =>
          i.level === "out"
            ? toast.error(describe(i), { duration: 12000 })
            : toast.warning(describe(i), { duration: 12000 }),
        );
      } else {
        toast.warning(`${worse.length} items are running low on stock. See the dashboard.`, { duration: 12000 });
      }
    }
  }
  previous = nextLevels;

  if (JSON.stringify(next) !== JSON.stringify(items)) {
    items = next.length > 0 ? next : EMPTY;
    emit();
  }
}

export function useStockAlerts(): StockAlertItem[] {
  return useSyncExternalStore(subscribe, () => items, () => EMPTY);
}

/**
 * Invisible watcher mounted once in the admin shell. Keeps the alert list current on every admin page and
 * plays the stock sound when an item crosses its alert number. Updates through Supabase Realtime (products
 * and orders), with a 30 s poll as a fallback.
 */
export function LowStockWatcher() {
  useEffect(() => {
    void refreshStockAlerts();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refreshStockAlerts(), 600);
    };
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`admin-low-stock-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "products" }, soon)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, soon)
        .subscribe();
    } catch {
      /* polling below still keeps it current */
    }
    const poll = setInterval(() => void refreshStockAlerts(), 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshStockAlerts();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);
  return null;
}

const CATEGORY_LABEL: Record<string, string> = { kunafa: "Kunafa", baklava: "Baklava", gelato: "Gelato" };

/** Dashboard panel: every item at or below its alert number, out-of-stock first. Shows nothing when all is well. */
export function LowStockPanel() {
  const list = useStockAlerts();
  if (list.length === 0) return null;
  const outCount = list.filter((i) => i.level === "out").length;

  return (
    <section
      role="alert"
      aria-label="Stock alerts"
      className="adm-panel rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-xl font-semibold text-foreground">Low stock</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {list.length === 1 ? "1 item" : `${list.length} items`} at or below the alert level
            {outCount > 0 && <span className="font-medium text-rose-600"> · {outCount} out of stock</span>}
          </p>
        </div>
        <Link
          to="/admin/menu"
          className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-[#d39c54] hover:text-[#a8691d]"
        >
          Manage stock
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </div>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((i) => {
          const out = i.level === "out";
          const pct = i.limit > 0 ? Math.min(100, Math.max(0, (i.left / i.limit) * 100)) : 0;
          return (
            <li key={i.id} className="rounded-2xl border border-border bg-background/60 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{i.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{CATEGORY_LABEL[i.category] ?? i.category}</p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    out ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${out ? "bg-rose-500" : "bg-amber-500"}`} aria-hidden="true" />
                  {out ? "Out of stock" : `${i.left} left`}
                </span>
              </div>

              <div
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={`${i.left} of ${i.limit} left`}
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${out ? "bg-rose-500" : "bg-amber-500"}`}
                  style={{ width: out ? "0%" : `${Math.max(pct, 4)}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground tabular-nums">
                {i.left} of {i.limit} left today · alert at {i.alertAt}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
