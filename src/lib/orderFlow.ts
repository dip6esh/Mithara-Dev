/**
 * Shared wording + helpers for the simple order flow.
 *   Order received  ->  Handed over   (or Cancelled)
 * Payment is either "paid online" already, or "collect at handover" (cash / UPI).
 */
import { formatINR } from "./enquiry";
import type { Order, OrderStatus, PaidVia } from "./types";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  new: "Order received",
  completed: "Handed over",
  cancelled: "Cancelled",
};

export const PAID_VIA_LABEL: Record<PaidVia, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
};

export type PaymentTone = "paid" | "due" | "waiting";

/** One clear answer to "has this been paid, and if not, what do we collect?" */
export function paymentSummary(o: Order): { label: string; detail: string; tone: PaymentTone } {
  if (o.status === "pending_payment") {
    return { label: "Awaiting payment", detail: "Customer is paying online", tone: "waiting" };
  }
  if (o.payment_status === "paid") {
    if (o.payment_method !== "cash") {
      return {
        label: "Paid online",
        detail: o.paid_via ? PAID_VIA_LABEL[o.paid_via] : "Online",
        tone: "paid",
      };
    }
    // Paid in person: possibly before the order was ready, so the label says how, not when.
    return {
      label: o.paid_via ? `Paid · ${PAID_VIA_LABEL[o.paid_via]}` : "Paid at handover",
      detail: "In person",
      tone: "paid",
    };
  }
  return { label: `Collect ${formatINR(o.total_inr)}`, detail: "Pay at handover", tone: "due" };
}

export const PAYMENT_TONE_CLASS: Record<PaymentTone, string> = {
  paid: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  due: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  waiting: "bg-neutral-800 text-neutral-400 border border-dashed border-neutral-600",
};

/** Orders that count towards sales: received or handed over (never abandoned or cancelled ones). */
export const countsAsSale = (o: Pick<Order, "status">) => o.status === "new" || o.status === "completed";
