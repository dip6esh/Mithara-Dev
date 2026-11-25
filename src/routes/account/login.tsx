import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { supabase } from "../../lib/supabase";
import { primeAuth } from "../../lib/auth";
import {
  Lock,
  Mail,
  User,
  Phone,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  MapPin,
  Repeat,
  PackageCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import logoText from "../../assets/mithara-logo.png";
import logoIcon from "../../assets/mithara-icon.png";
import heroImg from "../../assets/hero/Baklava_hero_1.jpg";

export const Route = createFileRoute("/account/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [{ title: "Sign in — Mithara" }],
  }),
  component: CustomerAuthPage,
});

const inputClass =
  "h-12 w-full rounded-xl border border-[#e0dcec] bg-[#f8f7fc] pr-4 pl-11 text-base sm:text-sm text-[#1c1733] placeholder:text-[#a8a1c2] transition focus:border-[#d39c54] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#d39c54]/20";

const labelClass = "mb-1.5 block text-xs font-semibold text-[#4a4370]";
const iconClass = "absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-[#a8a1c2]";

const PERKS = [
  { icon: MapPin, text: "Save your addresses for one-tap checkout" },
  { icon: Repeat, text: "Reorder your favourites in seconds" },
  { icon: PackageCheck, text: "Follow every order from kitchen to doorstep" },
];

