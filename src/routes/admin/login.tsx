import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { supabase } from "../../lib/supabase";
import { getAdminRoles, primeAuth } from "../../lib/auth";
import { landingPath, loginNameToEmail } from "../../lib/roles";
import { Lock, UserRound, Loader2, ArrowLeft, ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import logoText from "../../assets/mithara-logo.png";
import logoIcon from "../../assets/mithara-icon.png";
import heroImg from "../../assets/hero/Kunafa_hero_1.jpg";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [{ title: "Mithara Admin Login" }],
  }),
  component: AdminLoginPage,
});

const inputClass =
  "h-12 w-full rounded-xl border border-[#e0dcec] bg-[#f8f7fc] pr-4 pl-11 text-base sm:text-sm text-[#1c1733] placeholder:text-[#a8a1c2] transition focus:border-[#d39c54] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#d39c54]/20";

function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter both your sign-in name and password.");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        // Staff may type a short username (e.g. "ravi"); it is turned into their private sign-in address.
        email: loginNameToEmail(email),
        password,
      });

      if (error) {
        toast.error(error.message);
        setIsLoading(false);
        return;
      }

      // Make the whole app aware of the new session before the access check runs, then find out what
      // this person may do: the Owner, or an active staff member with one or more roles.
      primeAuth(data.session);
      const roles = await getAdminRoles();
      if (roles.length === 0) {
        await supabase.auth.signOut();
        primeAuth(null);
        toast.error("Access denied. This account does not have access to the management console.");
        setIsLoading(false);
        return;
      }

      toast.success("Welcome back to Mithara Admin");
      // Load the first page first (the button keeps showing its spinner), then switch once. Navigating
      // straight away left the sign-in form on screen while the page's code was still loading.
      const home = landingPath(roles);
      try {
        await router.preloadRoute({ to: home });
      } catch {
        /* navigating below still works, just without the head start */
      }
      await router.navigate({ to: home, replace: true });
    } catch (err: any) {
      toast.error(err?.message || "Failed to sign in");
      setIsLoading(false);
    }
  };

  return (
    <div className="admin-theme grid min-h-[100dvh] grid-rows-[auto_1fr] bg-[#282345] text-[#1c1733] lg:grid-cols-[1.05fr_1fr] lg:grid-rows-1 lg:bg-white">
      {/* Mobile brand band */}
      <header className="relative overflow-hidden px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-14 lg:hidden">
        <img src={heroImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#282345]/80 via-[#282345]/85 to-[#282345]" />
        <div className="absolute inset-0 bg-pattern opacity-40" aria-hidden />
        <div className="relative flex flex-col items-center text-center">
          <img src={logoIcon} alt="" className="h-12 w-12 object-contain" />
          <img src={logoText} alt="Mithara" className="mt-3 h-4 w-auto object-contain" />
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-[#ebb976] backdrop-blur">
            <ShieldCheck className="h-3 w-3" />
            Management console
          </span>
        </div>
      </header>

      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-[#282345] lg:block">
        <img src={heroImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1c1733] via-[#282345]/75 to-[#282345]/40" />
        <div className="absolute inset-0 bg-pattern opacity-40" aria-hidden />

        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <img src={logoIcon} alt="" className="h-10 w-10 object-contain" />
            <img src={logoText} alt="Mithara" className="h-5 w-auto object-contain" />
          </div>

          <div className="max-w-md">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-[#ebb976] backdrop-blur">
              <ShieldCheck className="h-3.5 w-3.5" />
              Management console
            </span>
            <h2 className="mt-5 font-serif text-4xl leading-tight font-semibold text-white">
              Crafted with care.
              <br />
              <span className="text-gold-gradient">Managed with ease.</span>
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-white/70">
              Orders, menu, customers and revenue — everything your kitchen needs, in one calm place.
            </p>
          </div>
        </div>
      </aside>

      {/* Form panel */}
      <main className="relative -mt-8 flex items-start justify-center rounded-t-[2rem] bg-white px-6 pt-9 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-[0_-12px_32px_-12px_rgba(0,0,0,0.35)] sm:px-12 lg:mt-0 lg:items-center lg:rounded-none lg:py-12 lg:shadow-none">
        <div className="page-enter w-full max-w-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#b9772a]">
            Authorized personnel only
          </p>
          <h1 className="mt-2 font-serif text-2xl font-semibold text-[#1c1733] sm:text-3xl">Welcome back</h1>
          <p className="mt-2 text-sm text-[#6b6488]">
            Sign in to manage orders, the kitchen, deliveries and more.
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            <div>
              <label htmlFor="admin-email" className="mb-1.5 block text-xs font-semibold text-[#4a4370]">
                Email or username
              </label>
              <div className="relative">
                <UserRound className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-[#a8a1c2]" />
                <input
                  id="admin-email"
                  type="text"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email or username"
                  required
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-password" className="mb-1.5 block text-xs font-semibold text-[#4a4370]">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-[#a8a1c2]" />
                <input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className={`${inputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute top-1/2 right-3 -translate-y-1/2 rounded-lg p-1.5 text-[#a8a1c2] transition-colors hover:text-[#282345]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#282345] text-sm font-semibold text-white shadow-lg shadow-[#282345]/25 transition-all hover:bg-[#1c1733] hover:shadow-xl hover:shadow-[#282345]/30 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#d39c54]/40 disabled:pointer-events-none disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Verifying credentials…</span>
                </>
              ) : (
                <>
                  <span>Sign in</span>
                  <ArrowRight className="h-4 w-4 text-[#ebb976] transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 border-t border-[#e7e3f0] pt-5">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6b6488] transition-colors hover:text-[#b9772a]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Return to storefront
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
