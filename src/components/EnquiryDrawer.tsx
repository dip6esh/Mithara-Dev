import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, Copy, MessageCircle, ShoppingBag, Trash2, X } from "lucide-react";
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
  MAX_NOTES,
  WHATSAPP_DISPLAY,
  finalMessage,
  formatINR,
  validateEnquiry,
  type EnquiryLine,
  type EnquiryMode,
} from "../lib/enquiry";

/* Shared look for text inputs: recessed, hairline border, gold only on focus. */
const field =
  "w-full rounded-xl border border-border bg-black/20 px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/60 transition-colors focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

/* Quiet secondary button (text + hairline), used for Copy and the empty-state links. */
const quietButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border px-5 text-sm font-medium text-foreground transition-colors hover:border-accent/60 hover:bg-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/** Small uppercase label that opens each section. Gold is used here and on the main button only. */
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
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 id={id} className="font-sans text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
        {children}
      </h3>
      {aside}
    </div>
  );
}

function LineRow({ line }: { line: EnquiryLine }) {
  const { setQty, removeLine } = useEnquiry();
  const label = line.variant ? `${line.name}, ${line.variant}` : line.name;
  const meta = [
    [line.category, line.variant].filter(Boolean).join(" · "),
    line.unitPrice != null ? formatINR(line.unitPrice) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="py-5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-4">
        <p className="min-w-0 font-serif text-lg leading-snug text-foreground">{line.name}</p>
        {line.unitPrice != null && (
          <p className="shrink-0 text-base font-medium tabular-nums text-foreground">
            {formatINR(line.unitPrice * line.qty)}
          </p>
        )}
      </div>
      {meta && <p className="mt-1 text-sm text-muted-foreground">{meta}</p>}

      <div className="mt-3 flex items-center justify-between gap-3">
        <QtyStepper value={line.qty} label={label} onChange={(n) => setQty(line.key, n)} />
        <button
          type="button"
          onClick={() => removeLine(line.key)}
          aria-label={`Remove ${label}`}
          className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Remove
        </button>
      </div>
    </li>
  );
}