function CustomerAuthPage() {
  const router = useRouter();
  const { redirect } = Route.useSearch();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Send the visitor back to where they came from (e.g. to finish checkout).
  // In-app navigation (no full page reload): the cart lives in localStorage, so it survives the switch.
  const finish = async () => {
    if (redirect && redirect.startsWith("/")) {
      router.history.push(redirect);
    } else {
      // Load the profile page's code first (the button keeps its spinner) so the switch is one step.
      try {
        await router.preloadRoute({ to: "/account/profile" });
      } catch {
        /* navigating below still works, just without the head start */
      }
      await router.navigate({ to: "/account/profile", replace: true });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Once sign-in succeeds we keep the spinner on until the next page takes over,
    // so the button never flips back to "Sign in" while the page is still loading.
    let navigating = false;

    try {
      if (isSignUp) {
        if (!name.trim() || !phone.trim()) {
          toast.error("Please provide your name and WhatsApp contact number.");
          setIsLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { name: name.trim(), phone: phone.trim() },
          },
        });

        if (error) throw error;

        // No session yet means email confirmation is required. The profile is still created
        // from the sign-up details by the database (migration 005); just ask them to confirm.
        if (!data.session) {
          toast.success("Account created! Please confirm your email, then sign in.");
          setIsSignUp(false);
          return;
        }

        // Upsert customer profile
        if (data.user) {
          const { error: profileError } = await supabase.from("customer_profiles").upsert({
            id: data.user.id,
            name: name.trim(),
            phone: phone.trim(),
          });
          if (profileError) throw profileError;
        }

        primeAuth(data.session);
        toast.success("Account created successfully!");
        navigating = true;
        await finish();
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;
        // Tell the whole app about the new session right away, so the next page doesn't
        // start from a "still checking" state and wait for the auth listener to catch up.
        primeAuth(data.session);
        toast.success("Welcome back to Mithara!");
        navigating = true;
        await finish();
      }
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally {
      if (!navigating) setIsLoading(false);
    }
  };

  const toggleBtn = (active: boolean) =>
    `flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-[#d39c54]/30 ${
      active
        ? "bg-white text-[#282345] shadow-sm"
        : "text-[#6b6488] hover:text-[#282345]"
    }`;

  return (
    <div className="grid min-h-[100dvh] grid-rows-[auto_1fr] bg-[#282345] text-[#1c1733] lg:grid-cols-[1.05fr_1fr] lg:grid-rows-1 lg:bg-white">
      {/* Mobile brand band */}
      <header className="relative overflow-hidden px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-14 lg:hidden">
        <img src={heroImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#282345]/80 via-[#282345]/85 to-[#282345]" />
        <div className="absolute inset-0 bg-pattern opacity-40" aria-hidden />
        <div className="relative flex flex-col items-center text-center">
          <img src={logoIcon} alt="" className="h-12 w-12 object-contain" />
          <img src={logoText} alt="Mithara" className="mt-3 h-4 w-auto object-contain" />
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-[#ebb976] backdrop-blur">
            <Sparkles className="h-3 w-3" />
            Your Mithara account
          </span>
        </div>
      </header>

      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-[#282345] lg:block">
        <img src={heroImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1c1733] via-[#282345]/75 to-[#282345]/40" />
        <div className="absolute inset-0 bg-pattern opacity-40" aria-hidden />

        <div className="relative flex h-full flex-col justify-between p-12">
          <a href="/" className="flex items-center gap-3" aria-label="Mithara home">
            <img src={logoIcon} alt="" className="h-10 w-10 object-contain" />
            <img src={logoText} alt="Mithara" className="h-5 w-auto object-contain" />
          </a>

          <div className="max-w-md">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-[#ebb976] backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Your Mithara account
            </span>
            <h2 className="mt-5 font-serif text-4xl leading-tight font-semibold text-white">
              Something sweet,
              <br />
              <span className="text-gold-gradient">always within reach.</span>
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-white/70">
              Heirloom kunafa and baklava, hand crafted in small batches — and a faster way to order
              them.
            </p>
            <ul className="mt-7 space-y-3">
              {PERKS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm text-white/80">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-[#ebb976] backdrop-blur">
                    <Icon className="h-4 w-4" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>

      {/* Form panel */}
      <main className="relative -mt-8 flex items-start justify-center rounded-t-[2rem] bg-white px-6 pt-9 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-[0_-12px_32px_-12px_rgba(0,0,0,0.35)] sm:px-12 lg:mt-0 lg:items-center lg:rounded-none lg:py-12 lg:shadow-none">
        <div className="page-enter w-full max-w-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#b9772a]">
            {isSignUp ? "Join Mithara" : "Customer sign in"}
          </p>
          <h1 className="mt-2 font-serif text-2xl font-semibold text-[#1c1733] sm:text-3xl">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-[#6b6488]">
            {isSignUp
              ? "Save your addresses and reorder in one tap."
              : "Sign in to see your orders and saved addresses."}
          </p>

          {redirect && redirect.startsWith("/") && (
            <p className="mt-4 rounded-xl border border-[#d39c54]/30 bg-[#d39c54]/10 px-3.5 py-2.5 text-xs leading-relaxed text-[#7a4f12]">
              Sign in to continue — your cart is saved and will be waiting for you.
            </p>
          )}

          {/* Sign in / Create account switch */}
          <div
            role="tablist"
            aria-label="Sign in or create an account"
            className="mt-6 flex rounded-xl bg-[#f1eff8] p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!isSignUp}
              onClick={() => setIsSignUp(false)}
              className={toggleBtn(!isSignUp)}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isSignUp}
              onClick={() => setIsSignUp(true)}
              className={toggleBtn(isSignUp)}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            {isSignUp && (
              <>
                <div>
                  <label htmlFor="cust-name" className={labelClass}>
                    Full name
                  </label>
                  <div className="relative">
                    <User className={iconClass} />
                    <input
                      id="cust-name"
                      type="text"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="Priya Sharma"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="cust-phone" className={labelClass}>
                    WhatsApp number
                  </label>
                  <div className="relative">
                    <Phone className={iconClass} />
                    <input
                      id="cust-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      placeholder="+91 98765 43210"
                      className={inputClass}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-[#8a84a6]">
                    We use this to confirm your order and delivery window.
                  </p>
                </div>
              </>
            )}

            <div>
              <label htmlFor="cust-email" className={labelClass}>
                Email
              </label>
              <div className="relative">
                <Mail className={iconClass} />
                <input
                  id="cust-email"
                  type="email"
                  autoComplete={isSignUp ? "email" : "username"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="name@example.com"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="cust-password" className={labelClass}>
                Password
              </label>
              <div className="relative">
                <Lock className={iconClass} />
                <input
                  id="cust-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={isSignUp ? 6 : undefined}
                  placeholder="••••••••••••"
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
              {isSignUp && (
                <p className="mt-1.5 text-[11px] text-[#8a84a6]">Use at least 6 characters.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#282345] text-sm font-semibold text-white shadow-lg shadow-[#282345]/25 transition-all hover:bg-[#1c1733] hover:shadow-xl hover:shadow-[#282345]/30 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#d39c54]/40 disabled:pointer-events-none disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{isSignUp ? "Creating your account…" : "Signing you in…"}</span>
                </>
              ) : (
                <>
                  <span>{isSignUp ? "Create account & continue" : "Sign in"}</span>
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
              Back to store
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
