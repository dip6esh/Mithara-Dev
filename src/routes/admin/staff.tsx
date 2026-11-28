import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, Pencil, Plus, ShieldCheck, Trash2, UserX, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { STAFF_LIST_CACHE_KEY, STAFF_SETUP_CACHE_KEY, hasCache, useCachedState } from "../../lib/adminCache";
import { ROLE_INFO, STAFF_ROLES, isValidEmail, isValidUsername, type StaffRole } from "../../lib/roles";
import { StaffApiError, generatePassword, staffApi, type StaffMember } from "../../lib/staffApi";
import { ModalBackdrop } from "../../components/ModalBackdrop";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";

export const Route = createFileRoute("/admin/staff")({
  head: () => ({ meta: [{ title: "Staff — Mithara Admin" }] }),
  component: StaffPage,
});

const inputCls =
  "h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-[#d39c54] focus:outline-none focus:ring-4 focus:ring-[#d39c54]/20";

function StaffPage() {
  // Shown instantly from the last visit (or the sign-in warm-up) while a quiet refresh brings it up to date.
  const [staff, setStaff] = useCachedState<StaffMember[]>(STAFF_LIST_CACHE_KEY, []);
  const [loading, setLoading] = useState(() => !hasCache(STAFF_LIST_CACHE_KEY));
  const [notMigrated, setNotMigrated] = useState(false);
  const [needsKey, setNeedsKey] = useCachedState<boolean>(STAFF_SETUP_CACHE_KEY, false);

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [resetting, setResetting] = useState<StaffMember | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "disable" | "enable" | "remove"; person: StaffMember } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("staff_members").select("*").order("created_at", { ascending: true });
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") setNotMigrated(true);
      else toast.error("Could not load staff");
    } else {
      setNotMigrated(false);
      setStaff((data as StaffMember[]) ?? []);
    }
    setLoading(false);
  }, [setStaff]);

  useEffect(() => {
    void load();
    // Is the secret key set up on the server? (decides whether to show the one-time setup notice)
    staffApi<{ configured: boolean }>("status")
      .then((r) => setNeedsKey(!r.configured))
      .catch(() => undefined);
  }, [load, setNeedsKey]);

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const { kind, person } = confirm;
      if (kind === "remove") await staffApi("remove", { userId: person.user_id });
      else await staffApi("set_active", { userId: person.user_id, active: kind === "enable" });
      toast.success(kind === "remove" ? "Staff member removed" : kind === "enable" ? "Access switched on" : "Access switched off");
      setConfirm(null);
      await load();
    } catch (e) {
      toast.error(e instanceof StaffApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-foreground">Staff &amp; access</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Give each person a sign-in and choose what they can do. A person can have more than one role.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          disabled={notMigrated}
          className="inline-flex items-center gap-2 rounded-full bg-[#d39c54] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#c08a42] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add staff
        </button>
      </div>

      {notMigrated && (
        <Notice tone="warn" title="One more setup step">
          The staff database update has not been run yet. In Supabase, open <b>SQL Editor</b>, paste the contents of{" "}
          <code>supabase/migrations/014_staff_roles.sql</code> and press <b>Run</b>. Then refresh this page.
        </Notice>
      )}
      {needsKey && !notMigrated && (
        <Notice tone="warn" title="One-time setup needed before you can add staff">
          Creating logins needs a secret key stored on the server (never in the browser). In Supabase go to{" "}
          <b>Project Settings → API</b> and copy the <b>service_role</b> key. Then in Vercel open <b>Settings → Environment Variables</b>,
          add it as <code>SUPABASE_SERVICE_ROLE_KEY</code> and redeploy. You only do this once.
        </Notice>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STAFF_ROLES.map((r) => (
          <div key={r} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">{ROLE_INFO[r].label}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ROLE_INFO[r].description}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-3xl border border-border bg-card">
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : staff.length === 0 ? (
          <div className="p-10 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-medium text-foreground">No staff yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add your kitchen, counter and delivery team so each person sees only what they need.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {staff.map((p) => (
              <li key={p.user_id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#282345] text-sm font-semibold text-[#ebb976]">
                  {(p.display_name[0] ?? "?").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                    {p.display_name}
                    {!p.active && (
                      <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-600">
                        Access off
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">Signs in as {p.login_name}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.roles.map((r) => (
                      <span key={r} className="rounded-full bg-[#d39c54]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#9a6420]">
                        {ROLE_INFO[r].label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <IconBtn label="Edit roles" onClick={() => setEditing(p)}>
                    <Pencil className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn label="Reset password" onClick={() => setResetting(p)}>
                    <KeyRound className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn
                    label={p.active ? "Switch access off" : "Switch access on"}
                    onClick={() => setConfirm({ kind: p.active ? "disable" : "enable", person: p })}
                  >
                    {p.active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                  </IconBtn>
                  <IconBtn label="Remove" danger onClick={() => setConfirm({ kind: "remove", person: p })}>
                    <Trash2 className="h-4 w-4" />
                  </IconBtn>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showAdd && (
        <AddStaffModal
          onClose={() => setShowAdd(false)}
          onNeedsKey={() => setNeedsKey(true)}
          onDone={() => {
            void load();
          }}
        />
      )}
      {editing && (
        <EditStaffModal
          person={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {resetting && <ResetPasswordModal person={resetting} onClose={() => setResetting(null)} />}

      {confirm && (
        <ConfirmDialog
          title={
            confirm.kind === "remove"
              ? `Remove ${confirm.person.display_name}?`
              : confirm.kind === "disable"
                ? `Switch off ${confirm.person.display_name}'s access?`
                : `Switch on ${confirm.person.display_name}'s access?`
          }
          intro={
            confirm.kind === "remove"
              ? "Their login is deleted for good."
              : confirm.kind === "disable"
                ? "They are signed out of the system and cannot sign in until you switch it back on."
                : "They can sign in again with their existing password."
          }
          effects={
            confirm.kind === "remove"
              ? ["Orders and invoices they handled stay exactly as they are.", "This cannot be undone. To give access again, add them as new staff."]
              : []
          }
          confirmLabel={confirm.kind === "remove" ? "Remove" : confirm.kind === "disable" ? "Switch off" : "Switch on"}
          tone={confirm.kind === "enable" ? "default" : "danger"}
          busy={busy}
          onConfirm={() => void runConfirm()}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

/* ----------------------------- small pieces ----------------------------- */

function Notice({ tone, title, children }: { tone: "warn"; title: string; children: React.ReactNode }) {
  void tone;
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-foreground">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 leading-relaxed text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs">
        {children}
      </p>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background transition ${
        danger ? "text-rose-600 hover:border-rose-400 hover:bg-rose-500/10" : "text-foreground hover:border-[#d39c54] hover:bg-[#d39c54]/10"
      }`}
    >
      {children}
    </button>
  );
}

function ModalCard({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <ModalBackdrop onClose={onClose}>
      <div className="admin-theme relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-2xl">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
        <h2 className="pr-8 font-serif text-2xl font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </ModalBackdrop>
  );
}

function RolePicker({ value, onChange }: { value: StaffRole[]; onChange: (v: StaffRole[]) => void }) {
  const toggle = (r: StaffRole) => onChange(value.includes(r) ? value.filter((x) => x !== r) : [...value, r]);
  return (
    <div className="space-y-2">
      {STAFF_ROLES.map((r) => {
        const on = value.includes(r);
        return (
          <button
            key={r}
            type="button"
            onClick={() => toggle(r)}
            className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${
              on ? "border-[#d39c54] bg-[#d39c54]/10" : "border-border bg-background hover:border-[#d39c54]/60"
            }`}
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                on ? "border-[#d39c54] bg-[#d39c54] text-white" : "border-border bg-card"
              }`}
            >
              {on && <Check className="h-3.5 w-3.5" />}
            </span>
            <span>
              <span className="block text-sm font-semibold text-foreground">{ROLE_INFO[r].label}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{ROLE_INFO[r].description}</span>
            </span>
          </button>
        );
      })}
      {value.includes("manager") && value.length > 1 && (
        <p className="text-xs text-muted-foreground">
          A Manager can already do everything the Counter, Kitchen and Delivery roles can, so the extra roles add nothing for them.
        </p>
      )}
    </div>
  );
}

function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(true);
  return (
    <div>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="new-password"
          className={`${inputCls} pr-11 font-mono`}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <button type="button" onClick={() => onChange(generatePassword())} className="mt-2 text-xs font-semibold text-[#b9772a] hover:underline">
        Generate a password for me
      </button>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-semibold text-foreground">{children}</label>;
}

function CopyBlock({ lines }: { lines: Array<[string, string]> }) {
  const text = lines.map(([k, v]) => `${k}: ${v}`).join("\n");
  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4">
      {lines.map(([k, v]) => (
        <p key={k} className="flex justify-between gap-4 py-1 text-sm">
          <span className="text-muted-foreground">{k}</span>
          <span className="font-mono font-semibold text-foreground">{v}</span>
        </p>
      ))}
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(
            () => toast.success("Copied"),
            () => toast.error("Could not copy"),
          );
        }}
        className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground hover:border-[#d39c54]"
      >
        <Copy className="h-3.5 w-3.5" />
        Copy details
      </button>
    </div>
  );
}

/* ------------------------------- modals --------------------------------- */

function AddStaffModal({ onClose, onDone, onNeedsKey }: { onClose: () => void; onDone: () => void; onNeedsKey: () => void }) {
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState(() => generatePassword());
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ login: string; password: string; name: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const l = login.trim();
    if (!name.trim()) return toast.error("Please enter the person's name.");
    if (!l) return toast.error("Please choose a sign-in name.");
    if (l.includes("@") ? !isValidEmail(l) : !isValidUsername(l)) {
      return toast.error(
        l.includes("@") ? "That email address does not look right." : "Use letters and numbers only for the username, for example: ravi",
      );
    }
    if (password.length < 8) return toast.error("The password needs at least 8 characters.");
    if (roles.length === 0) return toast.error("Choose at least one role.");
    setBusy(true);
    try {
      await staffApi("create", { displayName: name.trim(), loginName: l, password, roles });
      setCreated({ login: l.toLowerCase(), password, name: name.trim() });
      onDone();
    } catch (err) {
      if (err instanceof StaffApiError && err.code === "not_configured") onNeedsKey();
      toast.error(err instanceof StaffApiError ? err.message : "Could not create the account");
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <ModalCard title={`${created.name} is ready`} subtitle="Share these details with them. When they first sign in they'll be offered the chance to choose their own password (they can skip it)." onClose={onClose}>
        <CopyBlock lines={[["Sign in as", created.login], ["Starting password", created.password]]} />
        <p className="mt-3 text-xs text-muted-foreground">
          This password is shown only now. If it gets lost, use “Reset password” on their row.
        </p>
        <button onClick={onClose} className="mt-5 h-11 w-full rounded-xl bg-[#282345] text-sm font-semibold text-white hover:bg-[#1c1733]">
          Done
        </button>
      </ModalCard>
    );
  }

  return (
    <ModalCard title="Add staff" subtitle="They'll see only the pages their roles allow." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label>Name</Label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ravi Kumar" maxLength={60} className={inputCls} />
        </div>
        <div>
          <Label>Sign-in name</Label>
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="a username like ravi, or an email address"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={inputCls}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">No email? Just pick a short username. They type this on the sign-in screen.</p>
        </div>
        <div>
          <Label>Starting password</Label>
          <PasswordField value={password} onChange={setPassword} />
        </div>
        <div>
          <Label>Roles (choose one or more)</Label>
          <RolePicker value={roles} onChange={setRoles} />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#282345] text-sm font-semibold text-white transition hover:bg-[#1c1733] disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
        </button>
      </form>
    </ModalCard>
  );
}

function EditStaffModal({ person, onClose, onSaved }: { person: StaffMember; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(person.display_name);
  const [roles, setRoles] = useState<StaffRole[]>(person.roles);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Please enter a name.");
    if (roles.length === 0) return toast.error("Choose at least one role.");
    setBusy(true);
    try {
      await staffApi("update", { userId: person.user_id, displayName: name.trim(), roles });
      toast.success("Saved. Changes apply within a couple of minutes.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof StaffApiError ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalCard title={`Edit ${person.display_name}`} subtitle={`Signs in as ${person.login_name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div>
          <Label>Name</Label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={inputCls} />
        </div>
        <div>
          <Label>Roles</Label>
          <RolePicker value={roles} onChange={setRoles} />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#282345] text-sm font-semibold text-white transition hover:bg-[#1c1733] disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
        </button>
      </form>
    </ModalCard>
  );
}

function ResetPasswordModal({ person, onClose }: { person: StaffMember; onClose: () => void }) {
  const [password, setPassword] = useState(() => generatePassword());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("The password needs at least 8 characters.");
    setBusy(true);
    try {
      await staffApi("reset_password", { userId: person.user_id, password });
      setDone(password);
    } catch (err) {
      toast.error(err instanceof StaffApiError ? err.message : "Could not reset the password");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <ModalCard title="Password reset" subtitle="When they next sign in they'll be offered the chance to choose their own password (they can skip it)." onClose={onClose}>
        <CopyBlock lines={[["Sign in as", person.login_name], ["Starting password", done]]} />
        <button onClick={onClose} className="mt-5 h-11 w-full rounded-xl bg-[#282345] text-sm font-semibold text-white hover:bg-[#1c1733]">
          Done
        </button>
      </ModalCard>
    );
  }

  return (
    <ModalCard title={`Reset password for ${person.display_name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label>New starting password</Label>
          <PasswordField value={password} onChange={setPassword} />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#282345] text-sm font-semibold text-white transition hover:bg-[#1c1733] disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset password"}
        </button>
      </form>
    </ModalCard>
  );
}
