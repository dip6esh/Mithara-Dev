import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { STAFF_ROLES, isValidEmail, isValidUsername, loginNameToEmail, type StaffRole } from "../lib/roles";

/**
 * Staff account management for the Owner (Admin → Staff page). Runs on the SERVER only.
 *
 * Creating a login needs Supabase's powerful "service role" key. That key lives only in the server's
 * environment (SUPABASE_SERVICE_ROLE_KEY on Vercel) and is never sent to a browser. Every request must
 * carry the caller's own sign-in token, and is refused unless that caller is the Owner. Even then it can
 * only touch accounts that already appear in the staff list, never the Owner or a customer.
 */

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const env = (...names: string[]) => {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return undefined;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function configured() {
  const url = env("SUPABASE_URL", "VITE_SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY");
  const service = env("SUPABASE_SERVICE_ROLE_KEY");
  return { url, anon, service };
}

/** Who is calling? Must be signed in as the Owner. */
async function requireOwner(request: Request, url: string, anon: string) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, "Please sign in again.");
  const { data, error } = await createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } }).auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Your session has expired. Please sign in again.");
  if (data.user.app_metadata?.role !== "admin") throw new HttpError(403, "Only the owner can manage staff.");
  return data.user;
}

const cleanRoles = (v: unknown): StaffRole[] => {
  if (!Array.isArray(v)) throw new HttpError(400, "Choose at least one role.");
  const roles = [...new Set(v.map(String))].filter((r): r is StaffRole => STAFF_ROLES.includes(r as StaffRole));
  if (roles.length === 0) throw new HttpError(400, "Choose at least one role.");
  return roles;
};

const cleanName = (v: unknown) => {
  const s = String(v ?? "").trim();
  if (s.length < 1 || s.length > 60) throw new HttpError(400, "Please enter the person's name (up to 60 characters).");
  return s;
};

const cleanPassword = (v: unknown) => {
  const s = String(v ?? "");
  if (s.length < 8) throw new HttpError(400, "The password must be at least 8 characters.");
  if (s.length > 72) throw new HttpError(400, "The password is too long (72 characters at most).");
  return s;
};

/** The target must already be in the staff list: this endpoint never touches the Owner or customers. */
async function requireStaffTarget(admin: SupabaseClient, userId: unknown) {
  const id = String(userId ?? "");
  if (!UUID.test(id)) throw new HttpError(400, "Unknown staff member.");
  const { data, error } = await admin.from("staff_members").select("user_id, login_name").eq("user_id", id).maybeSingle();
  if (error) throw new HttpError(500, "Could not look up that staff member.");
  if (!data) throw new HttpError(404, "That staff member was not found.");
  return data as { user_id: string; login_name: string };
}

