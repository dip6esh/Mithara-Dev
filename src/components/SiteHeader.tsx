import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import logoText from "../assets/mithara-logo.png";
import logoIcon from "../assets/mithara-icon.png";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "./ui/sheet";
import { EnquiryHeaderButton } from "./EnquiryDrawer";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/kunafa", label: "Kunafa" },
  { to: "/baklava", label: "Baklava" },
  { to: "/care", label: "Care Guide" },
  { to: "/about", label: "About" },
] as const;

export function SiteHeader() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className={`sticky top-0 z-40 transition-[background-color,border-color,box-shadow] duration-500 ${scrolled ? "border-b border-accent/20 bg-[#1c1733]/80 shadow-soft backdrop-blur-xl" : "border-b border-transparent bg-background/60 backdrop-blur"}`}>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <div className={`mx-auto flex max-w-6xl items-center justify-between h-16 px-4 sm:px-6`}>
        <Link to="/" aria-label="Mithara — home" className="group inline-flex items-center gap-2.5">
          <img
            src={logoIcon}
            alt=""
            className="h-7 w-7 object-contain transition-transform duration-300 group-hover:scale-105 md:h-8 md:w-8"
          />
          <img src={logoText} alt="Mithara" className="h-5 w-auto object-contain md:h-6" />
        </Link>

        {/* Desktop Navigation */}
        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-8 text-sm">
            {NAV.map((n) => {
              const active = n.to === "/" ? currentPath === "/" : currentPath.startsWith(n.to);
              return (
                <li key={n.to}>
                  <Link
                    to={n.to}
                    aria-current={active ? "page" : undefined}
                    className={`nav-link relative py-1 transition-colors duration-200 ${
                      active
                        ? "font-semibold text-accent"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {n.label}
                    
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
        <EnquiryHeaderButton />
        {/* Mobile Navigation Drawer */}
        <div className="md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-[#302844] text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="flex w-[280px] sm:w-[320px] flex-col justify-between border-l border-border/60 bg-[#282345] p-6 text-foreground"
            >
              <div>
                <SheetHeader className="text-left pb-6 border-b border-border/40">
                  <div className="flex items-center gap-2.5">
                    <img src={logoIcon} alt="" className="h-7 w-7 object-contain" />
                    <img src={logoText} alt="Mithara" className="h-5 w-auto object-contain" />
                  </div>
                  <SheetTitle className="sr-only">Mobile Navigation Menu</SheetTitle>
                  <p className="mt-2 text-xs uppercase tracking-[0.3em] text-accent">
                    A premium dessert house
                  </p>
                </SheetHeader>

                <nav aria-label="Mobile Primary" className="mt-6">
                  <ul className="flex flex-col space-y-2">
                    {NAV.map((n) => {
                      const active =
                        n.to === "/" ? currentPath === "/" : currentPath.startsWith(n.to);
                      return (
                        <li key={n.to}>
                          <Link
                            to={n.to}
                            onClick={() => setMobileOpen(false)}
                            aria-current={active ? "page" : undefined}
                            className={`flex items-center justify-between rounded-2xl px-4 py-3 text-base transition-colors ${
                              active
                                ? "bg-accent/15 font-semibold text-accent border border-accent/40"
                                : "text-foreground hover:bg-[#302844] hover:text-accent"
                            }`}
                          >
                            <span>{n.label}</span>
                            {active && (
                              <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </nav>
              </div>

              <div className="pt-6 border-t border-border/40 text-xs text-muted-foreground">
                <p className="font-serif italic text-accent/90">Dessert by Desert People.</p>
                <p className="mt-1">Crafted with ritual care.</p>
              </div>
            </SheetContent>
          </Sheet>
        </div>
        </div>
      </div>
    </header>
  );
}
