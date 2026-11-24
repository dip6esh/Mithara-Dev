import { useEffect, useRef } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";

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
  const Icon = danger ? AlertTriangle : HelpCircle;

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
      <div className="adm-modal w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-200 shadow-2xl">
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              danger ? "bg-rose-500/15 text-rose-300" : "bg-amber-500/15 text-amber-300"
            }`}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-title" className="font-serif text-lg font-bold leading-snug text-neutral-100">
              {title}
            </h2>
            {intro && <p className="mt-1 text-sm text-neutral-400">{intro}</p>}
          </div>
        </div>

        {effects.length > 0 && (
          <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">What will happen</p>
            <ul className="space-y-2 text-sm text-neutral-300">
              {effects.map((t) => (
                <li key={t} className="flex gap-2">
                  <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${danger ? "bg-rose-400" : "bg-amber-400"}`} />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            autoFocus
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-neutral-700 px-4 py-2.5 text-sm font-semibold text-neutral-200 hover:bg-neutral-800 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-xl px-4 py-2.5 text-sm font-bold shadow-md disabled:opacity-60 ${
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
