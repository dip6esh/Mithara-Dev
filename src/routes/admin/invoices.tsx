import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Banknote, ChevronDown, CreditCard, Download, ExternalLink, FileText, RefreshCw, Search } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { cacheGet, cacheSet, hasCache, useCachedState } from "../../lib/adminCache";
import {
  DOC_LABEL,
  STATUS_LABEL,
  invoiceHref,
  issueMissingInvoices,
  money,
  type InvoiceSummary,
} from "../../lib/invoice";

export const Route = createFileRoute("/admin/invoices")({
  head: () => ({ meta: [{ title: "Mithara Admin — Invoices" }] }),
  component: AdminInvoicesPage,
});

const COLS =
  "id, invoice_number, order_id, order_number, customer_id, customer_name, doc_type, is_test, status, total_inr, tax_inr, issued_at, voided_at, void_reason";

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** Today's date as YYYY-MM-DD in Indian time. */
const istDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/**
 * Which tab an invoice belongs to.
 * Today every online payment is a simulated (demo) one, flagged `is_test`, and cash is always real.
 * When a real payment gateway goes live, online invoices will no longer be `is_test`:
 * change this one line to classify by payment method instead (invoice.data.payment.method !== "cash").
 */
const isOnline = (r: Pick<InvoiceSummary, "is_test">) => r.is_test;

type Range = "all" | "today" | "week" | "month" | "custom";

/** Start/end (YYYY-MM-DD, IST) for the quick date chips. The week starts on Monday. */
function rangeDates(range: Exclude<Range, "custom">): { from: string; to: string } {
  const today = istDay(new Date());
  if (range === "all") return { from: "", to: "" };
  if (range === "today") return { from: today, to: today };
  if (range === "month") return { from: `${today.slice(0, 8)}01`, to: today };
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const sinceMonday = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - sinceMonday);
  return { from: dt.toISOString().slice(0, 10), to: today };
}

const RANGE_CHIPS: { id: Exclude<Range, "custom">; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
];

