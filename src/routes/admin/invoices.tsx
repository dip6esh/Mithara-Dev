import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, ExternalLink, FileText, RefreshCw, Search, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { cacheGet, cacheSet, hasCache, useCachedState } from "../../lib/adminCache";
import {
  DOC_TITLE,
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

function AdminInvoicesPage() {
  const [rows, setRows] = useCachedState<InvoiceSummary[]>("admin:invoices:list", []);
  const [loading, setLoading] = useState(() => !hasCache("admin:invoices:list"));
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "tax_invoice" | "bill_of_supply">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "issued" | "void">("all");
  const [showTest, setShowTest] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fixing, setFixing] = useState(false);

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
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showTest && r.is_test) return false;
      if (typeFilter !== "all" && r.doc_type !== typeFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      // Date filter compares IST calendar days.
      const day = new Date(r.issued_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (q && !`${r.invoice_number} ${r.order_number} ${r.customer_name}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, typeFilter, statusFilter, showTest, from, to]);

  // Totals only count live, real invoices in the current filter.
  const totals = useMemo(() => {
    const live = filtered.filter((r) => r.status === "issued" && !r.is_test);
    return {
      count: live.length,
      value: live.reduce((s, r) => s + Number(r.total_inr), 0),
      tax: live.reduce((s, r) => s + Number(r.tax_inr), 0),
    };
  }, [filtered]);

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Invoice no", "Date", "Order no", "Customer", "Document", "Status", "Test", "Total (INR)", "Tax (INR)"];
    const lines = filtered.map((r) =>
      [
        r.invoice_number,
        new Date(r.issued_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
        r.order_number,
        r.customer_name,
        DOC_TITLE[r.doc_type],
        r.status,
        r.is_test ? "yes" : "no",
        r.total_inr,
        r.tax_inr,
      ]
        .map(esc)
        .join(","),
    );
    const blob = new Blob([[header.map(esc).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mithara_invoices_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCatchUp = async () => {
    setFixing(true);
    try {
      const n = await issueMissingInvoices();
      toast.success(n > 0 ? `${n} missing invoice${n === 1 ? "" : "s"} issued` : "Nothing missing. All paid orders have invoices.");
      if (n > 0) load();
    } catch (e: any) {
      toast.error(e?.message || "Could not check for missing invoices");
    } finally {
      setFixing(false);
    }
  };

  const select =
    "rounded-xl border border-neutral-800 bg-neutral-950/80 px-3 py-2 text-xs text-neutral-300 focus:outline-none";

  return (
    <>
      <div className="adm-stagger space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-serif text-2xl font-bold tracking-tight text-neutral-100 sm:text-3xl">Invoices</h1>
            <p className="mt-1 text-xs text-neutral-400">
              Issued automatically when a payment is received, online or at handover
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCatchUp}
              disabled={fixing}
              title="Issue invoices for any paid order that does not have one"
              className="flex items-center gap-1.5 rounded-xl border border-neutral-800 bg-neutral-900/80 px-3.5 py-2 text-xs font-medium text-neutral-300 transition-colors hover:border-amber-500/30 hover:text-amber-300 disabled:opacity-60"
            >
              <Wrench className={`h-3.5 w-3.5 ${fixing ? "animate-pulse" : ""}`} />
              <span>Check for missing</span>
            </button>
            <button
              onClick={() => load()}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-neutral-800 bg-neutral-900/80 px-3.5 py-2 text-xs font-medium text-neutral-300 transition-colors hover:border-amber-500/30 hover:text-amber-300"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-gold-foreground shadow-sm transition-colors hover:bg-amber-400 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Invoices (live)", value: String(totals.count) },
            { label: "Invoiced value", value: money(totals.value) },
            { label: "Tax charged", value: money(totals.tax) },
          ].map((c) => (
            <div key={c.label} className="adm-panel rounded-2xl border border-neutral-800/80 bg-neutral-900/60 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{c.label}</p>
              <p className="mt-1 font-serif text-2xl font-bold text-neutral-100">{c.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute top-2.5 left-3 h-4 w-4 text-neutral-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice no, order no or customer…"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950/80 py-2 pr-4 pl-9 text-xs text-neutral-200 placeholder-neutral-600 focus:border-amber-500/50 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className={select}>
              <option value="all">All documents</option>
              <option value="tax_invoice">Tax invoices</option>
              <option value="bill_of_supply">Bills of supply</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className={select}>
              <option value="all">Any status</option>
              <option value="issued">Issued</option>
              <option value="void">Void</option>
            </select>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className={select} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" className={select} />
            <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-400">
              <input type="checkbox" checked={showTest} onChange={(e) => setShowTest(e.target.checked)} className="accent-amber-500" />
              Show test invoices
            </label>
          </div>
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
                      {rows.length === 0 ? "No invoices yet. They appear as soon as an order is paid." : "No invoices match these filters."}
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
                            <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-300">Void</span>
                          )}
                          {r.is_test && (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">Test</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-300">{fmt(r.issued_at)}</td>
                      <td className="px-4 py-3 font-mono text-neutral-300">{r.order_number}</td>
                      <td className="px-4 py-3 text-neutral-200">{r.customer_name}</td>
                      <td className="px-4 py-3 text-neutral-400">{DOC_TITLE[r.doc_type]}</td>
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
