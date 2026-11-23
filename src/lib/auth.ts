import { useEffect, useState } from "react";
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
 * Last known sign-in state. Every page that calls useAuth() used to start from "loading" and wait
 * for a fresh session check, so each page change flashed a spinner. Starting from the last known
 * state shows the page at once; the check below still runs and corrects it if anything changed.
 */
let lastAuth: AuthState | null = null;

export function useAuth(): AuthState {
  const [state, setStateRaw] = useState<AuthState>(
    () => lastAuth ?? { user: null, session: null, isAdmin: false, isLoading: true },
  );
  const setState = (next: AuthState) => {
    lastAuth = next;
    setStateRaw(next);
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      const user = session?.user ?? null;
      setState({
        user,
        session,
        isAdmin: isAdminUser(user),
        isLoading: false,
      });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setState({
        user,
        session,
        isAdmin: isAdminUser(user),
        isLoading: false,
      });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}

export async function signOut() {
  return await supabase.auth.signOut();
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
