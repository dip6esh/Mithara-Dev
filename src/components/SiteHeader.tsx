import { Link, useRouter } from "@tanstack/react-router";
import logoText from "../assets/mithara-logo.png";
import logoIcon from "../assets/mithara-icon.png";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/kunafa", label: "Kunafa" },
  { to: "/baklava", label: "Baklava" },
  { to: "/care", label: "Care Guide" },
  { to: "/about", label: "About" },
] as const;


export function SiteHeader() {
  const router = useRouter();
  const path = router.state.location.pathname;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" aria-label="Mithara — home" className="inline-flex items-center gap-2.5 group">
          <img src={logoIcon} alt="" className="h-7 w-7 object-contain transition-transform duration-300 group-hover:scale-105 md:h-8 md:w-8" />
          <img src={logoText} alt="Mithara" className="h-5 w-auto object-contain md:h-6" />
        </Link>
        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-8 text-sm">
            {NAV.map((n) => {
              const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
              return (
                <li key={n.to}>
                  <Link
                    to={n.to}
                    className={`transition-colors hover:text-accent ${active ? "text-accent font-medium" : "text-foreground"}`}
                  >
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <nav aria-label="Primary mobile" className="md:hidden">
          <ul className="flex items-center gap-4 text-xs">
            {NAV.map((n) => (
              <li key={n.to}>
                <Link to={n.to} className="text-foreground hover:text-accent">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
