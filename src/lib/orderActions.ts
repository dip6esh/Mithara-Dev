/**
 * Plain-English "what will happen" text for every admin action that changes an order.
 * The Orders screen shows this in a confirmation box BEFORE anything is changed, so staff
 * never have to guess what an action does to the payment or the invoice.
 */
import { formatINR } from "./enquiry";
import { PAID_VIA_LABEL } from "./orderFlow";
import type { InvoiceSummary } from "./invoice";
import type { Order, PaidVia } from "./types";

export type PendingAction =
  | { kind: "handover_paid"; order: Order }
  | { kind: "collect"; order: Order; via: PaidVia }
  | { kind: "record_payment"; order: Order; via: PaidVia }
  | { kind: "cancel"; order: Order }
  | { kind: "undo_payment"; order: Order }
  | { kind: "restore"; order: Order }
  | { kind: "undo_handover"; order: Order };

export type ActionCopy = {
  title: string;
  intro?: string;
  /** Short bullet points: exactly what changes. */
  effects: string[];
  confirmLabel: string;
  cancelLabel: string;
  tone: "default" | "danger";
};

export function describeAction(a: PendingAction, inv: InvoiceSummary | undefined): ActionCopy {
  const o = a.order;
  const paid = o.payment_status === "paid";
  const invoiceNo = inv?.invoice_number;
  const docWord = (o.tax_inr ?? 0) > 0 ? "a tax bill" : "a bill (no tax)";

  switch (a.kind) {
    case "handover_paid":
      return {
        title: `Mark order ${o.order_number} as handed over?`,
        intro: "The customer has already paid, so there is nothing to collect.",
        effects: [
          "The order moves to “Handed over”.",
          ...(invoiceNo ? [`Invoice ${invoiceNo} stays as it is.`] : []),
          ...(o.kitchen_status !== "ready"
            ? ["Heads up: the kitchen has not marked this order ready yet. Check it is finished before handing it over."]
            : []),
        ],
        confirmLabel: "Yes, handed over",
        cancelLabel: "Not yet",
        tone: "default",
      };

    case "collect": {
      const how = PAID_VIA_LABEL[a.via];
      return {
        title: `Received ${formatINR(o.total_inr)} by ${how.toLowerCase()}?`,
        intro: "Only confirm once the money is in your hand or your account.",
        effects: [
          "The order moves to “Handed over”.",
          `The payment is recorded as ${how}.`,
          `An invoice is created right now (${docWord}). The customer can see it in their account.`,
        ],
        confirmLabel: "Yes, money received",
        cancelLabel: "Go back",
        tone: "default",
      };
    }

    case "record_payment": {
      const how = PAID_VIA_LABEL[a.via];
      return {
        title: `Received ${formatINR(o.total_inr)} by ${how.toLowerCase()}?`,
        intro: "Only confirm once the money is in your hand or your account.",
        effects: [
          `The payment is recorded as ${how}.`,
          "The order stays in “Order received” and stays on the Kitchen board until you hand it over.",
          `An invoice is created right now (${docWord}). The customer can see it in their account.`,
        ],
        confirmLabel: "Yes, money received",
        cancelLabel: "Go back",
        tone: "default",
      };
    }

    case "cancel":
      return {
        title: `Cancel order ${o.order_number}?`,
        intro: o.status === "completed" ? "This order was already handed over." : undefined,
        effects: [
          "The order is marked Cancelled and no longer counts as a sale.",
          paid
            ? invoiceNo
              ? `Invoice ${invoiceNo} is marked Cancelled. It stays on record and is never deleted.`
              : "Its invoice is marked Cancelled. It stays on record and is never deleted."
            : "No invoice has been created yet, so nothing else changes.",
          "Items with a daily stock limit go back into stock if the order was placed today.",
          ...(paid
            ? ["This does not refund anything. If the customer already paid, return their money yourself."]
            : []),
        ],
        confirmLabel: "Yes, cancel order",
        cancelLabel: "Keep order",
        tone: "danger",
      };

    case "undo_payment":
      return {
        title: "Undo this payment?",
        intro: "Use this only if the payment was recorded by mistake.",
        effects: [
          "The order goes back to “to collect”.",
          invoiceNo
            ? `Invoice ${invoiceNo} is marked Cancelled.`
            : "Its invoice is marked Cancelled.",
          "When the payment is recorded again, a new invoice is created with a new number.",
        ],
        confirmLabel: "Yes, undo payment",
        cancelLabel: "Keep payment",
        tone: "danger",
      };

    case "restore":
      return {
        title: `Restore order ${o.order_number}?`,
        effects: [
          "The order goes back to “Order received”.",
          paid
            ? "It is still marked as paid, so a new invoice is created (the cancelled one stays cancelled)."
            : "It still needs to be paid at handover.",
          "Items with a daily stock limit are taken from stock again if the order was placed today.",
        ],
        confirmLabel: "Yes, restore order",
        cancelLabel: "Leave cancelled",
        tone: "default",
      };

    case "undo_handover":
      return {
        title: "Move back to “Order received”?",
        effects: [
          "The order is no longer marked as handed over.",
          paid ? "The payment and invoice stay exactly as they are." : "The payment stays as it is.",
        ],
        confirmLabel: "Yes, move back",
        cancelLabel: "Leave it",
        tone: "default",
      };
  }
}
