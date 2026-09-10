import { Link } from "@tanstack/react-router";
import logoText from "../assets/mithara-logo.png";
import logoIcon from "../assets/mithara-icon.png";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/40 bg-[#1c1733]">
      <div className="mx-auto max-w-6xl px-6 py-12 text-sm text-muted-foreground">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <Link to="/" aria-label="Mithara — home" className="inline-flex items-center gap-2.5">
              <img src={logoIcon} alt="" className="h-6 w-6 object-contain" />
              <img src={logoText} alt="Mithara" className="h-5 w-auto object-contain" />
            </Link>
            <p className="mt-2">Dessert by Desert People.</p>
          </div>
          <div className="text-xs uppercase tracking-[0.3em]">
            <p>Voice enabled · Built for everyone</p>
            <p className="mt-1 text-right">© 2026 Mithara</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
