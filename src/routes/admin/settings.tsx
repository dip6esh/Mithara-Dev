import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "../../lib/supabase";
import { SETTINGS_CACHE_KEY, cacheGet, cacheSet, hasCache } from "../../lib/adminCache";
import {
  Store,
  Clock,
  Truck,
  AlertCircle,
  Save,
  RefreshCw,
  Bell,
  Wallet,
  FileText,
  Percent,
  CheckCircle2,
  XCircle,
  ChevronDown,
} from "lucide-react";
import { WhatsAppIcon } from "../../components/admin/WhatsAppButton";
import { toast } from "sonner";
import { unwrapSetting, isStoreClosed, DEFAULT_STORE_SETTINGS } from "../../lib/settings";
import { formatINR } from "../../lib/enquiry";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [{ title: "Mithara Admin — Settings" }],
  }),
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  // Coming back to this page shows the last values straight away and refreshes them quietly.
  const [isLoading, setIsLoading] = useState(() => !hasCache(SETTINGS_CACHE_KEY));
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

  type SettingRow = { key: string; value: any };

  const applyRows = (data: SettingRow[]) => {
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
  };

  const fetchSettings = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const { data, error } = await supabase.from("site_settings").select("key, value");
      if (error) throw error;
      if (data) {
        cacheSet(SETTINGS_CACHE_KEY, data);
        applyRows(data);
      }
    } catch (err: any) {
      console.error(err);
      if (!silent) toast.error("Failed to load settings");
    } finally {
      setIsLoading(false);
    }
  };

  // Show the remembered values before the first paint (no flash of defaults), then refresh quietly.
  useLayoutEffect(() => {
    const cached = cacheGet<SettingRow[]>(SETTINGS_CACHE_KEY);
    if (cached) applyRows(cached);
  }, []);

  useEffect(() => {
    void fetchSettings(hasCache(SETTINGS_CACHE_KEY));
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

      cacheSet(SETTINGS_CACHE_KEY, payload.map(({ key, value }) => ({ key, value })));
      window.dispatchEvent(new Event("mithara:settings-saved"));
      toast.success("Settings saved and live on the storefront.");
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const fmtTime = (t: string) => {
    const [h, m] = t.split(":").map((n) => parseInt(n, 10));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return t;
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  };

  const timingSummary = (() => {
    if (cutoffTime && reopenTime && cutoffTime === reopenTime)
      return "Cutoff and reopen time are the same, so the closed window has no effect.";
    if (cutoffTime && reopenTime)
      return `Customers cannot order from ${fmtTime(cutoffTime)} until ${fmtTime(reopenTime)} (India time). Orders are open the rest of the day.`;
    if (cutoffTime)
      return `Customers cannot order after ${fmtTime(cutoffTime)}. Ordering reopens at midnight. Set a reopen time to choose when.`;
    if (reopenTime) return `Customers cannot order before ${fmtTime(reopenTime)} (India time).`;
    return "No time limit: orders are accepted all day (unless the store is switched to closed above).";
  })();

  // Re-check every 20 s so the status flips the moment the cutoff time passes.
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setClockTick((n) => n + 1), 20_000);
    return () => clearInterval(t);
  }, []);
  // Is the store closed right now purely because of the cutoff window (holiday switch ignored)?
  const cutoffClosed = isStoreClosed({
    ...DEFAULT_STORE_SETTINGS,
    holiday_mode: false,
    order_cutoff_time: cutoffTime,
    order_reopen_time: reopenTime,
  }).closed;
  const effectivelyClosed = holidayMode || cutoffClosed;

  const taxSample = (() => {
    const r = Math.max(0, Number(taxRate) || 0);
    const sample = 1000;
    const t = taxInclusive
      ? Math.round(sample - sample / (1 + r / 100))
      : Math.round((sample * r) / 100);
    return { sample, t, total: taxInclusive ? sample : sample + t };
  })();

  const activeSection = useActiveSection(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id)));

  return (
    <div className="mx-auto max-w-6xl">
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100 sm:text-3xl">Settings</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Store hours, delivery, tax, invoices and contact details. Changes go live on the storefront when you save.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchSettings()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-[#cfc9e0] bg-white px-3.5 py-2 text-xs font-semibold text-neutral-300 shadow-sm hover:border-[#d39c54] hover:text-[#a8691d] disabled:opacity-60 sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          <span>Reload settings</span>
        </button>
      </div>

      {/* Mobile section chips */}
      <div className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden">
        {NAV_GROUPS.flatMap((g) => g.items).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => jumpTo(item.id)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
              activeSection === item.id
                ? "border-[#282345] bg-[#282345] text-white"
                : "border-[#cfc9e0] bg-white text-neutral-300"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[210px_minmax(0,1fr)]">
        {/* Desktop sticky section nav */}
        <aside className="hidden lg:block">
          <nav aria-label="Settings sections" className="sticky top-[5.5rem] space-y-5">
            {NAV_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">
                  {group.title}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = activeSection === item.id;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => jumpTo(item.id)}
                          className={`adm-no-lift flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-semibold transition-colors ${
                            active
                              ? "bg-white text-neutral-100 shadow-sm ring-1 ring-[#d3cde4]"
                              : "text-neutral-400 hover:bg-white/70 hover:text-neutral-200"
                          }`}
                        >
                          <Icon className={`h-4 w-4 ${active ? item.navColor : ""}`} />
                          {item.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <form
          onSubmit={handleSaveSettings}
          aria-busy={isLoading}
          className={`min-w-0 space-y-4 transition-opacity ${isLoading ? "opacity-60" : ""}`}
        >
          {/* ───────── STOREFRONT ───────── */}
          <GroupLabel>Storefront</GroupLabel>

          <Section
            id="store"
            tone={effectivelyClosed ? "rose" : "emerald"}
            icon={Store}
            title="Store availability"
            description="Pause new orders when you are sold out, on holiday or hosting a private event."
          >
            <Segmented
              ariaLabel="Store status"
              value={effectivelyClosed ? "closed" : "open"}
              onChange={(v) => setHolidayMode(v === "closed")}
              options={[
                { value: "open", label: "Open for orders", active: "bg-[#059669] text-white" },
                { value: "closed", label: "Closed", active: "bg-[#e11d48] text-white" },
              ]}
            />
            {holidayMode ? (
              <>
                <Callout tone="danger" icon={XCircle}>
                  The store is closed. Customers can browse but cannot place orders.
                </Callout>
                <Field label="Notice shown to visitors" htmlFor="holiday-message">
                  <TextArea
                    id="holiday-message"
                    rows={2}
                    value={holidayMessage}
                    onChange={(e) => setHolidayMessage(e.target.value)}
                  />
                </Field>
              </>
            ) : cutoffClosed ? (
              <Callout tone="danger" icon={Clock}>
                <p>
                  Closed automatically by the order cutoff.{" "}
                  {reopenTime
                    ? `Orders reopen at ${fmtTime(reopenTime)}.`
                    : "Orders reopen at midnight."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setCutoffTime("");
                    setReopenTime("");
                  }}
                  className="mt-1.5 text-xs font-bold text-[#be123c] underline underline-offset-2 hover:text-[#9f1239]"
                >
                  Remove cutoff and reopen now
                </button>
              </Callout>
            ) : (
              <Callout tone="success" icon={CheckCircle2}>
                The store is open and accepting orders.
              </Callout>
            )}
          </Section>

          <Section
            id="banner"
            tone="gold"
            icon={Bell}
            title="Promotional banner"
            description="An optional announcement bar shown across the top of the website."
            action={<Toggle checked={bannerEnabled} onChange={setBannerEnabled} label="Show promotional banner" />}
          >
            {bannerEnabled ? (
              <Field label="Banner text" htmlFor="banner-text">
                <Input
                  id="banner-text"
                  type="text"
                  value={bannerText}
                  onChange={(e) => setBannerText(e.target.value)}
                  placeholder="e.g. Complimentary saffron tea with every kunafa box this weekend!"
                />
              </Field>
            ) : (
              <p className="text-sm text-neutral-400">The banner is hidden. Switch it on to write an announcement.</p>
            )}
          </Section>

          {/* ───────── ORDERS & PAYMENTS ───────── */}
          <GroupLabel>Orders &amp; payments</GroupLabel>

          <Section
            id="delivery"
            tone="blue"
            icon={Truck}
            title="Delivery & ordering hours"
            description="Delivery pricing and the daily window when customers can order."
          >
            <SubHeading>Delivery pricing</SubHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Flat delivery charge" htmlFor="delivery-fee">
                <Input
                  id="delivery-fee"
                  type="number"
                  addonLeft="₹"
                  value={deliveryFeeFlat}
                  onChange={(e) => setDeliveryFeeFlat(e.target.value)}
                  placeholder="100"
                />
              </Field>
              <Field label="Free delivery on orders of" hint="Orders at or above this amount ship free." htmlFor="free-delivery">
                <Input
                  id="free-delivery"
                  type="number"
                  addonLeft="₹"
                  addonRight="or more"
                  value={freeDeliveryAbove}
                  onChange={(e) => setFreeDeliveryAbove(e.target.value)}
                  placeholder="1500"
                />
              </Field>
            </div>

            <SubHeading>Daily ordering window</SubHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Order cutoff time"
                htmlFor="cutoff-time"
                action={
                  cutoffTime ? (
                    <button type="button" onClick={() => setCutoffTime("")} className="text-[11px] font-semibold text-[#4338ca] hover:underline">
                      Clear
                    </button>
                  ) : null
                }
              >
                <TimePicker
                  id="cutoff-time"
                  value={cutoffTime}
                  onChange={setCutoffTime}
                  defaultPm
                />
              </Field>
              <Field
                label="Orders reopen at"
                htmlFor="reopen-time"
                action={
                  reopenTime ? (
                    <button type="button" onClick={() => setReopenTime("")} className="text-[11px] font-semibold text-[#4338ca] hover:underline">
                      Clear
                    </button>
                  ) : null
                }
              >
                <TimePicker
                  id="reopen-time"
                  value={reopenTime}
                  onChange={setReopenTime}
                />
              </Field>
            </div>
            <Callout tone="info" icon={Clock}>
              {timingSummary}
            </Callout>
          </Section>

          <Section
            id="tax"
            tone="gold"
            icon={Percent}
            title="Tax (GST)"
            description="Add tax to customer orders. It is calculated on the items, not on delivery."
            action={<Toggle checked={taxEnabled} onChange={setTaxEnabled} label="Charge tax on orders" />}
          >
            {taxEnabled ? (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Tax name" htmlFor="tax-label">
                    <Input
                      id="tax-label"
                      type="text"
                      value={taxLabel}
                      onChange={(e) => setTaxLabel(e.target.value)}
                      placeholder="GST"
                      maxLength={20}
                    />
                  </Field>
                  <Field label="Tax rate" htmlFor="tax-rate">
                    <Input
                      id="tax-rate"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      addonRight="%"
                      value={taxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                      placeholder="5"
                    />
                  </Field>
                </div>

                <Field label="How are your menu prices set?">
                  <Segmented
                    ariaLabel="Tax pricing"
                    value={taxInclusive ? "incl" : "excl"}
                    onChange={(v) => setTaxInclusive(v === "incl")}
                    options={[
                      { value: "excl", label: "Tax extra" },
                      { value: "incl", label: "Tax included" },
                    ]}
                  />
                </Field>

                <Callout tone="info" icon={AlertCircle}>
                  {taxInclusive
                    ? `Prices already contain tax. On a ${formatINR(taxSample.sample)} order, ${formatINR(taxSample.t)} is ${taxLabel || "GST"} and the customer pays ${formatINR(taxSample.total)} (plus any delivery fee).`
                    : `Tax is added on top. On a ${formatINR(taxSample.sample)} order, ${taxLabel || "GST"} is ${formatINR(taxSample.t)} and the customer pays ${formatINR(taxSample.total)} (plus any delivery fee).`}
                </Callout>
              </>
            ) : (
              <p className="text-sm text-neutral-400">Tax is off. Switch it on to add GST to orders.</p>
            )}
          </Section>

          <Section
            id="payment"
            tone="violet"
            icon={Wallet}
            title="Payment mode"
            description="Demo takes no real money and lets you test the full order flow end to end."
          >
            <Segmented
              ariaLabel="Payment mode"
              value={paymentMode}
              onChange={(v) => setPaymentMode(v as "demo" | "live")}
              options={[
                { value: "demo", label: "Demo" },
                { value: "live", label: "Live" },
              ]}
            />
            {paymentMode === "live" ? (
              <Callout tone="danger" icon={AlertCircle}>
                Live mode blocks new online orders until a real payment gateway is connected. Leave this on Demo for now.
              </Callout>
            ) : (
              <Callout tone="success" icon={CheckCircle2}>
                Demo mode is active. Customers can place and confirm orders without any real charge.
              </Callout>
            )}
          </Section>

          {/* ───────── BUSINESS DETAILS ───────── */}
          <GroupLabel>Business details</GroupLabel>

          <Section
            id="invoice"
            tone="indigo"
            icon={FileText}
            title="Invoice details"
            description="Printed on every invoice. An invoice is created automatically when a payment is received."
          >
            <Callout tone="info" icon={AlertCircle}>
              {taxEnabled
                ? `Tax is ON: new orders get a Tax Invoice with ${taxLabel || "GST"} split into CGST + SGST.`
                : "Tax is OFF: new orders get a Bill of Supply with no tax lines."}{" "}
              The bill follows the tax setting at the time the order is placed. Invoices already issued never change.
            </Callout>

            <SubHeading>Business identity</SubHeading>
            <Field label="Business name" htmlFor="inv-name">
              <Input id="inv-name" type="text" value={invBusinessName} onChange={(e) => setInvBusinessName(e.target.value)} />
            </Field>
            <Field label="Business address" htmlFor="inv-address">
              <TextArea id="inv-address" rows={2} value={invAddress} onChange={(e) => setInvAddress(e.target.value)} />
            </Field>

            <SubHeading>Registration &amp; tax codes</SubHeading>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { id: "inv-gstin", label: "GSTIN", value: invGstin, set: setInvGstin, mono: true, ph: "27ABCDE1234F1Z5" },
                { id: "inv-fssai", label: "FSSAI licence no.", value: invFssai, set: setInvFssai, mono: true, ph: "14 digits" },
                { id: "inv-hsn", label: "HSN code", value: invHsn, set: setInvHsn, mono: true, ph: "e.g. 1905" },
                { id: "inv-state", label: "State", value: invState, set: setInvState, mono: false, ph: "" },
                { id: "inv-state-code", label: "State code (GST)", value: invStateCode, set: setInvStateCode, mono: true, ph: "27" },
              ].map((f) => (
                <Field key={f.id} label={f.label} htmlFor={f.id}>
                  <Input
                    id={f.id}
                    type="text"
                    mono={f.mono}
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    placeholder={f.ph}
                  />
                </Field>
              ))}
            </div>
            <Callout tone="warn" icon={AlertCircle}>
              The GSTIN, FSSAI and address shown here are placeholders. Replace them with the real ones before going live.
            </Callout>

            <SubHeading>Footer</SubHeading>
            <Field label="Invoice footer note" htmlFor="inv-footer">
              <TextArea id="inv-footer" rows={2} value={invFooter} onChange={(e) => setInvFooter(e.target.value)} />
            </Field>
          </Section>

          <Section
            id="whatsapp"
            tone="whatsapp"
            icon={WhatsAppIcon}
            title="WhatsApp business contact"
            description="The phone number where customer orders are routed."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="WhatsApp number" hint="Country code + number, digits only." htmlFor="wa-number">
                <Input
                  id="wa-number"
                  type="text"
                  inputMode="numeric"
                  mono
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="919619617888"
                />
              </Field>
              <Field label="Display number" hint="How the number appears to customers." htmlFor="wa-display">
                <Input
                  id="wa-display"
                  type="text"
                  value={whatsappDisplay}
                  onChange={(e) => setWhatsappDisplay(e.target.value)}
                  placeholder="+91 96196 17888"
                />
              </Field>
            </div>
          </Section>

          {/* Floating save bar */}
          <div className="sticky bottom-4 z-20 pt-2">
            <div className="flex flex-col gap-3 rounded-2xl border border-[#d3cde4] bg-white/95 px-4 py-3 shadow-[0_12px_32px_-12px_rgba(40,35,69,.35)] backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-xs text-neutral-400">
                Saving updates the live storefront straight away.
              </p>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#282345] px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#282345]/25 hover:bg-[#1c1733] disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>{isSaving ? "Saving…" : "Save all settings"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ───────────────────────── Settings UI building blocks ───────────────────────── */

const NAV_GROUPS: {
  title: string;
  items: { id: string; label: string; icon: React.ComponentType<{ className?: string }>; navColor: string }[];
}[] = [
  {
    title: "Storefront",
    items: [
      { id: "store", label: "Availability", icon: Store, navColor: "text-[#059669]" },
      { id: "banner", label: "Banner", icon: Bell, navColor: "text-[#b9772a]" },
    ],
  },
  {
    title: "Orders & payments",
    items: [
      { id: "delivery", label: "Delivery & hours", icon: Truck, navColor: "text-[#2563eb]" },
      { id: "tax", label: "Tax (GST)", icon: Percent, navColor: "text-[#b9772a]" },
      { id: "payment", label: "Payment mode", icon: Wallet, navColor: "text-[#7c3aed]" },
    ],
  },
  {
    title: "Business details",
    items: [
      { id: "invoice", label: "Invoice details", icon: FileText, navColor: "text-[#282345]" },
      { id: "whatsapp", label: "WhatsApp", icon: WhatsAppIcon, navColor: "text-[#25D366]" },
    ],
  },
];

function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Height of the sticky admin header (4rem) plus a little breathing room.
const STICKY_OFFSET = 112;

function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) {
        setActive(ids[ids.length - 1]);
        return;
      }
      // The active section is the last one whose top has scrolled past the offset line.
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= STICKY_OFFSET + 8) current = id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return active;
}

