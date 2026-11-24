import { supabase } from "./supabase";

let lastRun = 0;

/**
 * Asks the database to refill every item's stock to its daily limit if a new day (IST) has started.
 * Cheap and safe to call often: it does nothing when stock is already today's, and this wrapper skips
 * the call if it ran in the last 20 seconds. Never throws; before migration 010 it simply does nothing.
 */
export async function refreshDailyStock(force = false): Promise<void> {
  if (!force && Date.now() - lastRun < 20_000) return;
  lastRun = Date.now();
  try {
    await supabase.rpc("refresh_daily_stock");
  } catch {
    /* offline or not migrated yet: stock numbers simply stay as they are */
  }
}