export function EnquiryDrawer() {
  const {
    open,
    setOpen,
    lines,
    totalQty,
    estimate,
    hasUnpriced,
    clearAll,
    form,
    updateForm,
  } = useEnquiry();

  const [showErrors, setShowErrors] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [copyState, setCopyState] = React.useState<"idle" | "copied" | "failed">("idle");
  const previewRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (!open) {
      setShowErrors(false);
      setConfirmClear(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!confirmClear) return;
    const t = window.setTimeout(() => setConfirmClear(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmClear]);

  React.useEffect(() => {
    if (copyState === "idle") return;
    const t = window.setTimeout(() => setCopyState("idle"), 2500);
    return () => window.clearTimeout(t);
  }, [copyState]);

  const errors = React.useMemo(() => validateEnquiry(lines, form), [lines, form]);
  const { message, url, shortened } = React.useMemo(() => finalMessage(lines, form), [lines, form]);
  const valid = errors.length === 0;
  const sendLabel =
    form.mode === "order"
      ? "Send order on WhatsApp"
      : form.mode === "enquiry"
        ? "Send question on WhatsApp"
        : "Send on WhatsApp";

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopyState("copied");
    } catch {
      // Clipboard API blocked (older browsers / insecure context): reveal the text so it can be selected.
      setPreviewOpen(true);
      window.setTimeout(() => previewRef.current?.select(), 50);
      setCopyState("failed");
    }
  };

  const sendClass =
    "btn-gold inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-full bg-gradient-gold px-6 py-3.5 text-base font-semibold text-gold-foreground shadow-elegant focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-deep";

  const modes: { id: EnquiryMode; title: string }[] = [
    { id: "order", title: "Place an order" },
    { id: "enquiry", title: "Ask a question" },
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        showClose={false}
        className="flex h-dvh w-full flex-col gap-0 border-l border-border bg-background p-0 text-foreground sm:max-w-md"
      >
        {/* Header */}
        <SheetHeader className="relative shrink-0 space-y-1 border-b border-border px-6 pb-5 pt-6 pr-16 text-left">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
            Enquiry list
          </p>
          <SheetTitle className="font-serif text-[1.75rem] font-normal leading-tight text-foreground">
            Order or ask us
          </SheetTitle>
          <SheetDescription className="pt-1 text-sm leading-relaxed text-muted-foreground">
            Review your items, then continue the conversation with us on WhatsApp.
          </SheetDescription>
          <SheetClose
            aria-label="Close enquiry list"
            className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </SheetClose>
        </SheetHeader>

        {/* Scrollable body */}
        <div className="enq-scroll flex-1 space-y-10 overflow-y-auto overscroll-contain px-6 py-7 [scrollbar-gutter:stable_both-edges]">
          {/* 1. Items */}
          <section aria-labelledby="enq-items">
            <SectionHeading
              id="enq-items"
              aside={
                lines.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirmClear) {
                        clearAll();
                        setConfirmClear(false);
                      } else setConfirmClear(true);
                    }}
                    className={`-mr-3 min-h-11 rounded-full px-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      confirmClear
                        ? "font-semibold text-destructive"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {confirmClear ? "Tap again to clear" : "Clear all"}
                  </button>
                ) : undefined
              }
            >
              Your items
              {lines.length > 0 && (
                <span className="ml-2 font-medium normal-case tracking-normal text-muted-foreground">
                  {totalQty} {totalQty === 1 ? "piece" : "pieces"}
                </span>
              )}
            </SectionHeading>

            {lines.length === 0 ? (
              <div className="rounded-2xl border border-border px-6 py-8 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border text-accent">
                  <ShoppingBag className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="mx-auto mt-4 max-w-[28ch] text-sm leading-relaxed text-muted-foreground">
                  Nothing here yet. Add items from the menu, or skip ahead and ask us a question.
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
                <ul className="divide-y divide-border">
                  {lines.map((l) => (
                    <LineRow key={l.key} line={l} />
                  ))}
                </ul>
                <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                  Estimate only. Final price, availability and any delivery charge are confirmed with you on
                  WhatsApp.
                </p>
              </>
            )}
          </section>

          {/* 2. Order or enquiry */}
          <section aria-labelledby="enq-mode">
            <SectionHeading id="enq-mode">How can we help?</SectionHeading>

            <div
              role="group"
              aria-labelledby="enq-mode"
              className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-black/20 p-1"
            >
              {modes.map((m) => {
                const selected = form.mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => updateForm({ mode: m.id })}
                    className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      selected
                        ? "bg-indigo-lift text-foreground shadow-soft"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {selected && <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />}
                    {m.title}
                  </button>
                );
              })}
            </div>

            {form.mode === null && (
              <p className="mt-3 text-sm text-muted-foreground">Choose one to continue.</p>
            )}

            {form.mode === "order" && (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                We&rsquo;ll confirm availability, delivery or pickup, timing and payment with you on WhatsApp.
              </p>
            )}

            {form.mode === "enquiry" && (
              <div className="mt-5">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <label htmlFor="enq-question" className="text-sm font-medium text-foreground">
                    Your question
                  </label>
                  <span className="text-xs text-muted-foreground">Required</span>
                </div>
                <textarea
                  id="enq-question"
                  rows={4}
                  maxLength={MAX_NOTES}
                  value={form.question}
                  onChange={(e) => updateForm({ question: e.target.value })}
                  placeholder="Ask about ingredients, allergens, gifting, bulk orders, delivery…"
                  aria-required="true"
                  className={`${field} resize-y`}
                />
                <div className="mt-2 flex items-start justify-between gap-4 text-xs text-muted-foreground">
                  <span>
                    {lines.length > 0
                      ? "The items in your list will be included so we know what you're asking about."
                      : ""}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {form.question.length}/{MAX_NOTES}
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* 3. Preview */}
          <section>
            <details
              open={previewOpen}
              onToggle={(e) => setPreviewOpen((e.currentTarget as HTMLDetailsElement).open)}
              className="border-y border-border"
            >
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                Preview message
                <ChevronRight
                  className={`h-4 w-4 text-muted-foreground transition-transform ${previewOpen ? "rotate-90" : ""}`}
                  aria-hidden="true"
                />
              </summary>
              <div className="pb-5 pt-1">
                <label htmlFor="enq-preview" className="sr-only">
                  Message that will be sent on WhatsApp
                </label>
                <textarea
                  id="enq-preview"
                  ref={previewRef}
                  readOnly
                  rows={12}
                  value={message}
                  className={`${field} resize-y font-mono text-[13px] leading-relaxed`}
                />
                {shortened && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Your list is long, so we shortened the message. We&rsquo;ll confirm prices on WhatsApp.
                  </p>
                )}
                <button type="button" onClick={copyMessage} className={`${quietButton} mt-4`}>
                  {copyState === "copied" ? (
                    <Check className="h-4 w-4 text-accent" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  )}
                  {copyState === "copied" ? "Copied" : "Copy message"}
                </button>
                {copyState === "failed" && (
                  <p role="status" className="mt-2 text-xs text-muted-foreground">
                    Couldn&rsquo;t copy automatically. Select the text above and copy it.
                  </p>
                )}
              </div>
            </details>
          </section>
        </div>

        {/* Sticky footer */}
        <div className="shrink-0 border-t border-border bg-indigo-deep px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          {estimate > 0 && (
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <span className="text-sm text-muted-foreground">
                Estimated total{hasUnpriced ? " (some items on request)" : ""}
              </span>
              <span className="font-serif text-2xl tabular-nums text-foreground">{formatINR(estimate)}</span>
            </div>
          )}

          {showErrors && !valid && (
            <div
              role="alert"
              className="mb-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground"
            >
              <ul className="list-disc space-y-1 pl-4">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {valid ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className={sendClass}>
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              {sendLabel}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <button type="button" onClick={() => setShowErrors(true)} className={sendClass}>
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              {sendLabel}
            </button>
          )}
          <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
            Opens WhatsApp with your message ready. Nothing is sent until you press send there. To{" "}
            {WHATSAPP_DISPLAY}.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Floating pill, shown only while the list has items and the drawer is closed. */
export function EnquiryFloatingButton() {
  const { hydrated, totalQty, estimate, open, setOpen } = useEnquiry();
  if (!hydrated || totalQty === 0 || open) return null;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={`Open enquiry list, ${totalQty} ${totalQty === 1 ? "piece" : "pieces"}`}
      className="enq-fade fixed bottom-4 left-4 z-40 mb-[env(safe-area-inset-bottom)] inline-flex min-h-12 items-center gap-2.5 rounded-full bg-gradient-gold px-5 py-3 text-sm font-semibold text-gold-foreground shadow-elegant focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#282345] md:left-1/2 md:-translate-x-1/2"
    >
      <ShoppingBag className="h-5 w-5" aria-hidden="true" />
      <span>
        View enquiry · {totalQty}
        {estimate > 0 && <span className="font-normal opacity-80"> · {formatINR(estimate)}</span>}
      </span>
    </button>
  );
}

/** Header icon with a count badge. Always available so the list is reachable from any page. */
export function EnquiryHeaderButton() {
  const { hydrated, totalQty, setOpen } = useEnquiry();
  const count = hydrated ? totalQty : 0;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={count > 0 ? `Open enquiry list, ${count} ${count === 1 ? "piece" : "pieces"}` : "Open enquiry list"}
      className="relative inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border/80 bg-[#302844] px-2.5 text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent md:rounded-full md:px-4"
    >
      <ShoppingBag className="h-5 w-5" aria-hidden="true" />
      <span className="hidden text-sm md:inline">Enquiry</span>
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
