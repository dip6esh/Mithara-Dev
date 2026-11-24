import { useEffect, useSyncExternalStore } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, PackageX } from "lucide-react";
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
      className="rounded-3xl border border-amber-300/70 bg-amber-50 p-4 text-amber-950 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-500/30">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-serif text-lg font-semibold leading-tight">
              {list.length === 1 ? "1 item is running low" : `${list.length} items are running low`}
            </h2>
            <p className="text-xs text-amber-900/70">
              {outCount > 0 ? `${outCount} out of stock. ` : ""}Restock or update the daily stock in Menu Control.
            </p>
          </div>
        </div>
        <Link
          to="/admin/menu"
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-950 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-900"
        >
          Manage stock
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((i) => (
          <li
            key={i.id}
            className={`flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 ${
              i.level === "out" ? "border-rose-300 bg-rose-50" : "border-amber-200 bg-white"
            }`}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-neutral-900">{i.name}</p>
              <p className="text-[11px] text-neutral-500">
                {CATEGORY_LABEL[i.category] ?? i.category} · alert at {i.alertAt} · limit {i.limit}
              </p>
            </div>
            {i.level === "out" ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                <PackageX className="h-3 w-3" aria-hidden="true" />
                Out
              </span>
            ) : (
              <span className="shrink-0 text-right">
                <span className="block font-serif text-2xl font-semibold leading-none tabular-nums text-amber-700">
                  {i.left}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">left</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
