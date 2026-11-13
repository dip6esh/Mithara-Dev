import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { MAX_QTY } from "../lib/enquiry";

/**
 * − [ 2 ] + control. The number is typeable (for bigger orders) and 16px so iOS never zooms in.
 * `min={0}` lets "−" at 1 remove the item (menu cards); `min={1}` keeps it at 1 (the drawer,
 * which has its own remove button).
 */
export function QtyStepper({
  value,
  onChange,
  label,
  min = 1,
}: {
  value: number;
  onChange: (next: number) => void;
  label: string;
  min?: 0 | 1;
}) {
  const [text, setText] = React.useState(String(value));
  React.useEffect(() => setText(String(value)), [value]);

  const commit = () => {
    const n = parseInt(text, 10);
    if (!Number.isFinite(n) || n < 1) {
      setText(String(value)); // ignore empty / zero, never delete by typing
      return;
    }
    const next = Math.min(MAX_QTY, n);
    setText(String(next));
    if (next !== value) onChange(next);
  };

  const btn =
    "inline-flex h-11 w-11 items-center justify-center text-accent transition-colors hover:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div
      role="group"
      aria-label={`Quantity for ${label}`}
      className="inline-flex items-center overflow-hidden rounded-full border border-accent/40 bg-[#1f1a38]"
    >
      <button
        type="button"
        className={btn}
        aria-label={min === 0 && value <= 1 ? `Remove ${label}` : `Decrease quantity of ${label}`}
        disabled={min === 1 && value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={3}
        value={text}
        aria-label={`Quantity of ${label}`}
        onChange={(e) => setText(e.target.value.replace(/\D/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="h-11 w-12 bg-transparent text-center text-base font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      <button
        type="button"
        className={btn}
        aria-label={`Increase quantity of ${label}`}
        disabled={value >= MAX_QTY}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
