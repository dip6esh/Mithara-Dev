import { useEffect, useRef } from "react";

/**
 * A plain confirmation box for admin actions: says what is about to happen, in short points,
 * and asks for a clear yes or no. Replaces the browser's bare confirm() popup.
 *
 * It sits on top of other admin modals (e.g. the order details), so while it is open it tells
 * ModalBackdrop to ignore Escape (via a flag on <body>) so only this box closes.
 */
export function ConfirmDialog({
  title,
  intro,
  effects = [],
  confirmLabel,
  cancelLabel = "Go back",
  tone = "default",
  busy = false,
  onConfirm,
  onClose,
}: {
  title: string;
  intro?: string;
  effects?: string[];
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    document.body.dataset.confirmOpen = "1";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      delete document.body.dataset.confirmOpen;
    };
  }, []);

  const danger = tone === "danger";

  // Keep money amounts together on one line (e.g. "₹2,032") so they never break across lines.
  const titleParts = title.split(/(₹\s?[\d,]+(?:\.\d+)?)/g);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="adm-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-[#1c1733]/80 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="adm-modal w-full max-w-md overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900 text-neutral-200 shadow-2xl">
        {/* Header: plain, with a hairline underneath. Colour is kept for the main button only. */}
        <div className="border-b border-neutral-800 px-6 py-5">
          <h2 id="confirm-title" className="font-serif text-xl font-bold leading-snug tracking-tight text-neutral-100">
            {titleParts.map((part, i) =>
              i % 2 === 1 ? (
                <span key={i} className="whitespace-nowrap tabular-nums">
                  {part}
                </span>
              ) : (
                <span key={i}>{part}</span>
              ),
            )}
          </h2>
          {intro && <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">{intro}</p>}
        </div>

        {effects.length > 0 && (
          <div className="px-6 pt-5">
            <div className="mb-3 flex items-center gap-3">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-500">What will happen</h3>
              <span className="h-px flex-1 bg-neutral-800" />
            </div>
            <ol className="divide-y divide-neutral-800 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/60">
              {effects.map((t, i) => (
                <li key={t} className="flex items-start gap-3 px-3.5 py-3 text-sm leading-relaxed text-neutral-300">
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-neutral-700 text-[11px] font-semibold text-neutral-400"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Footer: buttons, full width on phones */}
        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-neutral-800 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            autoFocus
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-neutral-700 px-5 py-2.5 text-sm font-semibold text-neutral-200 transition-colors hover:bg-neutral-800 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-xl px-6 py-2.5 text-sm font-bold shadow-md transition-colors disabled:opacity-60 ${
              danger
                ? "bg-rose-500 text-white shadow-rose-500/20 hover:bg-rose-400"
                : "bg-amber-500 text-gold-foreground shadow-amber-500/20 hover:bg-amber-400"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
