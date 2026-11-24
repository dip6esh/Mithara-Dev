import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

export type NotificationKind = "new_order" | "low_stock" | "out_of_stock";

export type AdminNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  ref_id: string | null;
  created_at: string;
  /** null = unread */
  read_at: string | null;
};

type State = {
  items: AdminNotification[];
  unread: number;
  /** First successful load done. */
  ready: boolean;
  /** The table could not be read (migration 011 not run yet). */
  unavailable: boolean;
};

/* Shared state, outside React: every admin page mounts its own AdminLayout, and the bell must not
   forget what it knows (or flash empty) while the admin moves between pages. */
const INITIAL: State = { items: [], unread: 0, ready: false, unavailable: false };
let state: State = INITIAL;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const LIMIT = 50;
const TABLE = "admin_notifications";

function set(next: State) {
  state = next;
  emit();
}

/** Loads the latest notifications and the true unread count (which can be higher than the 50 shown). */
export async function refreshNotifications(): Promise<void> {
  try {
    const [list, count] = await Promise.all([
      supabase.from(TABLE).select("*").order("created_at", { ascending: false }).limit(LIMIT),
      supabase.from(TABLE).select("id", { count: "exact", head: true }).is("read_at", null),
    ]);
    if (list.error || !list.data) {
      if (!state.unavailable) set({ ...state, unavailable: true });
      return;
    }
    const items = list.data as AdminNotification[];
    const unread = count.count ?? items.filter((n) => !n.read_at).length;
    if (
      state.ready &&
      !state.unavailable &&
      state.unread === unread &&
      JSON.stringify(state.items) === JSON.stringify(items)
    ) {
      return; // nothing changed: do not re-render
    }
    set({ items, unread, ready: true, unavailable: false });
  } catch {
    /* offline: keep showing what we have */
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  const target = state.items.find((n) => n.id === id);
  if (!target || target.read_at) return;
  const now = new Date().toISOString();
  set({
    ...state,
    items: state.items.map((n) => (n.id === id ? { ...n, read_at: now } : n)),
    unread: Math.max(0, state.unread - 1),
  });
  const { error } = await supabase.from(TABLE).update({ read_at: now }).eq("id", id).is("read_at", null);
  if (error) void refreshNotifications();
}

export async function markAllNotificationsRead(): Promise<void> {
  if (state.unread === 0) return;
  const now = new Date().toISOString();
  set({
    ...state,
    items: state.items.map((n) => (n.read_at ? n : { ...n, read_at: now })),
    unread: 0,
  });
  const { error } = await supabase.from(TABLE).update({ read_at: now }).is("read_at", null);
  if (error) void refreshNotifications();
}

export function useNotifications(): State {
  return useSyncExternalStore(subscribe, () => state, () => INITIAL);
}