type Tone = "emerald" | "rose" | "blue" | "gold" | "indigo" | "violet" | "whatsapp";

const TONES: Record<Tone, { tile: string; bar: string }> = {
  emerald: { tile: "bg-[#e6f6ee] text-[#059669] ring-[#bfe6d2]", bar: "bg-[#10b981]" },
  rose: { tile: "bg-[#fde8ec] text-[#e11d48] ring-[#f8c3cd]", bar: "bg-[#f43f5e]" },
  blue: { tile: "bg-[#e8f0fe] text-[#2563eb] ring-[#c3d6fb]", bar: "bg-[#3b82f6]" },
  gold: { tile: "bg-[#fbf1e1] text-[#a8691d] ring-[#efd6ae]", bar: "bg-[#d39c54]" },
  indigo: { tile: "bg-[#ebe9f6] text-[#282345] ring-[#cfcae6]", bar: "bg-[#282345]" },
  violet: { tile: "bg-[#f1e9fd] text-[#7c3aed] ring-[#dcc8f8]", bar: "bg-[#8b5cf6]" },
  whatsapp: { tile: "bg-[#25D366] text-white ring-[#25D366]/30", bar: "bg-[#25D366]" },
};

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-4 first:pt-0">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">{children}</h2>
      <span className="h-px flex-1 bg-[#d3cde4]" />
    </div>
  );
}

