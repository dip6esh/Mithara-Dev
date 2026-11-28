import { useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";

/**
 * First sign-in for a new staff member (or after the Owner resets their password): the Owner set a
 * starting password and shared it, so the person is asked to choose their own before carrying on.
 * The Owner never needs to know it afterwards. Shown on top of whatever page is open.
 */
export function ChangePasswordGate() {
  const { user, isOwner } = useAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const mustChange = !!user && !isOwner && user.user_metadata?.must_change_password === true && !done;
  if (!mustChange) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return toast.error("Please use at least 8 characters.");
    if (pw !== pw2) return toast.error("The two passwords do not match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw, data: { must_change_password: false } });
    setBusy(false);
    if (error) return toast.error(error.message);
    setDone(true);
    toast.success("Password saved. You're all set.");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1c1733]/80 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-2xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#282345]">
          <KeyRound className="h-6 w-6 text-[#ebb976]" />
        </div>
        <h2 className="mt-4 font-serif text-2xl font-semibold text-[#1c1733]">Choose your own password</h2>
        <p className="mt-1.5 text-sm text-[#6b6488]">
          You signed in with a starting password. Pick one only you know — you'll use it from now on.
        </p>
        <label className="mt-5 block text-xs font-semibold text-[#4a4370]">New password</label>
        <div className="relative mt-1.5">
          <input
            type={show ? "text" : "password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password"
            className="h-11 w-full rounded-xl border border-[#e0dcec] bg-[#f8f7fc] px-3.5 pr-11 text-sm text-[#1c1733] focus:border-[#d39c54] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#d39c54]/20"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-[#a8a1c2] hover:text-[#282345]"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <label className="mt-4 block text-xs font-semibold text-[#4a4370]">Type it again</label>
        <input
          type={show ? "text" : "password"}
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          autoComplete="new-password"
          className="mt-1.5 h-11 w-full rounded-xl border border-[#e0dcec] bg-[#f8f7fc] px-3.5 text-sm text-[#1c1733] focus:border-[#d39c54] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#d39c54]/20"
        />
        <button
          type="submit"
          disabled={busy}
          className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#282345] text-sm font-semibold text-white transition hover:bg-[#1c1733] disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save password"}
        </button>
      </form>
    </div>
  );
}
