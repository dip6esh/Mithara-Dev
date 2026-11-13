import { Link } from "@tanstack/react-router";
import { ArrowUp } from "lucide-react";
import logoText from "../assets/mithara-logo.png";
import logoIcon from "../assets/mithara-icon.png";
import { WHATSAPP_NUMBER } from "../lib/enquiry";
import { smoothScrollTo } from "../lib/motion";

const LINKS = [
  { to: "/kunafa", label: "Kunafa" },
  { to: "/baklava", label: "Baklava" },
  { to: "/care", label: "Care guide" },
  { to: "/about", label: "About" },
] as const;

export function SiteFooter() {
  return (
    <footer className="relative border-t border-accent/20 bg-[#1c1733]">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6 md:py-12">
        <div className="flex flex-col items-center gap-8 text-center md:flex-row md:items-center md:justify-between md:text-left">
          <div>
            <Link to="/" aria-label="Mithara — home" className="inline-flex items-center gap-2.5">
              <img src={logoIcon} alt="" className="h-7 w-7 object-contain" />
              <img src={logoText} alt="Mithara" className="h-5 w-auto object-contain" />
            </Link>
            <p className="mt-3 font-serif text-lg font-light italic text-gold-light">Dessert by Desert People.</p>
          </div>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap justify-center gap-x-7 gap-y-2 text-sm">
              {LINKS.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="nav-link relative inline-block py-1 text-muted-foreground transition-colors hover:text-accent">
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hello Mithara! I have a question.")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nav-link relative inline-block py-1 text-muted-foreground transition-colors hover:text-accent"
                >
                  WhatsApp us<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            </ul>
          </nav>
        </div>
        <div className="mt-8 flex items-center justify-between border-t border-border/40 pt-5 text-xs text-muted-foreground">
          <p>© 2026 Mithara · Voice enabled</p>
          <button
            type="button"
            onClick={() => smoothScrollTo(0)}
            className="group inline-flex items-center gap-2 transition-colors hover:text-accent"
          >
            Back to top
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-accent/40 transition-transform group-hover:-translate-y-0.5">
              <ArrowUp className="h-4 w-4" />
            </span>
          </button>
        </div>
      </div>
    </footer>
  );
}
