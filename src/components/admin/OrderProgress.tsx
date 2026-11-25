import { Check } from "lucide-react";
import type { Order } from "../../lib/types";

type StepState = "done" | "current" | "todo";

/**
 * Four-step tracker shown on every order:  Received  →  Paid  →  Ready  →  Handed over
 * It answers "where is this order, and what is the next thing to do?" at a glance.
 * Cancelled orders show a single quiet note instead.
 *
 * Layout: four equal columns. The connector lines are drawn from the centre of one dot to the
 * centre of the next, so dots, lines and labels always line up. Only the current step carries
 * the accent colour; finished steps are a calm neutral tick.
 */
export function OrderProgress({ order }: { order: Order }) {
  if (order.status === "cancelled") {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 px-3.5 py-2.5 text-xs font-medium text-neutral-300">
        This order was cancelled
      </div>
    );
  }

  const received = order.status !== "pending_payment";
  const paid = order.payment_status === "paid";
  const handed = order.status === "completed";

  const ready = order.kitchen_status === "ready" || handed;

  // Four milestones, each one thing that is either true or not yet true:
  //   Received -> Paid -> Ready (kitchen has finished) -> Handed over
  // Paid and Ready can happen in either order (e.g. paid online while the kitchen is still baking).
  // The amber marker always sits on the first milestone that is still open, so "Handed over" only
  // lights up once the order is both paid and ready. What to do next is spelled out in the action
  // area under the tracker, so no extra text is squeezed under the step names.
  const steps: { label: string; state: StepState }[] = [
    { label: "Received", state: received ? "done" : "todo" },
    { label: "Paid", state: paid ? "done" : "todo" },
    { label: "Ready", state: ready ? "done" : "todo" },
    { label: "Handed over", state: handed ? "done" : "todo" },
  ];

  // Only one step is "current": the first one that is not done.
  const firstOpen = steps.findIndex((s) => s.state !== "done");
  const view = steps.map((s, i) => ({
    ...s,
    state: (s.state === "done" ? "done" : i === firstOpen ? "current" : "todo") as StepState,
  }));

  return (
    <ol className="grid grid-cols-4" aria-label="Order progress">
      {view.map((s, i) => {
        const prev = view[i - 1];
        return (
          <li
            key={s.label}
            className="relative flex flex-col items-center px-1 text-center"
            aria-current={s.state === "current" ? "step" : undefined}
          >
            {/* Connector from the previous dot to this one (behind the dots) */}
            {prev && (
              <span
                aria-hidden="true"
                className={`absolute top-3.5 right-1/2 h-px w-full -translate-y-1/2 ${
                  prev.state === "done" ? "bg-neutral-500" : "bg-neutral-800"
                }`}
              />
            )}

            <span
              className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${
                s.state === "done"
                  ? "border-neutral-500 bg-neutral-700 text-neutral-100"
                  : s.state === "current"
                    ? "border-amber-400 bg-amber-500 text-gold-foreground"
                    : "border-neutral-700 bg-neutral-900 text-neutral-500"
              }`}
            >
              {s.state === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
            </span>

            <span
              className={`mt-2 text-xs font-medium leading-tight ${
                s.state === "todo" ? "text-neutral-500" : "text-neutral-100"
              }`}
            >
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
