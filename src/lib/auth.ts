import { useEffect, useSyncExternalStore } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { CustomerAddress, CustomerProfile } from "./types";
import { STAFF_ROLES, type AppRole, type StaffRole } from "./roles";

export type AuthState = {
  user: User | null;
  session: Session | null;
  /** True for the Owner and any ACTIVE staff member: may open the admin area. */
  isAdmin: boolean;
  /** True only for the Owner (the existing administrator account). */
  isOwner: boolean;
  /** Everything this person may do. ["owner"] for the Owner; their staff roles otherwise; [] for customers. */
  roles: AppRole[];
  /** Name shown in the sidebar (staff member's name, if they have one). */
  displayName: string | null;
  /** False while a staff member's roles are still being looked up (do not redirect yet). */
  rolesLoaded: boolean;
  isLoading: boolean;
};

/** The Owner: the account marked as "admin" (set up in Supabase, exactly as before). */
export function isAdminUser(user: User | null): boolean {
  if (!user) return false;
  return user.app_metadata?.role === "admin";
}

/* -------------------------------------------------------------------------- */
/*  Staff roles                                                               */
/* -------------------------------------------------------------------------- */

type StaffProfile = { roles: StaffRole[]; displayName: string | null };

const STAFF_CACHE_KEY = "mithara-staff-profile";
let staffProfile: StaffProfile | null = null;
/** The user id the staff roles above were loaded for (so a token refresh keeps them). */
let staffLoadedFor: string | null = null;
let staffInflight: Promise<void> | null = null;

function readStaffCache(userId: string): StaffProfile | null {
  try {
    const raw = window.localStorage.getItem(STAFF_CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v?.userId !== userId || !Array.isArray(v.roles)) return null;
    return { roles: v.roles.filter((r: unknown): r is StaffRole => STAFF_ROLES.includes(r as StaffRole)), displayName: v.displayName ?? null };
  } catch {
    return null;
  }
}
function writeStaffCache(userId: string, p: StaffProfile | null) {
  try {
    if (p) window.localStorage.setItem(STAFF_CACHE_KEY, JSON.stringify({ userId, ...p }));
    else window.localStorage.removeItem(STAFF_CACHE_KEY);
  } catch {
    /* storage unavailable: roles are simply looked up again next time */
  }
}

/**
 * Reads this person's staff row. Disabled staff, customers and the Owner have no active row (the Owner
 * does not need one). Returns "unavailable" on a network / database error so a blip never signs anyone out.
 */
async function fetchStaffProfile(userId: string): Promise<StaffProfile | null | "unavailable"> {
  try {
    const { data, error } = await supabase
      .from("staff_members")
      .select("roles, active, display_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      // Table missing (migration 014 not run yet) simply means: no staff roles exist.
      if (error.code === "42P01" || error.code === "PGRST205") return null;
      return "unavailable";
    }
    if (!data || !data.active) return null;
    const roles = ((data.roles as string[]) ?? []).filter((r): r is StaffRole => STAFF_ROLES.includes(r as StaffRole));
    return { roles, displayName: (data.display_name as string) ?? null };
  } catch {
    return "unavailable";
  }
}

/**
 * Makes sure this signed-in person's staff roles are known. Cheap: one tiny query, then remembered.
 * `force` re-reads them (used by the periodic refresh so a role change or "disable" applies quickly).
 */
export async function ensureStaffRoles(force = false): Promise<void> {
  const user = state.user;
  if (!user || isAdminUser(user)) return;
  if (!force && staffLoadedFor === user.id) return;
  if (staffInflight) return staffInflight;
  const uid = user.id;
  staffInflight = (async () => {
    const result = await fetchStaffProfile(uid);
    if (state.user?.id !== uid) return; // signed out / switched account while loading
    if (result === "unavailable") {
      // Keep working with what we knew last time rather than locking someone out on a network blip.
      staffProfile = staffLoadedFor === uid ? staffProfile : readStaffCache(uid);
      staffLoadedFor = uid;
    } else {
      staffProfile = result;
      staffLoadedFor = uid;
      writeStaffCache(uid, result);
    }
    state = computeState(state.session);
    listeners.forEach((l) => l());
  })().finally(() => {
    staffInflight = null;
  });
  return staffInflight;
}

/** Re-read roles now (Owner changed something, or the screen woke up). */
export const refreshStaffRoles = () => ensureStaffRoles(true);

/* -------------------------------------------------------------------------- */
/*  Shared sign-in state                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One shared sign-in state for the whole app.
 *
 * Before, every useAuth() call kept its own copy and only listened for sign-in changes while it was
 * mounted. The admin login screen mounts no useAuth(), so signing in there updated nothing: the
 * dashboard then started from the old "signed out" copy, decided you were not an admin and sent you
 * straight back to the login screen. Now a single listener updates one store that every page reads,
 * so the state is always the real one (and is primed by the login screen the moment sign-in succeeds).
 */
