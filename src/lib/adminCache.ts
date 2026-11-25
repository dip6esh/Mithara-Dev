/**
 * Tiny in-memory cache for admin screens ("show what we had instantly, refresh quietly").
 *
 * Every admin page unmounts when you navigate away, which used to throw its data away, so coming
 * back meant a spinner and a full reload. Pages now keep their last result here: it is shown
 * immediately on return while a silent refresh brings it up to date. Lives only for the current
 * browser tab (a reload or sign-out starts clean).
 */
import { useCallback, useState } from "react";

/** Shared keys: one screen can warm another's cache so it opens instantly the first time too. */
export const SETTINGS_CACHE_KEY = "admin:settings:rows";

const store = new Map<string, unknown>();

export const hasCache = (key: string) => store.has(key);
export const cacheGet = <T,>(key: string): T | undefined => store.get(key) as T | undefined;
export const cacheSet = (key: string, value: unknown) => {
  store.set(key, value);
};

/** `useState` that starts from the cached value (if any) and writes every update back to the cache. */
export function useCachedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => (store.has(key) ? (store.get(key) as T) : initial));
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        store.set(key, v);
        return v;
      });
    },
    [key],
  );
  return [value, set] as const;
}
