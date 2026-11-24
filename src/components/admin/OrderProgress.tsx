import { Check } from "lucide-react";
import type { Order } from "../../lib/types";

type StepState = "done" | "current" | "todo";

/**
 * Three-step strip shown on every order:  Received  →  Paid  →  Handed over
 * It answers "where is this order, and what is the next thing to do?" at a glance.
 * Cancelled orders show a single red note instead.
 */
export function OrderProgress({ order }: { order: Order }) {
  if (order.status === "cancelled") {
    return (
      <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300">
        This order was cancelled
      </div>
    );
  }

  const received = order.status !== "pending_payment";
  const paid = order.payment_status === "paid";
  const handed = order.status === "completed";

  const steps: { label: string; state: StepState; hint?: string }[] = [
    {
      label: "Received",
      state: received ? "done" : "todo",
      hint: received ? undefined : "Waiting for customer",
    },
    {
      label: "Paid",
      state: paid ? "done" : "current",
      hint: paid ? undefined : received ? "To collect" : "Customer paying",
    },
    {
      label: "Handed over",
      state: handed ? "done" : received && !handed ? "current" : "todo",
    },
  ];

  // Only one step is "current": the first one that is not done.
  const firstOpen = steps.findIndex((s) => s.state !== "done");
  const view = steps.map((s, i) => ({
    ...s,
    state: (s.state === "done" ? "done" : i === firstOpen ? "current" : "todo") as StepState,
  }));

  return (
    <ol className="mb-4 flex items-start" aria-label="Order progress">
      {view.map((s, i) => (
        <li key={s.label} className="flex min-w-0 flex-1 items-start">
          <div className="flex flex-col items-center text-center">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold ${
                s.state === "done"
                  ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                  : s.state === "current"
                    ? "border-amber-500/60 bg-amber-500/20 text-amber-300"
                    : "border-neutral-700 bg-neutral-900 text-neutral-500"
              }`}
            >
              {s.state === "done" ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span
              className={`mt-1.5 text-[11px] font-semibold ${
                s.state === "todo" ? "text-neutral-500" : "text-neutral-200"
              }`}
            >
              {s.label}
            </span>
            {s.hint && s.state !== "done" && <span className="text-[10px] text-neutral-500">{s.hint}</span>}
          </div>
          {i < view.length - 1 && (
            <span
              className={`mx-2 mt-3.5 h-px flex-1 ${s.state === "done" ? "bg-emerald-500/40" : "bg-neutral-700"}`}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
