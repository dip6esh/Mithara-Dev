import * as React from "react";
import { Plus, ShoppingBag } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { useEnquiry } from "./EnquiryProvider";
import { QtyStepper } from "./QtyStepper";
import { formatINR, makeKey, parsePricing } from "../lib/enquiry";

/**
 * Icon-only "add to enquiry" button for each menu card.
 *
 * It is positioned by the parent (via `className`), so it never changes the card's layout.
 *  - Single-price item, not yet in the list: one tap adds it.
 *  - Once it's in the list, or for pack-size items (6/9/12/18 pc): a tap opens a small popover
 *    where the visitor sets the quantity (for each pack size) and can open the list.
 * A small badge on the icon shows how many pieces of this item are in the list.
 */
export function EnquiryControl({
  name,
  price,
  category,
  className = "",
}: {
  name: string;
  price: string;
  category: string;
  className?: string;
}) {
  const { getQty, addLine, setQty, setOpen } = useEnquiry();
  const pricing = React.useMemo(() => parsePricing(price), [price]);
  const [popOpen, setPopOpen] = React.useState(false);

  const rows = pricing.options.map((o) => {
    const key = makeKey(category, name, o.id);
    return { option: o, key, qty: getQty(key) };
  });
  const total = rows.reduce((s, r) => s + r.qty, 0);
  const quickAdd = !pricing.tiered && total === 0;

  const change = (r: (typeof rows)[number], next: number) => {
    if (next < 1) {
      if (r.qty > 0) setQty(r.key, 0);
      return;
    }
    if (r.qty === 0) {
      addLine({
        category,
        name,
        variantId: r.option.id,
        variant: r.option.label,
        unitPrice: r.option.amount,
      });
      if (next > 1) setQty(r.key, next);
    } else {
      setQty(r.key, next);
    }
  };

  const label =
    total > 0
      ? `${name}: ${total} in your enquiry list. Change quantity`
      : pricing.tiered
        ? `Choose a pack size and add ${name} to enquiry`
        : `Add ${name} to enquiry`;

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    // Clicks/keys must not reach the card, which speaks the item when voice mode is on.
    <div className={className} onClick={stop} onKeyDown={stop}>
      <Popover open={popOpen} onOpenChange={setPopOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            title={total > 0 ? "In your enquiry list" : "Add to enquiry"}
            onClick={(e) => {
              if (!quickAdd) return; // opens the popover
              e.preventDefault(); // stops the popover opening
              const r = rows[0];
              addLine({
                category,
                name,
                variantId: r.option.id,
                variant: r.option.label,
                unitPrice: r.option.amount,
              });
            }}
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-gradient-gold text-gold-foreground shadow-elegant ring-1 ring-black/10 transition-transform duration-200 hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#302844]"
          >
            {total > 0 ? (
              <ShoppingBag className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Plus className="h-5 w-5" aria-hidden="true" />
            )}
            {total > 0 && (
              <span
                key={total}
                aria-hidden="true"
                className="enq-pop absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border border-accent/70 bg-[#1c1733] px-1 text-[11px] font-bold text-accent"
              >
                {total}
              </span>
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent
          side="top"
          align="end"
          sideOffset={8}
          onClick={stop}
          onKeyDown={stop}
          className="w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-accent/30 bg-[#282345] p-4 text-foreground shadow-elegant"
        >
          <p className="font-serif text-lg leading-snug">{name}</p>
          {pricing.tiered && (
            <p className="mt-0.5 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Choose pack size and quantity
            </p>
          )}

          <ul className="mt-3 space-y-3">
            {rows.map((r) => {
              const rowLabel = r.option.label ? `${name}, ${r.option.label}` : name;
              return (
                <li key={r.option.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{r.option.label || "Quantity"}</p>
                    {r.option.amount != null && (
                      <p className="text-xs text-muted-foreground">{formatINR(r.option.amount)}</p>
                    )}
                  </div>
                  <QtyStepper min={0} value={r.qty} label={rowLabel} onChange={(n) => change(r, n)} />
                </li>
              );
            })}
          </ul>

          {total > 0 && (
            <button
              type="button"
              onClick={() => {
                setPopOpen(false);
                setOpen(true);
              }}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-accent/50 px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              View enquiry list
            </button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