function AdminInvoicesPage() {
  const [rows, setRows] = useCachedState<InvoiceSummary[]>("admin:invoices:list", []);
  const [loading, setLoading] = useState(() => !hasCache("admin:invoices:list"));
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "tax_invoice" | "bill_of_supply">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "issued" | "void">("all");
  // "Cash" = collected at handover. "Online" = paid through the website at checkout.
  const [tab, setTab] = useState<"cash" | "online">("cash");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [range, setRange] = useState<Range>("all");
  const [showMore, setShowMore] = useState(false);

  const pickRange = (r: Exclude<Range, "custom">) => {
    const d = rangeDates(r);
    setRange(r);
    setFrom(d.from);
    setTo(d.to);
  };

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("invoices")
        .select(COLS)
        .order("issued_at", { ascending: false })
        .limit(1000);
      if (err) throw err;
      setRows((data ?? []) as InvoiceSummary[]);
    } catch (e: any) {
      console.error(e);
      setError(
        /relation .*invoices|schema cache|does not exist/i.test(e?.message ?? "")
          ? "The invoices table is missing. Run supabase/migrations/008_invoices.sql first."
          : (e?.message ?? "Could not load invoices"),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(hasCache("admin:invoices:list"));
    // Safety net, run quietly: if any paid order is somehow missing its invoice, create it now.
    // Staff never need to think about this.
    issueMissingInvoices()
      .then((n) => {
        if (n > 0) load(true);
      })
      .catch((e) => console.warn("Invoice catch-up skipped", e));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === "online" ? !isOnline(r) : isOnline(r)) return false;
      if (typeFilter !== "all" && r.doc_type !== typeFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      // Date filter compares IST calendar days.
      const day = new Date(r.issued_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (q && !`${r.invoice_number} ${r.order_number} ${r.customer_name}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, typeFilter, statusFilter, tab, from, to]);

  const tabCounts = useMemo(
    () => ({
      cash: rows.filter((r) => !isOnline(r)).length,
      online: rows.filter((r) => isOnline(r)).length,
    }),
    [rows],
  );

  // Totals only count active (not cancelled) invoices in the current tab and filters.
  const totals = useMemo(() => {
    const live = filtered.filter((r) => r.status === "issued");
    return {
      count: live.length,
      value: live.reduce((s, r) => s + Number(r.total_inr), 0),
      tax: live.reduce((s, r) => s + Number(r.tax_inr), 0),
    };
  }, [filtered]);

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Invoice no", "Date", "Order no", "Customer", "Document", "Status", "Payment", "Total (INR)", "Tax (INR)"];
    const lines = filtered.map((r) =>
      [
        r.invoice_number,
        new Date(r.issued_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
        r.order_number,
        r.customer_name,
        DOC_LABEL[r.doc_type],
        STATUS_LABEL[r.status],
        isOnline(r) ? "Online" : "Cash",
        r.total_inr,
        r.tax_inr,
      ]
        .map(esc)
        .join(","),
    );
    const blob = new Blob(["\uFEFF" + [header.map(esc).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mithara_invoices_${tab}_${istDay(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const moreActive = (typeFilter !== "all" ? 1 : 0) + (statusFilter !== "all" ? 1 : 0) + (range === "custom" ? 1 : 0);

  const select =
    "rounded-xl border border-neutral-800 bg-neutral-950/80 px-3 py-2 text-xs text-neutral-300 focus:outline-none";

  return (
    <>
      <div className="adm-stagger space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-serif text-2xl font-bold tracking-tight text-neutral-100 sm:text-3xl">Invoices</h1>
            <p className="mt-1 text-xs text-neutral-400">
              Created automatically the moment a payment is received, online or at handover. Nothing to do here.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={exportCsv}
              disabled={filtered.length === 0}
              title="A spreadsheet (opens in Excel) of the invoices listed below"
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-gold-foreground shadow-md shadow-amber-500/20 transition-colors hover:bg-amber-400 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              <span>Download for my accountant</span>
            </button>
            <button
              onClick={() => load()}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-neutral-800 bg-neutral-900/80 px-3.5 py-2 text-xs font-medium text-neutral-300 transition-colors hover:border-amber-500/30 hover:text-amber-300"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Cash / Online tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {([
            { id: "cash", label: "Cash", count: tabCounts.cash, Icon: Banknote },
            { id: "online", label: "Online", count: tabCounts.online, Icon: CreditCard },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
                tab === t.id
                  ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                  : "border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <t.Icon className="h-3.5 w-3.5" />
              {t.label}
              <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-300">{t.count}</span>
            </button>
          ))}
        </div>

        {tab === "online" && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
            <span className="font-semibold">Demo payments.</span> Online payments are simulated in this preview, so no
            real money is taken and these are not valid tax documents.
          </div>
        )}

        {/* Summary */}
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: tab === "online" ? "Online invoices" : "Cash invoices", value: String(totals.count) },
            { label: "Invoiced value", value: money(totals.value) },
            { label: "Tax charged", value: money(totals.tax) },
          ].map((c) => (
            <div key={c.label} className="adm-panel rounded-2xl border border-neutral-800/80 bg-neutral-900/60 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{c.label}</p>
              <p className="mt-1 font-serif text-2xl font-bold text-neutral-100">{c.value}</p>
            </div>
          ))}
        </div>

        {/* Filters: search + quick dates always visible; the rest is tucked under "More filters" */}
        <div className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute top-2.5 left-3 h-4 w-4 text-neutral-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by invoice no, order no or customer name…"
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950/80 py-2 pr-4 pl-9 text-xs text-neutral-200 placeholder-neutral-600 focus:border-amber-500/50 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {RANGE_CHIPS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => pickRange(c.id)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    range === c.id
                      ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                      : "border-neutral-800 bg-neutral-950/60 text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
            className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-200"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMore ? "rotate-180" : ""}`} />
            More filters
            {moreActive > 0 && (
              <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                {moreActive}
              </span>
            )}
          </button>

          {showMore && (
            <div className="flex flex-wrap items-center gap-2 border-t border-neutral-800 pt-3">
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className={select}>
                <option value="all">All bill types</option>
                <option value="tax_invoice">Tax bills</option>
                <option value="bill_of_supply">Bills (no tax)</option>
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className={select}>
                <option value="all">Active and cancelled</option>
                <option value="issued">Active only</option>
                <option value="void">Cancelled only</option>
              </select>
              <label className="flex items-center gap-2 text-xs text-neutral-400">
                From
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setRange("custom");
                  }}
                  className={select}
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-neutral-400">
                To
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setRange("custom");
                  }}
                  className={select}
                />
              </label>
              {moreActive > 0 && (
                <button
                  onClick={() => {
                    setTypeFilter("all");
                    setStatusFilter("all");
                    pickRange("all");
                  }}
                  className="text-xs font-medium text-amber-300 hover:text-amber-200"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="adm-panel overflow-hidden rounded-2xl border border-neutral-800/80 bg-neutral-900/50 backdrop-blur">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-800 bg-neutral-900/80 text-[11px] uppercase tracking-wider text-neutral-400">
                <tr>
                  <th className="px-4 py-3.5 font-semibold">Invoice</th>
                  <th className="px-4 py-3.5 font-semibold">Date</th>
                  <th className="px-4 py-3.5 font-semibold">Order</th>
                  <th className="px-4 py-3.5 font-semibold">Customer</th>
                  <th className="px-4 py-3.5 font-semibold">Document</th>
                  <th className="px-4 py-3.5 text-right font-semibold">Tax</th>
                  <th className="px-4 py-3.5 text-right font-semibold">Total</th>
                  <th className="px-4 py-3.5 text-right font-semibold"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {loading ? (
                  <tr><td colSpan={8} className="py-12 text-center text-neutral-500">Loading invoices…</td></tr>
                ) : error ? (
                  <tr><td colSpan={8} className="py-12 text-center text-rose-300">{error}</td></tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-neutral-500">
                      {tabCounts[tab] === 0
                        ? tab === "online"
                          ? "No online invoices yet. One is created when a customer pays online at checkout."
                          : "No cash invoices yet. One is created when you mark cash or UPI received at handover."
                        : "No invoices match these filters."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-neutral-800/30">
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`font-mono font-bold ${r.status === "void" ? "text-neutral-500 line-through" : "text-neutral-100"}`}>
                            {r.invoice_number}
                          </span>
                          {r.status === "void" && (
                            <span
                              title={r.void_reason ?? undefined}
                              className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-300"
                            >
                              Cancelled
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-300">{fmt(r.issued_at)}</td>
                      <td className="px-4 py-3 font-mono text-neutral-300">{r.order_number}</td>
                      <td className="px-4 py-3 text-neutral-200">{r.customer_name}</td>
                      <td className="px-4 py-3 text-neutral-400">{DOC_LABEL[r.doc_type]}</td>
                      <td className="px-4 py-3 text-right text-neutral-300">{Number(r.tax_inr) > 0 ? money(r.tax_inr) : "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-neutral-100">{money(r.total_inr)}</td>
                      <td className="px-4 py-3 text-right">
                        <a
                          href={invoiceHref(r.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-neutral-800 px-2.5 py-1.5 font-medium text-neutral-300 hover:border-amber-500/40 hover:text-amber-300"
                        >
                          <FileText className="h-3.5 w-3.5" /> View <ExternalLink className="h-3 w-3 opacity-60" />
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
