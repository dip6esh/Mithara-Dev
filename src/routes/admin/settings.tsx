import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "../../lib/supabase";
import {
  Sliders,
  Store,
  Clock,
  Truck,
  MessageSquare,
  AlertCircle,
  Save,
  RefreshCw,
  Bell,
  Wallet,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { unwrapSetting } from "../../lib/settings";
import { formatINR } from "../../lib/enquiry";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [{ title: "Mithara Admin — Settings" }],
  }),
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Settings State
  const [holidayMode, setHolidayMode] = useState(false);
  const [holidayMessage, setHolidayMessage] = useState(
    "Mithara is currently closed for the day or private events. We look forward to baking for you soon!"
  );
  const [cutoffTime, setCutoffTime] = useState("20:30");
  const [reopenTime, setReopenTime] = useState("");
  const [deliveryFeeFlat, setDeliveryFeeFlat] = useState("100");
  const [freeDeliveryAbove, setFreeDeliveryAbove] = useState("1500");
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState("5");
  const [taxLabel, setTaxLabel] = useState("GST");
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [paymentMode, setPaymentMode] = useState<"demo" | "live">("demo");
  // Invoice details (printed on every invoice). Demo values until the real ones are entered.
  const [invBusinessName, setInvBusinessName] = useState("Mithara Dessert House");
  const [invAddress, setInvAddress] = useState("Shop 12, Demo Complex, Andheri West, Mumbai, Maharashtra 400053");
  const [invState, setInvState] = useState("Maharashtra");
  const [invStateCode, setInvStateCode] = useState("27");
  const [invGstin, setInvGstin] = useState("27ABCDE1234F1Z5");
  const [invFssai, setInvFssai] = useState("11521999000123");
  const [invHsn, setInvHsn] = useState("1905");
  const [invFooter, setInvFooter] = useState(
    "Thank you for choosing Mithara. This is a computer-generated invoice and does not require a signature.",
  );
  const [whatsappNumber, setWhatsappNumber] = useState("919619617888");
  const [whatsappDisplay, setWhatsappDisplay] = useState("+91 96196 17888");
  const [bannerEnabled, setBannerEnabled] = useState(false);
  const [bannerText, setBannerText] = useState(
    "Fresh hot batches baked daily — order ahead for guaranteed evening dispatch!"
  );

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from("site_settings").select("*");
      if (error) throw error;

      if (data) {
        data.forEach((row) => {
          // Older saves were double-encoded strings; unwrapSetting reads both shapes.
          const val = unwrapSetting(row.value);
          if (row.key === "holiday_mode") setHolidayMode(val === true);
          if (row.key === "holiday_message") setHolidayMessage(String(val));
          if (row.key === "order_cutoff_time") setCutoffTime(String(val));
          if (row.key === "order_reopen_time") setReopenTime(String(val ?? ""));
          if (row.key === "delivery_fee_flat") setDeliveryFeeFlat(String(val));
          if (row.key === "free_delivery_above") setFreeDeliveryAbove(String(val));
          if (row.key === "tax_enabled") setTaxEnabled(val === true);
          if (row.key === "tax_rate_percent") setTaxRate(String(val));
          if (row.key === "tax_label") setTaxLabel(String(val));
          if (row.key === "tax_inclusive") setTaxInclusive(val === true);
          if (row.key === "payment_mode") setPaymentMode(val === "live" ? "live" : "demo");
          if (row.key === "invoice_business_name") setInvBusinessName(String(val ?? ""));
          if (row.key === "invoice_address") setInvAddress(String(val ?? ""));
          if (row.key === "invoice_state") setInvState(String(val ?? ""));
          if (row.key === "invoice_state_code") setInvStateCode(String(val ?? ""));
          if (row.key === "invoice_gstin") setInvGstin(String(val ?? ""));
          if (row.key === "invoice_fssai") setInvFssai(String(val ?? ""));
          if (row.key === "invoice_hsn") setInvHsn(String(val ?? ""));
          if (row.key === "invoice_footer") setInvFooter(String(val ?? ""));
          if (row.key === "whatsapp_number") setWhatsappNumber(String(val));
          if (row.key === "whatsapp_display") setWhatsappDisplay(String(val));
          if (row.key === "banner_enabled") setBannerEnabled(val === true);
          if (row.key === "banner_text") setBannerText(String(val));
        });
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load settings");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const rate = Number(taxRate);
    if (taxEnabled && (!Number.isFinite(rate) || rate <= 0 || rate > 100)) {
      toast.error("Enter a tax rate between 0 and 100%, or switch tax off.");
      return;
    }
    const gstin = invGstin.trim().toUpperCase();
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
      toast.error("GSTIN should be 15 characters, like 27ABCDE1234F1Z5.");
      return;
    }
    if (taxEnabled && !gstin) {
      toast.error("Enter your GSTIN under Invoice details before charging GST.");
      return;
    }
    const fee = Number(deliveryFeeFlat);
    const freeAbove = Number(freeDeliveryAbove);
    if ((deliveryFeeFlat !== "" && fee < 0) || (freeDeliveryAbove !== "" && freeAbove < 0)) {
      toast.error("Delivery amounts cannot be negative.");
      return;
    }

    setIsSaving(true);
    try {
      // Values are stored as native JSON (numbers as numbers, booleans as booleans).
      // supabase-js serialises them for us; do NOT JSON.stringify here or they get double-encoded.
      const now = new Date().toISOString();
      const payload = [
        { key: "holiday_mode", value: holidayMode },
        { key: "holiday_message", value: holidayMessage },
        { key: "order_cutoff_time", value: cutoffTime },
        { key: "order_reopen_time", value: reopenTime },
        { key: "delivery_fee_flat", value: fee || 0 },
        { key: "free_delivery_above", value: freeAbove || 0 },
        { key: "tax_enabled", value: taxEnabled },
        { key: "tax_rate_percent", value: Number.isFinite(rate) ? rate : 0 },
        { key: "tax_label", value: taxLabel.trim() || "GST" },
        { key: "tax_inclusive", value: taxInclusive },
        { key: "payment_mode", value: paymentMode },
        { key: "invoice_business_name", value: invBusinessName.trim() },
        { key: "invoice_address", value: invAddress.trim() },
        { key: "invoice_state", value: invState.trim() },
        { key: "invoice_state_code", value: invStateCode.trim() },
        { key: "invoice_gstin", value: gstin },
        { key: "invoice_fssai", value: invFssai.trim() },
        { key: "invoice_hsn", value: invHsn.trim() },
        { key: "invoice_footer", value: invFooter.trim() },
        { key: "whatsapp_number", value: whatsappNumber.replace(/[^0-9]/g, "") },
        { key: "whatsapp_display", value: whatsappDisplay },
        { key: "banner_enabled", value: bannerEnabled },
        { key: "banner_text", value: bannerText },
      ].map((item) => ({ ...item, updated_at: now }));

      const { error } = await supabase.from("site_settings").upsert(payload, { onConflict: "key" });
      if (error) throw error;

      window.dispatchEvent(new Event("mithara:settings-saved"));
      toast.success("Settings saved and live on the storefront.");
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="max-w-4xl space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-serif text-2xl font-bold tracking-tight text-neutral-100 sm:text-3xl">
              Storefront & Fulfillment Settings
            </h1>
            <p className="mt-1 text-xs text-neutral-400">
              Configure business hours, holiday closures, delivery fees, tax, and customer notifications
            </p>
          </div>

          <button
            onClick={fetchSettings}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-xl border border-neutral-800 bg-neutral-900/80 px-3.5 py-2 text-xs font-medium text-neutral-300 hover:border-amber-500/30 hover:text-amber-300 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Reload Settings</span>
          </button>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* Shop Open / Close Switch (Holiday Mode) */}
          <div className="adm-panel rounded-2xl border border-neutral-800/80 bg-neutral-900/60 p-6 backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-400"
                >
                  <Store className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-serif text-lg font-bold text-neutral-100">
                    Store Availability Switch
                  </h2>
                  <p className="text-xs text-neutral-400">
                    Temporarily close orders when sold out for the day, on holiday, or catering private events
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setHolidayMode(!holidayMode)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  holidayMode ? "bg-rose-600" : "bg-emerald-600"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    holidayMode ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-neutral-800/60">
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${
                  holidayMode
                    ? "bg-rose-500/20 text-rose-300"
                    : "bg-emerald-500/20 text-emerald-300"
                }`}
              >
                {holidayMode ? "Store Closed (Holiday / Sold Out)" : "Store Open for Orders"}
              </span>

              {holidayMode && (
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-neutral-300">
                    Storefront Notice Message (Shown to visitors)
                  </label>
                  <textarea
                    rows={2}
                    value={holidayMessage}
                    onChange={(e) => setHolidayMessage(e.target.value)}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Delivery & Ordering Cutoff */}
          <div className="adm-panel rounded-2xl border border-neutral-800/80 bg-neutral-900/60 p-6 backdrop-blur">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-400">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-serif text-lg font-bold text-neutral-100">
                  Fulfillment & Delivery Charges
                </h2>
                <p className="text-xs text-neutral-400">
                  Configure delivery pricing and daily order cutoff times
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-300">
                  Flat Delivery Charge (₹)
                </label>
                <input
                  type="number"
                  value={deliveryFeeFlat}
                  onChange={(e) => setDeliveryFeeFlat(e.target.value)}
                  placeholder="100"
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-300">
                  Free Delivery For Orders Of (₹) Or More
                </label>
                <input
                  type="number"
                  value={freeDeliveryAbove}
                  onChange={(e) => setFreeDeliveryAbove(e.target.value)}
                  placeholder="1500"
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor="cutoff-time" className="block text-xs font-medium text-neutral-300">
                    Daily Order Cutoff Time
                  </label>
                  {cutoffTime && (
                    <button type="button" onClick={() => setCutoffTime("")} className="text-[11px] text-neutral-400 underline hover:text-neutral-200">
                      Clear
                    </button>
                  )}
                </div>
                <input
                  id="cutoff-time"
                  type="time"
                  value={cutoffTime}
                  onChange={(e) => setCutoffTime(e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor="reopen-time" className="block text-xs font-medium text-neutral-300">
                    Orders Reopen At
                  </label>
                  {reopenTime && (
                    <button type="button" onClick={() => setReopenTime("")} className="text-[11px] text-neutral-400 underline hover:text-neutral-200">
                      Clear
                    </button>
                  )}
                </div>
                <input
                  id="reopen-time"
                  type="time"
                  value={reopenTime}
                  onChange={(e) => setReopenTime(e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-neutral-400">
              {(() => {
                const fmt = (t: string) => {
                  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
                  if (!Number.isFinite(h) || !Number.isFinite(m)) return t;
                  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
                };
                if (cutoffTime && reopenTime && cutoffTime === reopenTime)
                  return "Cutoff and reopen time are the same, so the closed window has no effect.";
                if (cutoffTime && reopenTime)
                  return `Customers cannot order from ${fmt(cutoffTime)} until ${fmt(reopenTime)} (India time). Orders are open the rest of the day.`;
                if (cutoffTime)
                  return `Customers cannot order after ${fmt(cutoffTime)}. Ordering reopens at midnight. Set a reopen time to choose when.`;
                if (reopenTime)
                  return `Customers cannot order before ${fmt(reopenTime)} (India time).`;
                return "No time limit: orders are accepted all day (unless the store is switched to closed above).";
              })()}
            </p>
          </div>

          {/* Tax */}
          <div className="adm-panel rounded-2xl border border-neutral-800/80 bg-neutral-900/60 p-6 backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-400">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-serif text-lg font-bold text-neutral-100">Tax (GST)</h2>
                  <p className="text-xs text-neutral-400">
                    Add tax to customer orders. It is calculated on the items, not on delivery.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={taxEnabled}
                aria-label="Charge tax on orders"
                onClick={() => setTaxEnabled(!taxEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  taxEnabled ? "bg-amber-500" : "bg-neutral-800"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    taxEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {taxEnabled && (
              <div className="mt-4 space-y-4 border-t border-neutral-800/60 pt-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-300">Tax Name</label>
                    <input
                      type="text"
                      value={taxLabel}
                      onChange={(e) => setTaxLabel(e.target.value)}
                      placeholder="GST"
                      maxLength={20}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-300">Tax Rate (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={taxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                      placeholder="5"
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <span className="mb-1 block text-xs font-medium text-neutral-300">How are your menu prices set?</span>
                  <div className="inline-flex rounded-full bg-neutral-950 p-1">
                    {(
                      [
                        { v: false, label: "Tax extra" },
                        { v: true, label: "Tax included" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => setTaxInclusive(opt.v)}
                        className={`rounded-full px-5 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                          taxInclusive === opt.v
                            ? "bg-amber-500 text-gold-foreground shadow"
                            : "text-neutral-400 hover:text-neutral-200"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {(() => {
                  const r = Math.max(0, Number(taxRate) || 0);
                  const sample = 1000;
                  const t = taxInclusive
                    ? Math.round(sample - sample / (1 + r / 100))
                    : Math.round((sample * r) / 100);
                  const total = taxInclusive ? sample : sample + t;
                  return (
                    <div className="flex items-start gap-2 rounded-xl border border-neutral-800 border-l-2 border-l-amber-500 bg-neutral-950 p-3 text-xs text-neutral-200">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        {taxInclusive
                          ? `Prices already contain tax. On a ${formatINR(sample)} order, ${formatINR(t)} is ${taxLabel || "GST"} and the customer pays ${formatINR(total)} (plus any delivery fee).`
                          : `Tax is added on top. On a ${formatINR(sample)} order, ${taxLabel || "GST"} is ${formatINR(t)} and the customer pays ${formatINR(total)} (plus any delivery fee).`}
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Invoice details */}
          <div className="adm-panel rounded-2xl border border-neutral-800/80 bg-neutral-900/60 p-6 backdrop-blur">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-400">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-serif text-lg font-bold text-neutral-100">Invoice details</h2>
                <p className="text-xs text-neutral-400">
                  Printed on every invoice. An invoice is created automatically when a payment is received.
                </p>
              </div>
            </div>

            <div className="mb-4 flex items-start gap-2 rounded-xl border border-neutral-800 border-l-2 border-l-amber-500 bg-neutral-950 p-3 text-xs text-neutral-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {taxEnabled
                  ? `Tax is ON: new orders get a Tax Invoice with ${taxLabel || "GST"} split into CGST + SGST.`
                  : "Tax is OFF: new orders get a Bill of Supply with no tax lines."}{" "}
                The bill follows the tax setting at the time the order is placed. Invoices already issued never change.
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: "Business name", value: invBusinessName, set: setInvBusinessName },
                { label: "GSTIN", value: invGstin, set: setInvGstin, mono: true, ph: "27ABCDE1234F1Z5" },
                { label: "FSSAI licence no.", value: invFssai, set: setInvFssai, mono: true, ph: "14 digits" },
                { label: "HSN code", value: invHsn, set: setInvHsn, mono: true, ph: "e.g. 1905" },
                { label: "State", value: invState, set: setInvState },
                { label: "State code (GST)", value: invStateCode, set: setInvStateCode, mono: true, ph: "27" },
              ].map((f) => (
                <label key={f.label} className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    {f.label}
                  </span>
                  <input
                    type="text"
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    placeholder={f.ph}
                    className={`w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 focus:border-amber-500 focus:outline-none ${f.mono ? "font-mono" : ""}`}
                  />
                </label>
              ))}
            </div>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Business address
              </span>
              <textarea
                rows={2}
                value={invAddress}
                onChange={(e) => setInvAddress(e.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 focus:border-amber-500 focus:outline-none"
              />
            </label>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Invoice footer note
              </span>
              <textarea
                rows={2}
                value={invFooter}
                onChange={(e) => setInvFooter(e.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 focus:border-amber-500 focus:outline-none"
              />
            </label>
            <p className="mt-3 text-[11px] text-neutral-500">
              The GSTIN, FSSAI and address shown here are placeholders. Replace them with the real ones before going live.
            </p>
          </div>

          {/* Payment Mode */}
          <div className="adm-panel rounded-2xl border border-neutral-800/80 bg-neutral-900/60 p-6 backdrop-blur">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-400">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-serif text-lg font-bold text-neutral-100">
                  Payment Mode
                </h2>
                <p className="text-xs text-neutral-400">
                  Demo takes no real money and lets you test the full order flow end to end
                </p>
              </div>
            </div>

            <div className="inline-flex rounded-full bg-neutral-950 p-1">
              {(["demo", "live"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPaymentMode(mode)}
                  className={`rounded-full px-5 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                    paymentMode === mode
                      ? "bg-amber-500 text-gold-foreground shadow"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {mode === "demo" ? "Demo" : "Live"}
                </button>
              ))}
            </div>

            {paymentMode === "live" ? (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-neutral-800 border-l-2 border-l-rose-400 bg-neutral-950 p-3 text-xs text-neutral-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Live mode blocks new online orders until a real payment gateway is connected. Leave this on
                  Demo for now.
                </span>
              </div>
            ) : (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-neutral-800 border-l-2 border-l-emerald-400 bg-neutral-950 p-3 text-xs text-neutral-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Demo mode is active — customers can place and confirm orders without any real charge.
                </span>
              </div>
            )}
          </div>

          {/* WhatsApp Integration */}
          <div className="adm-panel rounded-2xl border border-neutral-800/80 bg-neutral-900/60 p-6 backdrop-blur">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-400">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-serif text-lg font-bold text-neutral-100">
                  WhatsApp Business Contact
                </h2>
                <p className="text-xs text-neutral-400">
                  Destination phone number where customer orders are routed
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-300">
                  WhatsApp Number (with country code, digits only)
                </label>
                <input
                  type="text"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="919619617888"
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-300">
                  Formatted Display Number
                </label>
                <input
                  type="text"
                  value={whatsappDisplay}
                  onChange={(e) => setWhatsappDisplay(e.target.value)}
                  placeholder="+91 96196 17888"
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Announcement Banner */}
          <div className="adm-panel rounded-2xl border border-neutral-800/80 bg-neutral-900/60 p-6 backdrop-blur">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-400">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-serif text-lg font-bold text-neutral-100">
                    Storefront Promotional Banner
                  </h2>
                  <p className="text-xs text-neutral-400">
                    Optional announcement header bar displayed across the website
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setBannerEnabled(!bannerEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  bannerEnabled ? "bg-amber-500" : "bg-neutral-800"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    bannerEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {bannerEnabled && (
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-300">
                  Banner Text
                </label>
                <input
                  type="text"
                  value={bannerText}
                  onChange={(e) => setBannerText(e.target.value)}
                  placeholder="e.g. Complimentary saffron tea with every kunafa box this weekend!"
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            )}
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-xs font-bold text-gold-foreground hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>{isSaving ? "Saving Settings..." : "Save All Settings"}</span>
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
