import { useEffect, useSyncExternalStore } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { CustomerAddress, CustomerProfile } from "./types";

export type AuthState = {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isLoading: boolean;
};

export function isAdminUser(user: User | null): boolean {
  if (!user) return false;
  return user.app_metadata?.role === "admin";
}

/**
 * One shared sign-in state for the whole app.
 *
 * Before, every useAuth() call kept its own copy and only listened for sign-in changes while it was
 * mounted. The admin login screen mounts no useAuth(), so signing in there updated nothing: the
 * dashboard then started from the old "signed out" copy, decided you were not an admin and sent you
 * straight back to the login screen. Now a single listener updates one store that every page reads,
 * so the state is always the real one (and is primed by the login screen the moment sign-in succeeds).
 */
const LOADING: AuthState = { user: null, session: null, isAdmin: false, isLoading: true };
let state: AuthState = LOADING;
let started = false;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function setAuth(session: Session | null) {
  const user = session?.user ?? null;
  state = { user, session, isAdmin: isAdminUser(user), isLoading: false };
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
 * fills the shared sign-in store, and says whether this visitor is an administrator. Because the
 * answer is known up front, a signed-out visitor is sent to the sign-in screen without any admin
 * page (or "verifying" screen) appearing first. Browser only; on the server it answers false.
 */
export async function getAdminAccess(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  startAuth();
  if (!state.isLoading) return state.isAdmin;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    setAuth(session);
    return isAdminUser(session?.user ?? null);
  } catch {
    setAuth(null);
    return false;
  }
}

export function useAuth(): AuthState {
  useEffect(() => {
    startAuth();
  }, []);
  return useSyncExternalStore(subscribe, () => state, () => LOADING);
}

export async function signOut() {
  const result = await supabase.auth.signOut();
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