const LOADING: AuthState = {
  user: null,
  session: null,
  isAdmin: false,
  isOwner: false,
  roles: [],
  displayName: null,
  rolesLoaded: false,
  isLoading: true,
};
let state: AuthState = LOADING;
let started = false;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function computeState(session: Session | null): AuthState {
  const user = session?.user ?? null;
  const owner = isAdminUser(user);
  const staffKnown = !!user && !owner && staffLoadedFor === user.id;
  const roles: AppRole[] = owner ? ["owner"] : staffKnown && staffProfile ? staffProfile.roles : [];
  const displayName = owner
    ? ((user?.user_metadata?.display_name as string | undefined) ?? null)
    : staffKnown
      ? (staffProfile?.displayName ?? null)
      : null;
  return {
    user,
    session,
    isOwner: owner,
    roles,
    isAdmin: roles.length > 0,
    displayName,
    // Signed out, the Owner and customers need no lookup; a staff member is "loaded" once their row was read.
    rolesLoaded: !user || owner || staffKnown,
    isLoading: false,
  };
}

function setAuth(session: Session | null) {
  const user = session?.user ?? null;
  if (!user || staffLoadedFor !== user.id) {
    // A different person (or signed out): forget the previous person's roles.
    staffProfile = null;
    staffLoadedFor = null;
  }
  state = computeState(session);
  listeners.forEach((l) => l());
}

/** Tell the app about a sign-in / sign-out right away, without waiting for the listener. */
export function primeAuth(session: Session | null) {
  setAuth(session);
}

/** Starts the single listener (browser only, once). Done lazily so a missing env never breaks import. */
function startAuth() {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    supabase.auth.onAuthStateChange((_event, session) => setAuth(session));
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => setAuth(session))
      .catch(() => setAuth(null));
  } catch {
    started = false;
    setAuth(null);
  }
}

/**
 * Used by the router BEFORE any admin page is drawn: reads the saved session (a quick local read),
 * fills the shared sign-in store, looks up a staff member's roles, and returns everything this visitor
 * may do. Empty means "not allowed in the admin". Because the answer is known up front, a signed-out
 * visitor is sent to the sign-in screen without any admin page (or "verifying" screen) appearing first.
 * Browser only; on the server it answers [].
 */
export async function getAdminRoles(): Promise<AppRole[]> {
  if (typeof window === "undefined") return [];
  startAuth();
  if (state.isLoading) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setAuth(session);
    } catch {
      setAuth(null);
      return [];
    }
  }
  await ensureStaffRoles();
  return state.roles;
}

/** Can this visitor open the admin at all (Owner or active staff)? */
export async function getAdminAccess(): Promise<boolean> {
  return (await getAdminRoles()).length > 0;
}

export function useAuth(): AuthState {
  useEffect(() => {
    startAuth();
  }, []);
  return useSyncExternalStore(subscribe, () => state, () => LOADING);
}

export async function signOut() {
  const result = await supabase.auth.signOut();
  staffProfile = null;
  staffLoadedFor = null;
  try {
    window.localStorage.removeItem(STAFF_CACHE_KEY);
  } catch {
    /* ignore */
  }
  setAuth(null);
  return result;
}

/* -------------------------------------------------------------------------- */
/*  Customer Profile & Addresses                                              */
/* -------------------------------------------------------------------------- */

export async function fetchCustomerProfile(userId: string): Promise<CustomerProfile | null> {
  const { data, error } = await supabase
    .from("customer_profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    console.error("Error fetching customer profile:", error);
    return null;
  }
  return data;
}

export async function upsertCustomerProfile(profile: {
  id: string;
  name: string;
  phone: string;
}): Promise<CustomerProfile | null> {
  const { data, error } = await supabase
    .from("customer_profiles")
    .upsert(profile)
    .select()
    .single();

  if (error) {
    console.error("Error upserting customer profile:", error);
    throw error;
  }
  return data;
}

export async function fetchCustomerAddresses(customerId: string): Promise<CustomerAddress[]> {
  const { data, error } = await supabase
    .from("customer_addresses")
    .select("*")
    .eq("customer_id", customerId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching addresses:", error);
    return [];
  }
  return data || [];
}

export async function saveCustomerAddress(
  address: Omit<CustomerAddress, "id" | "created_at" | "updated_at"> & { id?: string }
): Promise<CustomerAddress> {
  if (address.is_default) {
    // Unset other defaults for this customer
    await supabase
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("customer_id", address.customer_id);
  }

  const { data, error } = await supabase
    .from("customer_addresses")
    .upsert(address)
    .select()
    .single();

  if (error) {
    console.error("Error saving address:", error);
    throw error;
  }
  return data;
}

export async function deleteCustomerAddress(addressId: string, customerId: string): Promise<void> {
  const { error } = await supabase
    .from("customer_addresses")
    .delete()
    .eq("id", addressId)
    .eq("customer_id", customerId);

  if (error) {
    console.error("Error deleting address:", error);
    throw error;
  }
}
