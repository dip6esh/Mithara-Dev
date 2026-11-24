import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Bell, CheckCheck, PackageX, ShoppingBag } from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  markAllNotificationsRead,
  markNotificationRead,
  refreshNotifications,
  useNotifications,
  type AdminNotification,
  type NotificationKind,
} from "../../lib/notifications";

/* ------------------------------------------------------------------ */
/*  Watcher: mounted ONCE in the admin shell. Keeps the inbox current    */
/*  (Realtime + 30 s fallback + on tab focus) and shows the unread       */
/*  count in the browser tab title, e.g. "(3) Mithara".                  */
/* ------------------------------------------------------------------ */
export function NotificationsWatcher() {
  const { unread } = useNotifications();

  useEffect(() => {
    void refreshNotifications();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refreshNotifications(), 300);
    };
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`admin-notifications-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "admin_notifications" }, soon)
        .subscribe();
    } catch {
      /* polling below still keeps it current */
    }
    const poll = setInterval(() => void refreshNotifications(), 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshNotifications();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // Unread count in the tab title, so a background tab still shows something is waiting.
  useEffect(() => {
    const strip = (t: string) => t.replace(/^\(\d+\+?\) /, "");
    const apply = () => {
      const base = strip(document.title);
      const want = unread > 0 ? `(${unread > 99 ? "99+" : unread}) ${base}` : base;
      if (document.title !== want) document.title = want;
    };
    apply();
    const el = document.querySelector("title");
    const mo = el ? new MutationObserver(apply) : null; // re-apply when a route changes the title
    if (el && mo) mo.observe(el, { childList: true, characterData: true, subtree: true });
    return () => {
      mo?.disconnect();
      document.title = strip(document.title);
    };
  }, [unread]);

  return null;
}

/* ------------------------------------------------------------------ */
/*  Bell + panel                                                        */
/* ------------------------------------------------------------------ */
const KIND_STYLE: Record<NotificationKind, { icon: typeof Bell; chip: string }> = {
  new_order: { icon: ShoppingBag, chip: "bg-[#d39c54]/20 text-[#a8691d]" },
  low_stock: { icon: AlertTriangle, chip: "bg-amber-500/20 text-amber-700" },
  out_of_stock: { icon: PackageX, chip: "bg-rose-500/15 text-rose-600" },
};

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export function NotificationBell({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { items, unread, ready, unavailable } = useNotifications();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [, tick] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close on outside tap / Escape. Re-render each minute while open so "2 min ago" stays true.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const clock = setInterval(() => tick((n) => n + 1), 60_000);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      clearInterval(clock);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    setOpen((o) => {
      if (!o) void refreshNotifications();
      return !o;
    });
  };

  const openItem = (n: AdminNotification) => {
    void markNotificationRead(n.id);
    setOpen(false);
    navigate({ to: n.kind === "new_order" ? "/admin/orders" : "/admin/menu" });
  };

  const shown = tab === "unread" ? items.filter((n) => !n.read_at) : items;
  const badge = unread > 99 ? "99+" : String(unread);

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notifications"
        className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors sm:h-9 sm:w-9 ${
          tone === "dark"
            ? "border-white/15 bg-white/10 text-white hover:bg-white/15"
            : "border-border bg-card text-foreground hover:border-[#d39c54]"
        }`}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unread > 0 && (
          <span
            className={`adm-urgent absolute -top-1 -right-1 flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ${
              tone === "dark" ? "ring-[#282345]" : "ring-background"
            }`}
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-3 top-[calc(4rem+env(safe-area-inset-top)+0.5rem)] z-50 overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl lg:absolute lg:inset-x-auto lg:top-full lg:right-0 lg:mt-2 lg:w-[24rem]"
        >
          <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
            <div>
              <h2 className="font-serif text-lg font-semibold leading-tight">Notifications</h2>
              <p className="text-[11px] text-muted-foreground">
                {unread > 0 ? `${unread} unread` : "You're all caught up"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void markAllNotificationsRead()}
              disabled={unread === 0}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium transition-colors enabled:hover:border-[#d39c54] enabled:hover:text-[#a8691d] disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Mark all read
            </button>
          </div>

          <div className="flex gap-1.5 px-4 pb-2" role="tablist">
            {(["all", "unread"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  tab === t ? "bg-[#282345] text-white" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {t === "all" ? "All" : `Unread${unread > 0 ? ` (${unread})` : ""}`}
              </button>
            ))}
          </div>

          <div className="max-h-[min(65dvh,30rem)] overflow-y-auto overscroll-contain border-t border-border">
            {shown.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {unavailable
                  ? "Notifications are not set up yet. Run migration 011 in Supabase."
                  : !ready
                    ? "Loading…"
                    : tab === "unread"
                      ? "Nothing unread."
                      : "No notifications yet. New orders and stock alerts will appear here."}
              </p>
            ) : (
              <ul>
                {shown.map((n) => {
                  const { icon: Icon, chip } = KIND_STYLE[n.kind] ?? KIND_STYLE.new_order;
                  const isUnread = !n.read_at;
                  return (
                    <li key={n.id} className="border-b border-border/60 last:border-b-0">
                      <button
                        type="button"
                        onClick={() => openItem(n)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 ${
                          isUnread ? "bg-[#d39c54]/[0.08]" : ""
                        }`}
                      >
                        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${chip}`}>
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm leading-snug ${isUnread ? "font-semibold" : "font-medium"}`}>
                            {n.title}
                          </span>
                          {n.body && (
                            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{n.body}</span>
                          )}
                          <span
                            className={`mt-1 block text-[11px] ${isUnread ? "font-medium text-[#a8691d]" : "text-muted-foreground"}`}
                          >
                            {ago(n.created_at)}
                          </span>
                        </span>
                        {isUnread && (
                          <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[#d39c54]" aria-label="Unread" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