async function handle(request: Request): Promise<Response> {
  const { url, anon, service } = configured();
  if (!url || !anon) throw new HttpError(503, "The server is missing its Supabase address.", "not_configured");

  await requireOwner(request, url, anon);

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Bad request.");
  }
  const action = String(body.action ?? "");

  // Lets the Staff page show a friendly "one-time setup needed" message instead of a failed button.
  if (action === "status") return json({ ok: true, configured: !!service });

  if (!service) {
    throw new HttpError(
      503,
      "Staff accounts are not switched on yet. The server needs the SUPABASE_SERVICE_ROLE_KEY setting.",
      "not_configured",
    );
  }
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  switch (action) {
    case "create": {
      const displayName = cleanName(body.displayName);
      const roles = cleanRoles(body.roles);
      const password = cleanPassword(body.password);
      const loginName = String(body.loginName ?? "").trim();
      const isEmail = loginName.includes("@");
      if (isEmail ? !isValidEmail(loginName) : !isValidUsername(loginName)) {
        throw new HttpError(
          400,
          isEmail
            ? "That email address does not look right."
            : "A username can use letters, numbers, dots, dashes and underscores (2 to 30 characters), for example ravi or ravi.k",
        );
      }
      const shownLogin = loginName.toLowerCase();

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: loginNameToEmail(shownLogin),
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName, login_name: shownLogin, must_change_password: true },
        // Never 'admin': that is the Owner. Staff permissions come from the staff list, not from here.
        app_metadata: { role: "staff" },
      });
      if (createErr || !created.user) {
        const msg = createErr?.message ?? "";
        if (/already|registered|exists/i.test(msg)) throw new HttpError(409, "That sign-in name is already in use.");
        throw new HttpError(400, msg || "Could not create the account.");
      }

      const { error: rowErr } = await admin.from("staff_members").insert({
        user_id: created.user.id,
        display_name: displayName,
        login_name: shownLogin,
        roles,
        active: true,
      });
      if (rowErr) {
        await admin.auth.admin.deleteUser(created.user.id); // leave nothing half-made
        if (rowErr.code === "42P01" || rowErr.code === "PGRST205") {
          throw new HttpError(503, "The staff database update (migration 014) has not been run yet.", "not_migrated");
        }
        throw new HttpError(500, "Could not save the staff member. Nothing was created.");
      }
      return json({ ok: true, userId: created.user.id, loginName: shownLogin });
    }

    case "update": {
      const target = await requireStaffTarget(admin, body.userId);
      const patch: Record<string, unknown> = {};
      if (body.displayName !== undefined) patch.display_name = cleanName(body.displayName);
      if (body.roles !== undefined) patch.roles = cleanRoles(body.roles);
      if (Object.keys(patch).length === 0) throw new HttpError(400, "Nothing to change.");
      const { error } = await admin.from("staff_members").update(patch).eq("user_id", target.user_id);
      if (error) throw new HttpError(500, "Could not save the changes.");
      if (patch.display_name) {
        const { data: u } = await admin.auth.admin.getUserById(target.user_id);
        await admin.auth.admin.updateUserById(target.user_id, {
          user_metadata: { ...(u?.user?.user_metadata ?? {}), display_name: patch.display_name },
        });
      }
      return json({ ok: true });
    }

    case "reset_password": {
      const target = await requireStaffTarget(admin, body.userId);
      const password = cleanPassword(body.password);
      const { data: u } = await admin.auth.admin.getUserById(target.user_id);
      const { error } = await admin.auth.admin.updateUserById(target.user_id, {
        password,
        user_metadata: { ...(u?.user?.user_metadata ?? {}), must_change_password: true },
      });
      if (error) throw new HttpError(400, error.message || "Could not reset the password.");
      return json({ ok: true });
    }

    case "set_active": {
      const target = await requireStaffTarget(admin, body.userId);
      const active = body.active === true;
      // Staff list first: that switches their access off in the database straight away.
      const { error } = await admin.from("staff_members").update({ active }).eq("user_id", target.user_id);
      if (error) throw new HttpError(500, "Could not change their status.");
      // Then block / allow new sign-ins.
      const { error: banErr } = await admin.auth.admin.updateUserById(target.user_id, {
        ban_duration: active ? "none" : "876000h",
      });
      if (banErr) throw new HttpError(500, "Their access was changed, but sign-in could not be updated.");
      return json({ ok: true });
    }

    case "remove": {
      const target = await requireStaffTarget(admin, body.userId);
      const { error } = await admin.auth.admin.deleteUser(target.user_id);
      if (error) throw new HttpError(500, "Could not remove that account.");
      return json({ ok: true });
    }

    default:
      throw new HttpError(400, "Unknown action.");
  }
}

export const Route = createFileRoute("/api/staff")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          return await handle(request);
        } catch (e) {
          if (e instanceof HttpError) return json({ ok: false, error: e.message, code: e.code }, e.status);
          console.error("staff api error:", e);
          return json({ ok: false, error: "Something went wrong on the server." }, 500);
        }
      },
    },
  },
});
