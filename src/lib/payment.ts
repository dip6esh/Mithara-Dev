/**
 * Payment module — one seam for the whole checkout flow.
 *
 * Today only "demo" mode exists for online payment: the customer picks a method, a mock UI
 * pretends to take the payment, and the order is confirmed (and marked paid) via the server-side
 * `confirm_demo_payment` function. No real card, UPI or bank details are ever collected or stored.
 * "Pay at handover" (cash) is real: it needs no gateway and skips this module entirely.
 *
 * To add a real gateway later (e.g. Razorpay) implement the `live` branch of
 * `startPayment`/`confirmPayment` and set the `payment_mode` site setting to "live".
 * Nothing else in the app needs to change.
 */
import { supabase } from "./supabase";
import { fetchStoreSettings } from "./settings";
import type { PaymentMethod, PaymentMode } from "./types";

export const DEMO_BANNER = "Demo mode: no real payment is taken.";

export type PaymentOption = { id: PaymentMethod; label: string; hint: string };

export type StartPaymentResult = {
  mode: PaymentMode;
  /** false when the selected mode has no working gateway (live without a gateway). */
  available: boolean;
  options: PaymentOption[];
  message?: string;
};

const ONLINE_OPTIONS: PaymentOption[] = [
  { id: "upi", label: "Pay online · UPI", hint: "Pay now by any UPI app" },
  { id: "card", label: "Pay online · Card", hint: "Credit or debit card" },
];

/** Always available: no gateway needed. The kitchen records cash/UPI when it hands the order over. */
const HANDOVER_OPTION: PaymentOption = {
  id: "cash",
  label: "Pay at handover",
  hint: "Cash or UPI when your order arrives",
};

const DEMO_OPTIONS: PaymentOption[] = [...ONLINE_OPTIONS, HANDOVER_OPTION];

/**
 * Begins payment for a freshly created (pending) order.
 * In demo mode this simply returns the available methods and a banner.
 */
export async function startPayment(): Promise<StartPaymentResult> {
  const settings = await fetchStoreSettings();

  if (settings.payment_mode === "live") {
    // No real gateway yet: online options are withheld, pay-at-handover still works.
    // When Razorpay is added, return ONLINE_OPTIONS here as well.
    return {
      mode: "live",
      available: true,
      options: [HANDOVER_OPTION],
      message: "Online payment is unavailable right now. You can pay at handover.",
    };
  }

  return { mode: "demo", available: true, options: DEMO_OPTIONS, message: DEMO_BANNER };
}

/**
 * Confirms a demo payment for the signed-in customer's own pending order.
 * `success = false` simulates a failed payment and leaves the order pending.
 */
export async function confirmPayment(
  orderId: string,
  method: PaymentMethod,
  success: boolean,
): Promise<{ status: string; payment_status: string }> {
  const { data, error } = await supabase.rpc("confirm_demo_payment", {
    p_order_id: orderId,
    p_success: success,
    p_method: method === "upi" || method === "card" ? method : null,
  });
  if (error) throw error;
  return data as { status: string; payment_status: string };
}

/** Payment methods offered by the demo module. */
export const demoPaymentOptions = DEMO_OPTIONS;
export type { PaymentMode, PaymentMethod };
