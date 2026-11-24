import { Loader2, ShieldAlert } from "lucide-react";
import logoIcon from "../../assets/mithara-icon.png";

/**
 * The one calm screen used while the admin area is being opened (checking access, redirecting) and when
 * something goes wrong. The card fades in after a short delay, so a quick check shows a clean background
 * instead of a flash of text.
 */
export function AdminSplash({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="admin-theme flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4">
      <div className="adm-splash-body flex flex-col items-center gap-5" role="status" aria-live="polite">
        <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-[#282345] shadow-xl">
          <img src={logoIcon} alt="" className="h-10 w-10 object-contain" />
          <Loader2 className="absolute -right-2 -bottom-2 h-7 w-7 animate-spin rounded-full bg-background p-1 text-[#d39c54]" />
        </div>
        <div className="text-center">
          <p className="font-serif text-lg text-foreground">{title}</p>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

/** Shown if the admin area itself fails to open. Branded, with a way forward (not the generic site error). */
export function AdminError({ error, reset }: { error?: unknown; reset?: () => void }) {
  const message = error instanceof Error ? error.message : "";
  return (
    <div className="admin-theme flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 text-center">
      <div className="adm-splash-body max-w-md rounded-3xl border border-border bg-card p-8 shadow-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10">
          <ShieldAlert className="h-7 w-7 text-rose-500" />
        </div>
        <h2 className="mt-4 font-serif text-2xl font-semibold text-foreground">We couldn’t open the console</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Something interrupted loading. Please try again, or sign in again if it keeps happening.
        </p>
        {import.meta.env.DEV && message && (
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-muted p-3 text-left font-mono text-xs text-rose-600">
            {message}
          </pre>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => (reset ? reset() : window.location.reload())}
            className="inline-flex items-center justify-center rounded-full bg-[#282345] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1c1733]"
          >
            Try again
          </button>
          <a
            href="/admin/login"
            className="inline-flex items-center justify-center rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-[#d39c54]"
          >
            Back to sign in
          </a>
        </div>
      </div>
    </div>
  );
}