function Section({
  id,
  tone,
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  id: string;
  tone: Tone;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = TONES[tone];
  return (
    <section
      id={id}
      className="adm-panel relative scroll-mt-24 rounded-2xl border border-[#d3cde4] bg-white shadow-[0_1px_2px_rgba(40,35,69,.06)]"
    >
      <span className={`absolute inset-y-0 left-0 w-1 rounded-l-2xl transition-colors ${t.bar}`} aria-hidden="true" />
      <header className="flex items-start justify-between gap-4 rounded-t-2xl border-b border-[#e7e3f0] bg-[#faf9fd] py-4 pr-5 pl-6 sm:pr-6 sm:pl-7">
        <div className="flex items-start gap-3.5">
          <div className={`adm-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 transition-colors ${t.tile}`}>
            <Icon className="h-[22px] w-[22px]" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-neutral-100">{title}</h3>
            <p className="mt-0.5 text-[13px] leading-snug text-neutral-400">{description}</p>
          </div>
        </div>
        {action}
      </header>
      <div className="space-y-5 py-5 pr-5 pl-6 sm:pr-6 sm:pl-7">{children}</div>
    </section>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">{children}</h4>
      <span className="h-px flex-1 bg-[#e7e3f0]" />
    </div>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  action,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex min-h-[18px] items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-neutral-200">
          {label}
        </label>
        {action}
      </div>
      {children}
      {hint && <p className="mt-1.5 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

const FIELD_BASE =
  "w-full border border-[#c9c2dd] bg-white text-sm text-neutral-100 placeholder:text-[#a8a1c2] shadow-[inset_0_1px_2px_rgba(40,35,69,.05)] hover:border-[#aaa2c8] focus:outline-none";

function Input({
  addonLeft,
  addonRight,
  mono,
  className = "",
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { addonLeft?: string; addonRight?: string; mono?: boolean }) {
  const radius = `${addonLeft ? "rounded-l-none" : "rounded-l-xl"} ${addonRight ? "rounded-r-none" : "rounded-r-xl"}`;
  const addon =
    "flex shrink-0 items-center border border-[#c9c2dd] bg-[#f1eff8] px-3 text-sm font-semibold text-neutral-400";
  return (
    <div className="flex">
      {addonLeft && <span className={`${addon} rounded-l-xl border-r-0`}>{addonLeft}</span>}
      <input
        {...rest}
        className={`${FIELD_BASE} min-w-0 px-3.5 py-2.5 ${radius} ${mono ? "font-mono" : ""} ${className}`}
      />
      {addonRight && <span className={`${addon} rounded-r-xl border-l-0`}>{addonRight}</span>}
    </div>
  );
}

function TextArea({ className = "", ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={`${FIELD_BASE} rounded-xl px-3.5 py-2.5 ${className}`} />;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function parseHHMM(v: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(v.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  return h <= 23 && min <= 59 ? { h, m: min } : null;
}

function label12(v: string): string {
  const p = parseHHMM(v);
  if (!p) return "";
  return `${p.h % 12 === 0 ? 12 : p.h % 12}:${pad2(p.m)} ${p.h < 12 ? "AM" : "PM"}`;
}

/**
 * Analog clock time picker. Drag the short hour hand or the long minute hand (or tap anywhere on the
 * face) to set the time. Turning the minute hand past 12 moves the hour on, like a real clock.
 * Value is "HH:MM" (24 h).
 */
function TimePicker({
  id,
  value,
  onChange,
  defaultPm = false,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  defaultPm?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ hand: "hour" | "minute"; h24: number; minute: number; lastMin: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const parsed = parseHHMM(value);
  // Until a time is chosen the clock rests at a sensible default (8:00 PM for cutoff, 8:00 AM for reopen).
  const h24 = parsed ? parsed.h : defaultPm ? 20 : 8;
  const minute = parsed ? parsed.m : 0;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const pm = h24 >= 12;

  const commit = (h: number, m: number) => onChange(`${pad2(h)}:${pad2(m)}`);

  const pointerAt = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 200 - 100;
    const y = ((e.clientY - r.top) / r.height) * 200 - 100;
    return { deg: (Math.atan2(x, -y) * 180) / Math.PI + 360, dist: Math.hypot(x, y) };
  };

  const apply = (deg: number, first: boolean) => {
    const d = drag.current;
    if (!d) return;
    const a = deg % 360;
    if (d.hand === "hour") {
      const hh = Math.round(a / 30) % 12;
      d.h24 = (d.h24 >= 12 ? 12 : 0) + hh; // keep AM / PM
    } else {
      const m = Math.round(a / 6) % 60;
      if (!first) {
        if (d.lastMin > 45 && m < 15) d.h24 = (d.h24 + 1) % 24; // passed 12 going clockwise
        else if (d.lastMin < 15 && m > 45) d.h24 = (d.h24 + 23) % 24; // passed 12 going back
      }
      d.lastMin = m;
      d.minute = m;
    }
    commit(d.h24, d.minute);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const { deg, dist } = pointerAt(e);
    const hand = dist < 50 ? "hour" : "minute";
    drag.current = { hand, h24, minute, lastMin: minute };
    e.currentTarget.setPointerCapture(e.pointerId);
    apply(deg, true);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag.current) apply(pointerAt(e).deg, false);
  };
  const endDrag = () => {
    drag.current = null;
  };

  const flipPeriod = (toPm: boolean) => commit((h24 % 12) + (toPm ? 12 : 0), minute);

  const hourAngle = ((h12 % 12) + minute / 60) * 30;
  const minuteAngle = minute * 6;
  const pos = (deg: number, r: number) => ({
    x: 100 + r * Math.sin((deg * Math.PI) / 180),
    y: 100 - r * Math.cos((deg * Math.PI) / 180),
  });

  return (
    <div ref={ref} className="relative">
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`adm-no-lift flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-3.5 py-2.5 text-left text-sm shadow-[inset_0_1px_2px_rgba(40,35,69,.05)] hover:border-[#aaa2c8] ${
          open ? "border-[#d39c54]" : "border-[#c9c2dd]"
        }`}
      >
        <span className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-neutral-500" />
          {parsed ? (
            <span className="font-semibold text-neutral-100">{label12(value)}</span>
          ) : (
            <span className="text-[#a8a1c2]">Not set — tap to open clock</span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Set time on the clock"
          className="absolute top-full left-0 z-30 mt-2 w-[232px] rounded-2xl border border-[#d3cde4] bg-white p-3 shadow-[0_18px_40px_-12px_rgba(40,35,69,.35)]"
        >
          {/* Time + AM / PM */}
          <div className="mb-1 flex items-center justify-between px-1">
            <span className={`text-lg font-bold tabular-nums ${parsed ? "text-[#1c1733]" : "text-[#a8a1c2]"}`}>
              {h12}:{pad2(minute)}
            </span>
            <div role="radiogroup" aria-label="AM or PM" className="inline-flex rounded-full bg-[#f1eff8] p-0.5">
              {[
                { v: false, l: "AM" },
                { v: true, l: "PM" },
              ].map((o) => (
                <button
                  key={o.l}
                  type="button"
                  role="radio"
                  aria-checked={pm === o.v}
                  onClick={() => flipPeriod(o.v)}
                  className={`adm-no-lift rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                    pm === o.v ? "bg-[#282345] text-white" : "text-[#6b6488] hover:text-[#1c1733]"
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          {/* The clock */}
          <svg
            ref={svgRef}
            viewBox="0 0 200 200"
            role="img"
            aria-label={`Clock showing ${h12}:${pad2(minute)} ${pm ? "PM" : "AM"}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="mx-auto block w-full cursor-grab touch-none select-none active:cursor-grabbing"
          >
            <circle cx="100" cy="100" r="96" fill="#faf9fd" stroke="#d3cde4" strokeWidth="2" />
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => {
              const p = pos(n * 30, 76);
              return (
                <text
                  key={n}
                  x={p.x}
                  y={p.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="15"
                  fontWeight={n === h12 ? 800 : 500}
                  fill={n === h12 ? "#a8691d" : "#4a4370"}
                  style={{ pointerEvents: "none" }}
                >
                  {n}
                </text>
              );
            })}
            {/* Hour hand */}
            <g transform={`rotate(${hourAngle} 100 100)`}>
              <line x1="100" y1="100" x2="100" y2="58" stroke="#282345" strokeWidth="5" strokeLinecap="round" />
            </g>
            {/* Minute hand */}
            <g transform={`rotate(${minuteAngle} 100 100)`}>
              <line x1="100" y1="100" x2="100" y2="32" stroke="#d39c54" strokeWidth="3" strokeLinecap="round" />
              <circle cx="100" cy="32" r="5" fill="#d39c54" />
            </g>
            <circle cx="100" cy="100" r="5" fill="#282345" />
          </svg>
        </div>
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <span className={`text-xs font-bold uppercase tracking-wide ${checked ? "text-[#059669]" : "text-neutral-500"}`}>
        {checked ? "On" : "Off"}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`adm-no-lift relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d39c54] focus-visible:ring-offset-2 ${
          checked ? "bg-[#059669]" : "bg-[#b9b2d0]"
        }`}
      >
        <span
          className={`pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; active?: string }[];
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-xl border border-[#d3cde4] bg-[#f1eff8] p-1">
      {options.map((opt) => {
        const on = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(opt.value)}
            className={`adm-no-lift rounded-lg px-5 py-2 text-[13px] font-bold transition-all ${
              on ? `${opt.active ?? "bg-[#282345] text-white"} shadow` : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const CALLOUTS = {
  info: { box: "border-[#d9d4f0] bg-[#f3f1fb] text-[#2e2850]", icon: "text-[#4338ca]" },
  success: { box: "border-[#bfe6d2] bg-[#ecf8f2] text-[#065f46]", icon: "text-[#059669]" },
  danger: { box: "border-[#f8c3cd] bg-[#fdeff2] text-[#9f1239]", icon: "text-[#e11d48]" },
  warn: { box: "border-[#efd6ae] bg-[#fdf6e9] text-[#7a4a0f]", icon: "text-[#b9772a]" },
} as const;

function Callout({
  tone,
  icon: Icon,
  children,
}: {
  tone: keyof typeof CALLOUTS;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  const c = CALLOUTS[tone];
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed ${c.box}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${c.icon}`} />
      <div>{children}</div>
    </div>
  );
}
