import React, { useState, useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ShoppingBag,
  Users,
  FileText,
  TrendingUp,
  UtensilsCrossed,
  Sliders,
  LogOut,
  ExternalLink,
  Menu as MenuIcon,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth, signOut } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { unwrapSetting } from "../../lib/settings";
import { AdminGuard } from "./AdminGuard";
import { NewOrderAlert, OrderSoundToggle } from "./NewOrderAlert";
import { LowStockWatcher } from "./LowStockAlert";
import { NotificationBell, NotificationsWatcher } from "./NotificationCenter";
import { toast } from "sonner";
import logoText from "../../assets/mithara-logo.png";
import logoIcon from "../../assets/mithara-icon.png";
import { useCardSpotlight } from "./useCardSpotlight";

const NAV_GROUPS = [
  {
    title: "Operations",
    items: [
      { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
      { label: "Orders", href: "/admin/orders", icon: ShoppingBag },
      { label: "Customers", href: "/admin/customers", icon: Users },
      { label: "Invoices", href: "/admin/invoices", icon: FileText },
    ],
  },
  {
    title: "Insights",
    items: [{ label: "Revenue", href: "/admin/revenue", icon: TrendingUp }],
  },
  {
    title: "Store",
    items: [
      { label: "Menu Control", href: "/admin/menu", icon: UtensilsCrossed },
      { label: "Settings", href: "/admin/settings", icon: Sliders },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  // The page on screen (changes only when the new page is ready), used to replay the entrance animation once.
  const shownPath = useRouterState({ select: (s) => (s.resolvedLocation ?? s.location).pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [newOrdersCount, setNewOrdersCount] = useState<number>(0);
  const [holidayMode, setHolidayMode] = useState<boolean>(false);
  // Desktop only: collapse the sidebar to an icon rail. Remembered between visits.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("mithara-admin-sidebar") === "collapsed");
    } catch {
      /* storage unavailable — default to expanded */
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("mithara-admin-sidebar", next ? "collapsed" : "expanded");
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const c = collapsed;

  // Cursor-follow glow on every .adm-card.
  useCardSpotlight();

  useEffect(() => {
    const fetchQuickStats = async () => {
      const { count } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("status", "new");
      if (count !== null) setNewOrdersCount(count);

      await fetchHoliday();
    };

    const fetchHoliday = async () => {
      const { data: setting } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "holiday_mode")
        .maybeSingle();

      if (setting?.value !== undefined) {
        setHolidayMode(unwrapSetting(setting.value) === true);
      }
    };

    fetchQuickStats();
    const interval = setInterval(fetchQuickStats, 30000);

    // Update the Store live / closed pill the moment settings change (this tab or another).
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`admin-store-pill-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "site_settings" }, () => void fetchHoliday())
        .subscribe();
    } catch {
      /* the 30 s refresh above still keeps it current */
    }
    const onSaved = () => void fetchHoliday();
    window.addEventListener("mithara:settings-saved", onSaved);

    return () => {
      clearInterval(interval);
      window.removeEventListener("mithara:settings-saved", onSaved);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("Signed out of Mithara Admin");
      window.location.href = "/admin/login";
    } catch {
      toast.error("Error signing out");
    }
  };

  const currentItem = ALL_ITEMS.find(
    (i) => currentPath === i.href || currentPath.startsWith(i.href + "/")
  );
  const initial = (user?.email?.[0] ?? "A").toUpperCase();

  const StorePill = (
    <Link
      to="/admin/settings"
      title="Change in Settings"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors sm:gap-2 sm:px-3 sm:text-xs ${
        holidayMode
          ? "border-rose-500/25 bg-rose-500/10 text-rose-400 hover:bg-rose-500/15"
          : "border-emerald-500/25 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15"
      }`}
    >
      <span className="relative flex h-2 w-2">
        {!holidayMode && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            holidayMode ? "bg-rose-500" : "bg-emerald-500"
          }`}
        />
      </span>
      {holidayMode ? "Store closed" : "Store live"}
    </Link>
  );

  return (
    <AdminGuard>
      <div className="admin-theme flex min-h-[100dvh] overflow-x-clip bg-background text-foreground">
        {/* Mobile header */}
        <div className="fixed top-0 right-0 left-0 z-40 flex h-16 items-center justify-between gap-2 bg-[#282345] px-3 pt-[env(safe-area-inset-top)] text-white shadow-lg sm:px-4 lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle navigation"
              className="shrink-0 rounded-xl bg-white/10 p-2.5 text-white hover:bg-white/15"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
            </button>
            <img src={logoText} alt="Mithara" className="h-3.5 w-auto min-w-0 object-contain" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <NotificationBell tone="dark" />
            <OrderSoundToggle tone="dark" />
            {StorePill}
          </div>
        </div>

        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-[17rem] max-w-[85vw] flex-col bg-[#282345] text-white transition-[transform,width] duration-300 ease-out lg:sticky lg:top-0 lg:h-[100dvh] lg:shrink-0 lg:translate-x-0 ${
            c ? "lg:w-[4.75rem]" : "lg:w-[17rem]"
          } ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <div className="absolute inset-0 bg-pattern opacity-60" />
            <div className="absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-[#d39c54]/15 blur-3xl" />
          </div>

          {/* Collapse / expand (desktop) */}
          <button
            onClick={toggleCollapsed}
            aria-label={c ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!c}
            title={c ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute top-[1.6rem] -right-3 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition-colors hover:border-[#d39c54] hover:text-[#a8691d] lg:flex"
          >
            {c ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>

          {/* Brand */}
          <div className="relative flex h-20 items-center justify-between px-5">
            <div className="flex items-center gap-3">
              <img src={logoIcon} alt="" className="h-9 w-9 object-contain transition-transform duration-500 hover:rotate-[360deg] hover:scale-110" />
              <div className={`flex flex-col leading-none ${c ? "lg:hidden" : ""}`}>
                <img src={logoText} alt="Mithara" className="h-3.5 w-auto object-contain" />
                <span className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.24em] text-white/50">
                  Admin
                </span>
              </div>
            </div>
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
              className="text-white/60 hover:text-white lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Nav */}
          <nav className="relative flex-1 space-y-6 overflow-x-hidden overflow-y-auto px-3 py-4">
            {NAV_GROUPS.map((group) => (
              <div key={group.title}>
                <p
                  className={`mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40 ${
                    c ? "lg:hidden" : ""
                  }`}
                >
                  {group.title}
                </p>
                {c && <div className="mx-3 mb-3 hidden h-px bg-white/10 lg:block" aria-hidden />}
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active =
                      currentPath === item.href || currentPath.startsWith(item.href + "/");
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        onClick={() => setMobileOpen(false)}
                        title={c ? item.label : undefined}
                        aria-label={item.label}
                        className={`group relative flex items-center justify-between overflow-hidden rounded-xl py-2.5 pr-3 pl-[17px] text-sm font-medium transition-colors duration-200 ${
                          active
                            ? "bg-white/10 text-white"
                            : "text-white/65 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        {active && (
                          <span className="adm-fill absolute top-2 bottom-2 -left-3 w-1 rounded-r-full bg-[#d39c54] shadow-[0_0_12px_2px_rgba(211,156,84,.7)]" />
                        )}
                        <span className="flex items-center gap-3">
                          <Icon
                            className={`h-[18px] w-[18px] shrink-0 transition-colors duration-200 ${
                              active ? "text-[#ebb976]" : "text-white/50 group-hover:text-[#ebb976]"
                            }`}
                          />
                          <span className={`whitespace-nowrap ${c ? "lg:hidden" : ""}`}>{item.label}</span>
                        </span>
                        {item.href === "/admin/orders" && newOrdersCount > 0 && (
                          <>
                            <span
                              className={`adm-urgent flex h-5 min-w-5 items-center justify-center rounded-full bg-[#d39c54] px-1.5 text-[10px] font-bold text-[#1c1733] ${
                                c ? "lg:hidden" : ""
                              }`}
                            >
                              {newOrdersCount}
                            </span>
                            {c && (
                              <span className="absolute top-1.5 right-2 hidden h-2.5 w-2.5 rounded-full bg-[#d39c54] ring-2 ring-[#282345] lg:block" />
                            )}
                          </>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* User */}
          <div className={`relative border-t border-white/10 p-4 ${c ? "lg:p-3" : ""}`}>
            <div className={`flex items-center gap-3 rounded-xl bg-white/5 p-2.5 ${c ? "lg:flex-col lg:gap-2" : ""}`}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-gold text-sm font-bold text-[#1c1733] ring-2 ring-transparent transition-all duration-300 hover:scale-110 hover:ring-[#ebb976]/50">
                {initial}
              </div>
              <div className={`min-w-0 flex-1 ${c ? "lg:hidden" : ""}`}>
                <p className="truncate text-xs font-semibold text-white">
                  {user?.email ?? "Administrator"}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-[#ebb976]/80">Super admin</p>
              </div>
              <button
                onClick={handleSignOut}
                title="Log out"
                aria-label="Log out"
                className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>

        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-[#1c1733]/60 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 hidden h-16 items-center justify-between border-b border-border bg-background/80 px-8 backdrop-blur-md lg:flex">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Admin</span>
              <span className="text-muted-foreground/50">/</span>
              <span key={currentItem?.label} className="adm-page font-semibold text-foreground">
                {currentItem?.label ?? "Console"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <NotificationBell />
              <OrderSoundToggle />
              {StorePill}
              <Link
                to="/"
                target="_blank"
                className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#d39c54] hover:text-[#a8691d] hover:shadow-md"
              >
                <ExternalLink className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                Storefront
              </Link>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1400px] flex-1 p-3 pt-[calc(4rem+env(safe-area-inset-top)+0.75rem)] sm:p-4 sm:pt-[calc(4rem+env(safe-area-inset-top)+1rem)] lg:p-8 lg:pt-8">
            <div key={shownPath} className="adm-page">
              {children}
            </div>
          </main>
        </div>
        <NewOrderAlert />
        <LowStockWatcher />
        <NotificationsWatcher />
      </div>
    </AdminGuard>
  );
}
