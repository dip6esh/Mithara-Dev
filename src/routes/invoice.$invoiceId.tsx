import { useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Printer, FileX } from "lucide-react";
import { useAuth } from "../lib/auth";
import {
  DOC_TITLE,
  amountInWords,
  fetchInvoice,
  money,
  type Invoice,
} from "../lib/invoice";
import logoIcon from "../assets/mithara-icon.png";

export const Route = createFileRoute("/invoice/$invoiceId")({
  head: () => ({
    meta: [{ title: "Invoice — Mithara" }, { name: "robots", content: "noindex" }],
  }),
  component: InvoicePage,
});

const PAID_VIA: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card" };

const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
    : "—";

const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })
    : "—";

function InvoicePage() {
  const { invoiceId } = Route.useParams();
  const router = useRouter();
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.navigate({ to: "/account/login" });
  }, [authLoading, user, router]);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setLoading(true);
    fetchInvoice(invoiceId)
      .then((inv) => alive && (setInvoice(inv), setFailed(false)))
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [userId, invoiceId]);

  const backHref = isAdmin ? "/admin/invoices" : "/account/profile";

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100 text-neutral-600">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (failed || !invoice) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-neutral-100 px-4 text-center text-neutral-700">
        <FileX className="h-10 w-10 text-neutral-400" />
        <h1 className="font-serif text-xl font-semibold">Invoice not found</h1>
        <p className="max-w-sm text-sm">
          It may not exist, or it belongs to a different account. Please sign in with the account that placed the order.
        </p>
        <a href={backHref} className="mt-2 rounded-full bg-[#282345] px-5 py-2 text-sm font-semibold text-white">
          Go back
        </a>
      </div>
    );
  }

  const { data: d } = invoice;
  const isTax = invoice.doc_type === "tax_invoice" && d.tax.applied;
  const halfRate = (d.tax.rate || 0) / 2;
  const paidVia = d.payment.paid_via ? (PAID_VIA[d.payment.paid_via] ?? d.payment.paid_via) : "—";
  const isVoid = invoice.status === "void";

  return (
    <div className="min-h-screen bg-neutral-100 px-3 py-6 text-neutral-900 print:bg-white print:p-0">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print { .inv-sheet { box-shadow: none !important; border: 0 !important; } * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
      `}</style>

      {/* Toolbar (not printed) */}
      <div className="mx-auto mb-4 flex max-w-[800px] items-center justify-between print:hidden">
        <a href={backHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900">
          <ArrowLeft className="h-4 w-4" /> Back
        </a>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-full bg-[#282345] px-5 py-2 text-sm font-semibold text-white shadow hover:bg-[#1c1733]"
        >
          <Printer className="h-4 w-4 text-[#ebb976]" /> Print / Save as PDF
        </button>
      </div>

      <article className="inv-sheet relative mx-auto max-w-[800px] overflow-hidden rounded-xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-10">
        {/* Watermarks */}
        {(isVoid || invoice.is_test) && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span
              className={`-rotate-[28deg] select-none text-center text-5xl font-black uppercase tracking-widest sm:text-6xl ${
                isVoid ? "text-rose-600/15" : "text-amber-600/15"
              }`}
            >
              {isVoid ? "Cancelled" : "Practice invoice"}
            </span>
          </div>
        )}

        {/* Header */}
        <header className="flex flex-col gap-5 border-b-2 border-[#282345] pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#282345]">
              <img src={logoIcon} alt="" className="h-8 w-8 object-contain" />
            </div>
            <div className="text-xs leading-relaxed text-neutral-600">
              <h1 className="font-serif text-xl font-bold text-neutral-900">{d.seller.name}</h1>
              {d.seller.address && <p className="max-w-xs">{d.seller.address}</p>}
              {d.seller.gstin && isTax && <p>GSTIN: <span className="font-semibold text-neutral-800">{d.seller.gstin}</span></p>}
              {d.seller.gstin && !isTax && <p>GSTIN: {d.seller.gstin}</p>}
              {d.seller.fssai && <p>FSSAI Lic. No.: <span className="font-semibold text-neutral-800">{d.seller.fssai}</span></p>}
              {d.seller.phone && <p>{d.seller.phone}</p>}
            </div>
          </div>

          <div className="text-xs sm:text-right">
            <p className="font-serif text-2xl font-bold uppercase tracking-wide text-[#282345]">
              {DOC_TITLE[invoice.doc_type]}
            </p>
            <dl className="mt-2 space-y-0.5 text-neutral-600">
              <div className="flex gap-2 sm:justify-end">
                <dt>Invoice no.</dt>
                <dd className="font-mono font-bold text-neutral-900">{invoice.invoice_number}</dd>
              </div>
              <div className="flex gap-2 sm:justify-end">
                <dt>Date</dt>
                <dd className="font-medium text-neutral-900">{fmtDate(invoice.issued_at)}</dd>
              </div>
              <div className="flex gap-2 sm:justify-end">
                <dt>Order no.</dt>
                <dd className="font-mono font-medium text-neutral-900">{invoice.order_number}</dd>
              </div>
            </dl>
            {isVoid && (
              <p className="mt-2 inline-block rounded bg-rose-100 px-2 py-0.5 font-bold uppercase text-rose-700">
                Cancelled{invoice.void_reason ? ` — ${invoice.void_reason}` : ""}
              </p>
            )}
            {invoice.is_test && !isVoid && (
              <p className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 font-bold uppercase text-amber-800">
                Practice payment — not a valid tax document
              </p>
            )}
          </div>
        </header>

        {/* Parties */}
        <section className="grid gap-5 border-b border-neutral-200 py-5 text-xs sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Billed to</p>
            <p className="mt-1 text-sm font-semibold text-neutral-900">{d.buyer.name}</p>
            <p className="text-neutral-600">{d.buyer.phone}</p>
            {d.buyer.email && <p className="text-neutral-600">{d.buyer.email}</p>}
            {d.buyer.address && <p className="mt-1 max-w-xs text-neutral-600">{d.buyer.address}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Supply details</p>
            <p className="mt-1 capitalize text-neutral-700">{d.buyer.delivery_type}</p>
            {isTax && d.seller.state && (
              <p className="text-neutral-700">
                Place of supply: {d.seller.state}
                {d.seller.state_code ? ` (${d.seller.state_code})` : ""}
              </p>
            )}
          </div>
        </section>

        {/* Items */}
        <section className="py-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead>
                <tr className="bg-neutral-100 text-[10px] uppercase tracking-wider text-neutral-600">
                  <th className="px-3 py-2 font-semibold">#</th>
                  <th className="px-3 py-2 font-semibold">Description</th>
                  {isTax && <th className="px-3 py-2 font-semibold">HSN</th>}
                  <th className="px-3 py-2 text-right font-semibold">Qty</th>
                  <th className="px-3 py-2 text-right font-semibold">Rate</th>
                  <th className="px-3 py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {d.items.map((it, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2.5 text-neutral-500">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-neutral-900">{it.name}</span>
                      {it.variant && <span className="block text-neutral-500">{it.variant}</span>}
                    </td>
                    {isTax && <td className="px-3 py-2.5 text-neutral-600">{d.seller.hsn || "—"}</td>}
                    <td className="px-3 py-2.5 text-right">{it.qty}</td>
                    <td className="px-3 py-2.5 text-right">{money(it.unit_price)}</td>
                    <td className="px-3 py-2.5 text-right font-medium">{money(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="mt-4 flex justify-end">
            <dl className="w-full max-w-xs space-y-1.5 text-xs">
              <div className="flex justify-between text-neutral-600">
                <dt>Items subtotal{isTax && d.tax.inclusive ? " (incl. tax)" : ""}</dt>
                <dd>{money(d.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-neutral-600">
                <dt>Delivery</dt>
                <dd>{d.delivery_fee ? money(d.delivery_fee) : "Free"}</dd>
              </div>
              {isTax && !d.tax.inclusive && (
                <>
                  <div className="flex justify-between text-neutral-600">
                    <dt>CGST @ {halfRate}%</dt>
                    <dd>{money(d.tax.cgst)}</dd>
                  </div>
                  <div className="flex justify-between text-neutral-600">
                    <dt>SGST @ {halfRate}%</dt>
                    <dd>{money(d.tax.sgst)}</dd>
                  </div>
                </>
              )}
              <div className="flex items-baseline justify-between border-t-2 border-[#282345] pt-2 text-sm font-bold text-neutral-900">
                <dt>Total</dt>
                <dd className="font-serif text-xl">{money(d.total)}</dd>
              </div>
            </dl>
          </div>

          <p className="mt-3 text-right text-[11px] italic text-neutral-600">{amountInWords(d.total)}</p>
        </section>

        {/* GST summary (tax invoices only) */}
        {isTax && (
          <section className="border-t border-neutral-200 py-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              {d.tax.label} summary{d.tax.inclusive ? " (included in the prices above)" : ""}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-xs">
                <thead>
                  <tr className="bg-neutral-100 text-[10px] uppercase tracking-wider text-neutral-600">
                    <th className="px-3 py-1.5 text-left font-semibold">HSN</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Taxable value</th>
                    <th className="px-3 py-1.5 text-right font-semibold">CGST {halfRate}%</th>
                    <th className="px-3 py-1.5 text-right font-semibold">SGST {halfRate}%</th>
                    <th className="px-3 py-1.5 text-right font-semibold">Total tax</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2">{d.seller.hsn || "—"}</td>
                    <td className="px-3 py-2 text-right">{money(d.tax.taxable_value)}</td>
                    <td className="px-3 py-2 text-right">{money(d.tax.cgst)}</td>
                    <td className="px-3 py-2 text-right">{money(d.tax.sgst)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{money(d.tax.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Payment */}
        <section className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 py-4 text-xs">
          <div className="text-neutral-600">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Payment received</p>
            <p className="mt-1 text-neutral-800">
              {money(d.total)} via <span className="font-semibold">{paidVia}</span> on {fmtDateTime(d.payment.paid_at)}
            </p>
          </div>
          <span className="rounded border-2 border-emerald-600 px-3 py-1 text-sm font-black uppercase tracking-widest text-emerald-700">
            Paid
          </span>
        </section>

        {/* Footer */}
        <footer className="border-t border-neutral-200 pt-4 text-center text-[11px] leading-relaxed text-neutral-500">
          {!isTax && (
            <p className="mb-1">Bill of Supply: no tax has been charged on this bill.</p>
          )}
          {d.seller.footer && <p>{d.seller.footer}</p>}
        </footer>
      </article>
    </div>
  );
}
