import { supabase } from "./supabase";
import type { StaffRole } from "./roles";

/** A row of the staff list (Admin → Staff). */
export type StaffMember = {
  user_id: string;
  display_name: string;
  login_name: string;
  roles: StaffRole[];
  active: boolean;
  created_at: string;
};

export class StaffApiError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/**
 * Talks to the secure server endpoint (src/routes/api.staff.ts). It sends the Owner's own sign-in token;
 * the server refuses anyone else. Account creation needs the server because it uses a secret key that
 * must never reach the browser.
 */
export async function staffApi<T = Record<string, unknown>>(
  action: "status" | "create" | "update" | "reset_password" | "set_active" | "remove",
  payload: Record<string, unknown> = {},
): Promise<T & { ok: true }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new StaffApiError("Please sign in again.");

  let res: Response;
  try {
    res = await fetch("/api/staff", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    throw new StaffApiError("Could not reach the server. Check your internet connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new StaffApiError(data?.error || "Something went wrong. Please try again.", data?.code);
  }
  return data as T & { ok: true };
}

/** Easy-to-read starting password: no look-alike characters (0/O, 1/l/I). */
export function generatePassword(length = 10): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join("");
}
