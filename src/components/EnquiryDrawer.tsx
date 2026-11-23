import * as React from "react";
import { Link, useRouter } from "@tanstack/react-router";
import {
  Banknote,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  Loader2,
  MessageCircle,
  Pencil,
  Phone,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import { useEnquiry } from "./EnquiryProvider";
import { QtyStepper } from "./QtyStepper";
import {
  MAX_ITEM_NOTE,
  MAX_NOTES,
  buildMessage,
  formatINR,
  whatsappUrl,
  type EnquiryLine,
} from "../lib/enquiry";
import { CustomerOrderAddress, type OrderCustomerData } from "./CustomerOrderAddress";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import {
  isStoreClosed,
  refreshStoreSettings,
  useStoreSettings,
  previewTotals,
  type TaxPreview,
  type StoreSettings,
} from "../lib/settings";
import {
  DEMO_BANNER,
  confirmPayment,
  startPayment,
  type PaymentOption,
} from "../lib/payment";
import type { PaymentMethod } from "../lib/types";

/* Shared look for text inputs: recessed, hairline border, gold only on focus. */
const field =
  "w-full rounded-xl border border-border bg-black/20 px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/60 transition-colors focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

const quietButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border px-5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:bg-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

const primaryButton =
  "btn-gold inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-full bg-gradient-gold px-6 py-3.5 text-base font-semibold text-gold-foreground shadow-elegant focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-deep disabled:opacity-60";

type Step = "cart" | "checkout" | "payment" | "done";

type PlacedOrder = {
  order_number: string;
  subtotal_inr: number;
  delivery_fee_inr: number;
  tax_inr: number;
  tax_label: string | null;
  tax_inclusive: boolean;
  total_inr: number;
  delivery_type: "delivery" | "pickup";
  payment_method: PaymentMethod;
  payment_mode: "demo" | "live";
  lines: EnquiryLine[];
};

function SectionHeading({
  id,
  children,
  aside,
}: {
  id: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 id={id} className="font-sans text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
        {children}
      </h3>
      {aside}
    </div>
  );
}

/** The three steps a customer moves through before the order is placed. */
const FLOW: { id: "cart" | "checkout" | "payment"; label: string }[] = [
  { id: "cart", label: "Cart" },
  { id: "checkout", label: "Details" },
  { id: "payment", label: "Payment" },
];

function Stepper({ step }: { step: Step }) {
  const idx = FLOW.findIndex((f) => f.id === step);
  if (idx < 0) return null;
  return (
    <ol aria-label="Checkout progress" className="mt-4 flex items-center gap-2">
      {FLOW.map((f, i) => {
        const done = i < idx;
        const current = i === idx;
        return (
          <React.Fragment key={f.id}>
            <li aria-current={current ? "step" : undefined} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                  done
                    ? "bg-accent text-gold-foreground"
                    : current
                      ? "border border-accent bg-accent/10 text-accent"
                      : "border border-border text-muted-foreground"
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
              </span>
              <span
                className={`text-xs font-medium ${current ? "text-foreground" : "text-muted-foreground"}`}
              >
                {f.label}
                <span className="sr-only">{done ? " (completed)" : current ? " (current step)" : ""}</span>
              </span>
            </li>
            {i < FLOW.length - 1 && (
              <span
                aria-hidden="true"
                className={`h-px flex-1 transition-colors ${i < idx ? "bg-accent" : "bg-border"}`}
              />
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}

const TILE_STYLE: Record<string, string> = {
  kunafa: "from-[#d39c54] to-[#b9772a] text-[#1c1733]",
  baklava: "from-[#6d5fb3] to-[#3a3360] text-white",
  gelato: "from-[#4b4380] to-[#2a2450] text-white",
};

/** Coloured initial tile — a quick visual anchor for each line in the cart. */
function ProductTile({ category, name }: { category: string; name: string }) {
  const style = TILE_STYLE[category.toLowerCase()] ?? TILE_STYLE.kunafa;
  return (
    <span
      aria-hidden="true"
      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br font-serif text-xl font-semibold shadow-soft ${style}`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/** "Add ₹X more for free delivery" progress, driven by the store's delivery settings. */
function FreeDeliveryBar({
  subtotal,
  settings,
  deliveryType,
}: {
  subtotal: number;
  settings: StoreSettings;
  deliveryType: "delivery" | "pickup";
}) {
  const goal = settings.free_delivery_above;
  if (deliveryType === "pickup" || goal <= 0 || settings.delivery_fee_flat <= 0) return null;
  const unlocked = subtotal >= goal;
  const pct = Math.min(100, Math.round((subtotal / goal) * 100));
  return (
    <div
      className={`mb-4 rounded-2xl border px-4 py-3 ${
        unlocked ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-card/60"
      }`}
    >
      <p className="flex items-center gap-2 text-sm text-foreground">
        <Truck
          className={`h-4 w-4 shrink-0 ${unlocked ? "text-emerald-400" : "text-accent"}`}
          aria-hidden="true"
        />
        {unlocked ? (
          <span className="font-medium">You've unlocked free delivery</span>
        ) : (
          <span>
            Add <strong className="font-semibold tabular-nums">{formatINR(goal - subtotal)}</strong> more for free
            delivery
          </span>
        )}
      </p>
      <div
        role="progressbar"
        aria-label="Progress to free delivery"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-black/30"
      >
        <div
          style={{ width: `${pct}%` }}
          className={`h-full rounded-full transition-all duration-500 ${
            unlocked ? "bg-emerald-400" : "bg-gradient-gold"
          }`}
        />
      </div>
    </div>
  );
}

function SummaryCard({
  id,
  heading,
  subtotal,
  deliveryFee,
  tax,
  total,
  pickup,
  pieces,
}: {
  id: string;
  heading: string;
  subtotal: number;
  deliveryFee: number;
  tax?: TaxPreview;
  total: number;
  pickup?: boolean;
  pieces?: number;
}) {
  return (
    <section aria-labelledby={id}>
      <SectionHeading id={id}>{heading}</SectionHeading>
      <dl className="space-y-2.5 rounded-2xl border border-border bg-card/60 p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">
            Subtotal
            {pieces ? <span className="text-muted-foreground/70"> · {pieces} {pieces === 1 ? "piece" : "pieces"}</span> : null}
          </dt>
          <dd className="tabular-nums text-foreground">{formatINR(subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{pickup ? "Pickup" : "Delivery"}</dt>
          <dd className={`tabular-nums ${deliveryFee > 0 ? "text-foreground" : "font-medium text-emerald-400"}`}>
            {deliveryFee > 0 ? formatINR(deliveryFee) : "Free"}
          </dd>
        </div>
        {tax && tax.tax > 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">
              {tax.label} ({tax.rate}%)
              {tax.inclusive ? <span className="text-muted-foreground/70"> · included</span> : null}
            </dt>
            <dd className="tabular-nums text-foreground">{formatINR(tax.tax)}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-4 border-t border-dashed border-border pt-3">
          <dt className="text-base font-semibold text-foreground">Total</dt>
          <dd className="font-serif text-2xl tabular-nums text-foreground">{formatINR(total)}</dd>
        </div>
      </dl>
    </section>
  );
}

function LineRow({ line }: { line: EnquiryLine }) {
  const { setQty, setNote, removeLine } = useEnquiry();
  const [noteOpen, setNoteOpen] = React.useState(line.note.trim() !== "");
  const label = line.variant ? `${line.name}, ${line.variant}` : line.name;
  const meta = [line.category, line.variant].filter(Boolean).join(" · ");

  return (
    <li className="rounded-2xl border border-border bg-card/60 p-4">
      <div className="flex gap-3.5">
        <ProductTile category={line.category} name={line.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 font-serif text-base leading-snug text-foreground">{line.name}</p>
            {line.unitPrice != null && (
              <p className="shrink-0 text-base font-semibold tabular-nums text-foreground">
                {formatINR(line.unitPrice * line.qty)}
              </p>
            )}
          </div>
          {meta && <p className="mt-0.5 text-xs capitalize text-muted-foreground">{meta}</p>}
          {line.unitPrice != null && line.qty > 1 && (
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground/80">{formatINR(line.unitPrice)} each</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <QtyStepper value={line.qty} label={label} onChange={(n) => setQty(line.key, n)} />
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setNoteOpen((v) => !v)}
            aria-expanded={noteOpen}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            {line.note.trim() ? "Edit note" : "Add note"}
          </button>
          <button
            type="button"
            onClick={() => removeLine(line.key)}
            aria-label={`Remove ${label}`}
            title="Remove"
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {noteOpen && (
        <input
          type="text"
          value={line.note}
          onChange={(e) => setNote(line.key, e.target.value)}
          maxLength={MAX_ITEM_NOTE}
          placeholder="e.g. less sugar, no nuts"
          aria-label={`Note for ${label}`}
          className="mt-2 w-full rounded-xl border border-border/80 bg-black/20 px-3.5 py-2.5 text-base text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none sm:text-sm"
        />
      )}
    </li>
  );
}

const METHOD_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  upi: Smartphone,
  card: CreditCard,
  cash: Banknote,
};

export function EnquiryDrawer() {
  const router = useRouter();
  const { user } = useAuth();
  const { open, setOpen, lines, totalQty, estimate, clearAll } = useEnquiry();

  const [step, setStep] = React.useState<Step>("cart");
  const [confirmClear, setConfirmClear] = React.useState(false);
  const settings = useStoreSettings();

  // Checkout / customer data
  const [customerData, setCustomerData] = React.useState<OrderCustomerData>({
    customerId: null,
    name: "",
    phone: "",
    email: null,
    deliveryType: "delivery",
    addressSnapshot: null,
  });
  const [orderNotes, setOrderNotes] = React.useState("");

  // Payment
  const [payOptions, setPayOptions] = React.useState<PaymentOption[]>([]);
  const [paymentMode, setPaymentMode] = React.useState<"demo" | "live">("demo");
  const [payUnavailable, setPayUnavailable] = React.useState<string | null>(null);
  const [payMessage, setPayMessage] = React.useState<string | null>(null);
  const [method, setMethod] = React.useState<PaymentMethod>("upi");
  const [simulateFail, setSimulateFail] = React.useState(false);
  const [paying, setPaying] = React.useState(false);
  const [priceWarning, setPriceWarning] = React.useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = React.useState<string | null>(null);

  // Confirmation
  const [placed, setPlaced] = React.useState<PlacedOrder | null>(null);

  // Ask-a-question
  const [showQuestion, setShowQuestion] = React.useState(false);
  const [question, setQuestion] = React.useState("");

  // Re-check every 30s so a cutoff that passes while the drawer is open takes effect without a reload.
  const [clock, setClock] = React.useState(0);
  React.useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setClock((c) => c + 1), 30000);
    return () => window.clearInterval(t);
  }, [open]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const store = React.useMemo(() => isStoreClosed(settings), [settings, clock]);
  const { deliveryFee, tax, total: grandTotal } = previewTotals(estimate, customerData.deliveryType, settings);
  const hasLines = lines.length > 0;

  // Settings stay live in the background (see useStoreSettings); refresh once more as the cart opens.
  React.useEffect(() => {
    if (open) void refreshStoreSettings();
  }, [open]);

  // Reset transient state when the drawer closes.
  React.useEffect(() => {
    if (!open) {
      setConfirmClear(false);
      setShowQuestion(false);
      setStep("cart");
      setPendingOrderId(null);
      setPriceWarning(null);
      setPlaced(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (!confirmClear) return;
    const t = window.setTimeout(() => setConfirmClear(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmClear]);

  // If the cart empties while mid-checkout, fall back to the cart step.
  React.useEffect(() => {
    if (!hasLines && (step === "checkout" || step === "payment")) {
      setStep("cart");
      setPendingOrderId(null);
    }
  }, [hasLines, step]);

  const goToLogin = () => {
    const redirect =
      typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
    setOpen(false);
    router.navigate({ to: "/account/login", search: { redirect } });
  };

  const beginCheckout = () => {
    if (!hasLines) {
      toast.error("Add at least one item from the menu.");
      return;
    }
    if (store.closed) {
      toast.error(store.reason || "We are not accepting orders right now.");
      return;
    }
    if (!user) {
      goToLogin();
      return;
    }
    setStep("checkout");
  };

  const beginPayment = async () => {
    if (customerData.deliveryType === "delivery") {
      const snap = customerData.addressSnapshot;
      if (!snap || (!snap.flat && !snap.street)) {
        toast.error("Please select or add a delivery address.");
        return;
      }
    }
    const res = await startPayment();
    setPaymentMode(res.mode);
    setPayOptions(res.options);
    setPayUnavailable(res.available ? null : res.message ?? "Online payment is unavailable.");
    setPayMessage(res.mode === "live" && res.available ? res.message ?? null : null);
    // Make sure the selected method is one that is actually offered.
    if (res.options.length > 0 && !res.options.some((o) => o.id === method)) {
      setMethod(res.options[0].id);
    }
    setStep("payment");
  };

  const createPendingOrder = async () => {
    const items = lines.map((l) => ({
      category: l.category,
      name: l.name,
      variant_id: l.variantId,
      variant: l.variant,
      qty: l.qty,
      note: l.note,
    }));

    const { data, error } = await supabase.rpc("place_order", {
      p_items: items,
      p_delivery_type: customerData.deliveryType,
      p_address_id:
        customerData.deliveryType === "delivery" ? (customerData.addressSnapshot?.id ?? null) : null,
      p_payment_method: method,
      p_notes: orderNotes,
    });
    if (error) throw error;
    return data as {
      order_id: string;
      order_number: string;
      subtotal_inr: number;
      delivery_fee_inr: number;
      tax_inr?: number;
      tax_label?: string | null;
      tax_inclusive?: boolean;
      total_inr: number;
      payment_mode: "demo" | "live";
    };
  };

  const handlePay = async () => {
    if (payUnavailable) {
      toast.error(payUnavailable);
      return;
    }
    setPaying(true);
    try {
      // Pay at handover: no payment step. The server creates the order as "Order received".
      if (method === "cash") {
        if (pendingOrderId) {
          // The customer started an online payment, then switched: drop the unfinished order.
          await supabase.rpc("cancel_my_pending_order", { p_order_id: pendingOrderId });
          setPendingOrderId(null);
        }
        const order = await createPendingOrder();
        setPlaced({
          order_number: order.order_number,
          subtotal_inr: order.subtotal_inr,
          delivery_fee_inr: order.delivery_fee_inr,
          tax_inr: order.tax_inr ?? 0,
          tax_label: order.tax_label ?? null,
          tax_inclusive: order.tax_inclusive ?? false,
          total_inr: order.total_inr,
          delivery_type: customerData.deliveryType,
          payment_method: "cash",
          payment_mode: order.payment_mode,
          lines,
        });
        clearAll();
        setOrderNotes("");
        setStep("done");
        toast.success("Order placed!");
        return;
      }

      let orderId = pendingOrderId;
      let snapshot = null as Awaited<ReturnType<typeof createPendingOrder>> | null;

      if (!orderId) {
        snapshot = await createPendingOrder();
        orderId = snapshot.order_id;
        setPendingOrderId(orderId);

        // Prices are always recalculated by the server. If they differ, warn before charging.
        if (Math.abs(snapshot.subtotal_inr - estimate) > 0.5 || Math.abs(snapshot.total_inr - grandTotal) > 0.5) {
          setPriceWarning(
            `The kitchen updated your prices. Your new total is ${formatINR(
              snapshot.total_inr,
            )} (was ${formatINR(grandTotal)}). Press Pay again to confirm.`,
          );
          setPaying(false);
          return;
        }
      }

      const result = await confirmPayment(orderId, method, !simulateFail);

      if (result.status === "new") {
        setPlaced({
          order_number: snapshot?.order_number ?? "",
          subtotal_inr: snapshot?.subtotal_inr ?? estimate,
          delivery_fee_inr: snapshot?.delivery_fee_inr ?? deliveryFee,
          tax_inr: snapshot?.tax_inr ?? tax.tax,
          tax_label: snapshot?.tax_label ?? tax.label,
          tax_inclusive: snapshot?.tax_inclusive ?? tax.inclusive,
          total_inr: snapshot?.total_inr ?? grandTotal,
          delivery_type: customerData.deliveryType,
          payment_method: method,
          payment_mode: paymentMode,
          lines,
        });
        clearAll();
        setPendingOrderId(null);
        setOrderNotes("");
        setStep("done");
        toast.success("Order placed!");
      } else {
        toast.error("Payment was not completed. Your cart is safe — you can try again.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Something went wrong. Please try again.");
    } finally {
      setPaying(false);
    }
  };

  const sendQuestion = async () => {
    if (question.trim() === "") {
      toast.error("Type your question so we know how to help.");
      return;
    }
    try {
      await supabase.from("enquiries").insert({
        mode: "enquiry",
        question: question.trim(),
        lines: lines,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      });
    } catch {
      /* non-blocking */
    }
    const url = whatsappUrl(buildMessage(lines, { mode: "enquiry", question: question.trim() }));
    window.open(url, "_blank", "noopener,noreferrer");
    setQuestion("");
    setShowQuestion(false);
    setOpen(false);
  };

  const headerCopy: Record<Step, { eyebrow: string; title: string; desc: string }> = {
    cart: {
      eyebrow: "Your cart",
      title: "Review your order",
      desc: "Adjust quantities, add notes, then check out in a couple of taps.",
    },
    checkout: {
      eyebrow: "Details",
      title: "Delivery details",
      desc: "Confirm your contact and where this should go.",
    },
    payment: {
      eyebrow: "Payment",
      title: "How would you like to pay?",
      desc: "Pay online now, or pay when your order is handed over.",
    },
    done: {
      eyebrow: "Order placed",
      title: "Thank you!",
      desc: "Your order is confirmed with the kitchen.",
    },
  };

  const copy = headerCopy[step];
  const pickup = customerData.deliveryType === "pickup";
  const contactName = customerData.name || user?.email || "";

  const copyOrderNumber = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Order number copied");
    } catch {
      /* clipboard unavailable — the number is still on screen */
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        showClose={false}
        className="flex h-dvh w-full flex-col gap-0 border-l border-border bg-background p-0 text-foreground sm:max-w-md"
      >
        <SheetHeader className="relative shrink-0 space-y-0 border-b border-border bg-indigo-deep px-5 pb-4 pt-5 pr-16 text-left sm:px-6">
          <div className="flex min-h-8 items-center gap-2">
            {step !== "cart" && step !== "done" ? (
              <button
                type="button"
                onClick={() => setStep(step === "payment" ? "checkout" : "cart")}
                className="-ml-2 inline-flex h-8 items-center gap-1 rounded-full px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </button>
            ) : (
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">{copy.eyebrow}</p>
            )}
          </div>
          <SheetTitle className="mt-1 font-serif text-2xl font-normal leading-tight text-foreground">
            {copy.title}
          </SheetTitle>
          <SheetDescription className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {copy.desc}
          </SheetDescription>
          {step !== "done" && <Stepper step={step} />}
          <SheetClose
            aria-label="Close cart"
            className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </SheetClose>
        </SheetHeader>

        <div className="enq-scroll flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-6 sm:px-6 [scrollbar-gutter:stable_both-edges]">
          {/* ─────────────── CART ─────────────── */}
          {step === "cart" && (
            <>
              {store.closed && (
                <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground">
                  <strong className="font-semibold">We're closed right now.</strong>{" "}
                  {store.reason || "Please check back soon."}
                </div>
              )}

              <section aria-labelledby="enq-items">
                <SectionHeading
                  id="enq-items"
                  aside={
                    hasLines ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirmClear) {
                            clearAll();
                            setConfirmClear(false);
                            setPendingOrderId(null);
                          } else setConfirmClear(true);
                        }}
                        className={`-mr-3 min-h-11 rounded-full px-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          confirmClear ? "font-semibold text-destructive" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {confirmClear ? "Tap again to clear" : "Clear all"}
                      </button>
                    ) : undefined
                  }
                >
                  Your items
                  {hasLines && (
                    <span className="ml-2 font-medium normal-case tracking-normal text-muted-foreground">
                      {totalQty} {totalQty === 1 ? "piece" : "pieces"}
                    </span>
                  )}
                </SectionHeading>

                {!hasLines ? (
                  <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card/60 text-accent">
                      <ShoppingBag className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <p className="mt-4 font-serif text-lg text-foreground">Your cart is empty</p>
                    <p className="mx-auto mt-1 max-w-[30ch] text-sm leading-relaxed text-muted-foreground">
                      Add something sweet from the menu and it will wait for you here.
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-3">
                      {(
                        [
                          { to: "/kunafa", label: "Browse Kunafa" },
                          { to: "/baklava", label: "Browse Baklava" },
                        ] as const
                      ).map((l) => (
                        <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className={quietButton}>
                          {l.label} <ChevronRight className="h-4 w-4 text-accent" aria-hidden="true" />
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <FreeDeliveryBar subtotal={estimate} settings={settings} deliveryType={customerData.deliveryType} />
                    <ul className="space-y-3">
                      {lines.map((l) => (
                        <LineRow key={l.key} line={l} />
                      ))}
                    </ul>
                  </>
                )}
              </section>

              {hasLines && (
                <>
                  <SummaryCard
                    id="enq-summary"
                    heading="Summary"
                    subtotal={estimate}
                    deliveryFee={deliveryFee}
                    tax={tax}
                    total={grandTotal}
                    pickup={pickup}
                  />
                  <p className="-mt-3 text-xs leading-relaxed text-muted-foreground">
                    Final totals are calculated by our kitchen at checkout.
                  </p>
                </>
              )}

              {showQuestion ? (
                <section aria-labelledby="enq-question">
                  <SectionHeading id="enq-question">Ask a question</SectionHeading>
                  <label htmlFor="enq-question-box" className="sr-only">
                    Your question
                  </label>
                  <textarea
                    id="enq-question-box"
                    rows={4}
                    maxLength={MAX_NOTES}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask about ingredients, allergens, gifting, bulk orders, delivery…"
                    className={`${field} resize-y`}
                  />
                  <div className="mt-2 text-right text-xs tabular-nums text-muted-foreground">
                    {question.length}/{MAX_NOTES}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button type="button" onClick={sendQuestion} className={quietButton}>
                      <MessageCircle className="h-4 w-4 text-accent" aria-hidden="true" />
                      Send on WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowQuestion(false)}
                      className="inline-flex min-h-11 items-center rounded-full px-4 text-sm text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </section>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowQuestion(true)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm text-accent transition-colors hover:border-accent/60 hover:text-foreground"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  Have a question? Ask us on WhatsApp
                </button>
              )}
            </>
          )}

          {/* ─────────────── CHECKOUT ─────────────── */}
          {step === "checkout" && (
            <>
              <section aria-labelledby="enq-contact">
                <SectionHeading
                  id="enq-contact"
                  aside={
                    <Link
                      to="/account/profile"
                      onClick={() => setOpen(false)}
                      className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      Edit
                    </Link>
                  }
                >
                  Contact
                </SectionHeading>
                <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-card/60 p-4">
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-gold font-serif text-lg font-semibold text-gold-foreground"
                  >
                    {(contactName || "?").charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-medium text-foreground">{contactName}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {customerData.phone || "No phone on file — please add one in your profile."}
                      </span>
                    </p>
                  </div>
                </div>
              </section>

              <section aria-labelledby="enq-fulfilment">
                <SectionHeading id="enq-fulfilment">Delivery or pickup</SectionHeading>
                <CustomerOrderAddress onDataChange={setCustomerData} />
              </section>

              <section aria-labelledby="enq-notes">
                <SectionHeading id="enq-notes">Order note</SectionHeading>
                <label htmlFor="enq-order-notes" className="sr-only">
                  Order note
                </label>
                <textarea
                  id="enq-order-notes"
                  rows={3}
                  maxLength={MAX_NOTES}
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Anything we should know? (optional)"
                  className={`${field} resize-y`}
                />
              </section>

              <SummaryCard
                id="enq-checkout-summary"
                heading="Order summary"
                subtotal={estimate}
                deliveryFee={deliveryFee}
                tax={tax}
                total={grandTotal}
                pickup={pickup}
                pieces={totalQty}
              />
            </>
          )}

          {/* ─────────────── PAYMENT ─────────────── */}
          {step === "payment" && (
            <>
              {method !== "cash" && paymentMode === "demo" && (
                <div className="flex items-start gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-xs leading-relaxed text-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                  <span>{DEMO_BANNER}</span>
                </div>
              )}
              {payMessage && payMessage !== DEMO_BANNER && (
                <div role="status" className="rounded-xl border border-border bg-card/60 px-4 py-3 text-xs leading-relaxed text-foreground">
                  {payMessage}
                </div>
              )}

              {payUnavailable ? (
                <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground">
                  {payUnavailable}
                </div>
              ) : (
                <section aria-labelledby="enq-method">
                  <SectionHeading id="enq-method">Payment method</SectionHeading>
                  <div role="radiogroup" aria-labelledby="enq-method" className="space-y-2.5">
                    {payOptions.map((o) => {
                      const selected = method === o.id;
                      const Icon = METHOD_ICON[o.id] ?? CreditCard;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setMethod(o.id)}
                          className={`flex w-full items-center gap-3.5 rounded-2xl border p-4 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                            selected
                              ? "border-accent bg-accent/10 shadow-soft"
                              : "border-border bg-card/60 hover:border-accent/50"
                          }`}
                        >
                          <span
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                              selected ? "bg-accent text-gold-foreground" : "bg-black/25 text-accent"
                            }`}
                          >
                            <Icon className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-foreground">{o.label}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">{o.hint}</span>
                          </span>
                          <span
                            aria-hidden="true"
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                              selected ? "border-accent bg-accent text-gold-foreground" : "border-border"
                            }`}
                          >
                            {selected && <Check className="h-3 w-3" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {paymentMode === "demo" && method !== "cash" && (
                    <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border/80 px-4 py-3 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={simulateFail}
                        onChange={(e) => setSimulateFail(e.target.checked)}
                        className="h-4 w-4 accent-destructive"
                      />
                      Simulate a failed payment (demo only)
                    </label>
                  )}
                </section>
              )}

              <SummaryCard
                id="enq-pay-total"
                heading="Amount due"
                subtotal={estimate}
                deliveryFee={deliveryFee}
                tax={tax}
                total={grandTotal}
                pickup={pickup}
                pieces={totalQty}
              />

              {priceWarning && (
                <div role="status" className="rounded-xl border border-accent/50 bg-accent/10 px-4 py-3 text-sm text-foreground">
                  {priceWarning}
                </div>
              )}
            </>
          )}

          {/* ─────────────── DONE ─────────────── */}
          {step === "done" && placed && (
            <>
              <div className="rounded-3xl border border-border bg-card/60 px-6 py-8 text-center">
                <span className="enq-pop mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 ring-8 ring-emerald-500/10">
                  <Check className="h-8 w-8" aria-hidden="true" />
                </span>
                {placed.order_number && (
                  <>
                    <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Order number
                    </p>
                    <button
                      type="button"
                      onClick={() => copyOrderNumber(placed.order_number)}
                      aria-label={`Copy order number ${placed.order_number}`}
                      className="mt-1.5 inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-black/20 px-4 font-mono text-lg font-bold text-foreground transition-colors hover:border-accent/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {placed.order_number}
                      <Copy className="h-4 w-4 text-accent" aria-hidden="true" />
                    </button>
                  </>
                )}
                <p className="mx-auto mt-4 max-w-[32ch] text-sm leading-relaxed text-muted-foreground">
                  {placed.delivery_type === "pickup"
                    ? "Self pickup at Mithara Kitchen — we'll message you when it's ready."
                    : "We'll be in touch to confirm your delivery window."}
                </p>
                {placed.payment_method === "cash" && (
                  <p className="mx-auto mt-3 max-w-[32ch] rounded-xl bg-accent/10 px-4 py-2.5 text-sm font-medium text-foreground">
                    Please keep {formatINR(placed.total_inr)} ready — pay by cash or UPI at handover.
                  </p>
                )}
                {placed.payment_mode === "demo" && placed.payment_method !== "cash" && (
                  <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-accent">
                    Demo payment
                  </span>
                )}
              </div>

              <section aria-labelledby="enq-done-items">
                <SectionHeading id="enq-done-items">Your order</SectionHeading>
                <div className="rounded-2xl border border-border bg-card/60 p-4">
                  <ul className="divide-y divide-border/70">
                    {placed.lines.map((l) => (
                      <li key={l.key} className="flex items-baseline justify-between gap-3 py-2.5 text-sm first:pt-0">
                        <span className="min-w-0 text-foreground">
                          {l.name}
                          {l.variant ? <span className="text-muted-foreground"> · {l.variant}</span> : null}
                          <span className="text-muted-foreground"> × {l.qty}</span>
                        </span>
                        {l.unitPrice != null && (
                          <span className="shrink-0 tabular-nums text-foreground">{formatINR(l.unitPrice * l.qty)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <dl className="mt-1 space-y-2 border-t border-dashed border-border pt-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Subtotal</dt>
                      <dd className="tabular-nums">{formatINR(placed.subtotal_inr)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{placed.delivery_type === "pickup" ? "Pickup" : "Delivery"}</dt>
                      <dd className={`tabular-nums ${placed.delivery_fee_inr > 0 ? "" : "font-medium text-emerald-400"}`}>
                        {placed.delivery_fee_inr > 0 ? formatINR(placed.delivery_fee_inr) : "Free"}
                      </dd>
                    </div>
                    {placed.tax_inr > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">
                          {placed.tax_label || "Tax"}
                          {placed.tax_inclusive ? <span className="text-muted-foreground/70"> · included</span> : null}
                        </dt>
                        <dd className="tabular-nums">{formatINR(placed.tax_inr)}</dd>
                      </div>
                    )}
                    <div className="flex items-baseline justify-between border-t border-dashed border-border pt-3 text-base font-semibold">
                      <dt>Total</dt>
                      <dd className="font-serif text-2xl tabular-nums">{formatINR(placed.total_inr)}</dd>
                    </div>
                    <div className="flex justify-between pt-1 text-xs uppercase tracking-wide text-muted-foreground">
                      <dt>Payment</dt>
                      <dd>
                        {placed.payment_method === "cash"
                          ? "Pay at handover"
                          : `Paid online · ${placed.payment_method}${placed.payment_mode === "demo" ? " (demo)" : ""}`}
                      </dd>
                    </div>
                  </dl>
                </div>
              </section>

              <Link to="/account/profile" onClick={() => setOpen(false)} className={quietButton + " w-full"}>
                View in My Dashboard
                <ChevronRight className="h-4 w-4 text-accent" aria-hidden="true" />
              </Link>
            </>
          )}
        </div>

        {/* Sticky footer */}
        <div className="shrink-0 border-t border-border bg-indigo-deep px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-16px_28px_-18px_rgba(0,0,0,0.7)] sm:px-6">
          {step === "cart" && (
            <>
              {hasLines && (
                <div className="mb-3 flex items-baseline justify-between gap-4">
                  <span className="text-sm text-muted-foreground">
                    Total · {totalQty} {totalQty === 1 ? "piece" : "pieces"}
                  </span>
                  <span className="font-serif text-2xl tabular-nums text-foreground">{formatINR(grandTotal)}</span>
                </div>
              )}
              <button
                type="button"
                onClick={beginCheckout}
                disabled={!hasLines || store.closed}
                className={primaryButton}
              >
                <ShoppingBag className="h-5 w-5" aria-hidden="true" />
                {store.closed ? "Closed for orders" : !user ? "Sign in to place order" : "Checkout"}
              </button>
            </>
          )}

          {step === "checkout" && (
            <>
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-serif text-2xl tabular-nums text-foreground">{formatINR(grandTotal)}</span>
              </div>
              <button type="button" onClick={beginPayment} disabled={!hasLines} className={primaryButton}>
                Continue to payment
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </>
          )}

          {step === "payment" && (
            <>
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <span className="text-sm text-muted-foreground">Amount due</span>
                <span className="font-serif text-2xl tabular-nums text-foreground">{formatINR(grandTotal)}</span>
              </div>
              <button
                type="button"
                onClick={handlePay}
                disabled={paying || !!payUnavailable}
                className={primaryButton}
              >
                {paying ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : method === "cash" ? (
                  <ShoppingBag className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                )}
                {paying
                  ? "Processing…"
                  : method === "cash"
                    ? `Place order · ${formatINR(grandTotal)}`
                    : `Pay ${formatINR(grandTotal)}`}
              </button>
              {method !== "cash" && paymentMode === "demo" && (
                <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">{DEMO_BANNER}</p>
              )}
              {method === "cash" && (
                <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
                  Nothing is charged now. Pay by cash or UPI when your order is handed over.
                </p>
              )}
            </>
          )}

          {step === "done" && (
            <button type="button" onClick={() => setOpen(false)} className={primaryButton}>
              Continue browsing
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Floating pill, shown only while the cart has items and the drawer is closed. */
export function EnquiryFloatingButton() {
  const { hydrated, totalQty, estimate, open, setOpen } = useEnquiry();
  if (!hydrated || totalQty === 0 || open) return null;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={`Open cart, ${totalQty} ${totalQty === 1 ? "item" : "items"}`}
      className="enq-fade fixed bottom-4 left-4 z-40 mb-[env(safe-area-inset-bottom)] inline-flex min-h-12 items-center gap-2.5 rounded-full bg-gradient-gold px-5 py-3 text-sm font-semibold text-gold-foreground shadow-elegant focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#282345] md:left-1/2 md:-translate-x-1/2"
    >
      <ShoppingBag className="h-5 w-5" aria-hidden="true" />
      <span>
        View cart · {totalQty}
        {estimate > 0 && <span className="font-normal opacity-80"> · {formatINR(estimate)}</span>}
      </span>
    </button>
  );
}

/** Header icon with a count badge. Always available so the cart is reachable from any page. */
export function EnquiryHeaderButton() {
  const { hydrated, totalQty, setOpen } = useEnquiry();
  const count = hydrated ? totalQty : 0;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={count > 0 ? `Open cart, ${count} ${count === 1 ? "item" : "items"}` : "Open cart"}
      className="relative inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border/80 bg-[#302844] px-2.5 text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent md:rounded-full md:px-4"
    >
      <ShoppingBag className="h-5 w-5" aria-hidden="true" />
      <span className="hidden text-sm md:inline">Cart</span>
      {count > 0 && (
        <span
          key={count}
          aria-hidden="true"
          className="enq-pop absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-gold px-1 text-[11px] font-bold text-gold-foreground"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
