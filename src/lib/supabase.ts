import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!client) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        "Missing Supabase environment variables. " +
          "Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set."
      );
    }
    client = createClient(supabaseUrl, supabaseAnonKey);
  }
  return client;
}

/**
 * Lazy stand-in for the client. Creating it (and the missing-env error) is deferred to first
 * use, because this module is imported by components rendered on every route: throwing at
 * import time would take down the whole site instead of just the features that need Supabase.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const instance = getClient();
    const value = Reflect.get(instance, prop);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
