import * as React from "react";
import {
  DEFAULT_FORM,
  MAX_ITEM_NOTE,
  MAX_LINES,
  MAX_QTY,
  clampQty,
  estimateTotal,
  loadStored,
  makeKey,
  saveStored,
  type EnquiryForm,
  type EnquiryLine,
} from "../lib/enquiry";
import { isStoreClosed, useStoreSettings } from "../lib/settings";
import { toast } from "sonner";

type AddInput = {
  category: string;
  name: string;
  /** Stable id of the pack option ("6pc", "std"…), used to build the line key. */
  variantId: string;
  /** Human label of the pack option ("6 pc") or "". */
  variant: string;
  unitPrice: number | null;
};

type EnquiryContextValue = {
  lines: EnquiryLine[];
  totalQty: number;
  estimate: number;
  hasUnpriced: boolean;
  hydrated: boolean;
  /** True while the shop is closed for orders (holiday mode, or outside the order window). */
  storeClosed: boolean;
  /** Why it is closed, ready to show the customer. Empty when open. */
  storeClosedReason: string;

  open: boolean;
  setOpen: (open: boolean) => void;

  getQty: (key: string) => number;
  addLine: (input: AddInput) => void;
  setQty: (key: string, qty: number) => void;
  setNote: (key: string, note: string) => void;
  removeLine: (key: string) => void;
  clearAll: () => void;

  form: EnquiryForm;
  updateForm: (patch: Partial<EnquiryForm>) => void;
};

const EnquiryContext = React.createContext<EnquiryContextValue | null>(null);

export function useEnquiry(): EnquiryContextValue {
  const ctx = React.useContext(EnquiryContext);
  if (!ctx) throw new Error("useEnquiry must be used inside <EnquiryProvider>");
  return ctx;
}

export function EnquiryProvider({ children }: { children: React.ReactNode }) {
  // Server and first client render are always empty, so hydration can never mismatch.
  const [lines, setLines] = React.useState<EnquiryLine[]>([]);
  const [form, setForm] = React.useState<EnquiryForm>(DEFAULT_FORM);
  const [hydrated, setHydrated] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");

  // Live "is the shop closed?" status. Settings update on their own (see useStoreSettings); the clock
  // tick re-evaluates the cutoff time, which changes without any settings change.
  const settings = useStoreSettings();
  const [clock, setClock] = React.useState(0);
  React.useEffect(() => {
    const t = window.setInterval(() => setClock((c) => c + 1), 15000);
    return () => window.clearInterval(t);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const store = React.useMemo(() => isStoreClosed(settings), [settings, clock]);
  // Always-fresh copy for the add / quantity handlers, so they judge the moment of the tap.
  const settingsRef = React.useRef(settings);
  settingsRef.current = settings;

  // Load once after mount.
  React.useEffect(() => {
    const stored = loadStored();
    if (stored) {
      setLines(stored.lines);
    }
    setHydrated(true);
  }, []);

  // Save after every change, but never before the initial load (that would wipe a saved list).
  React.useEffect(() => {
    if (!hydrated) return;
    saveStored({ lines });
  }, [hydrated, lines]);

  const announce = React.useCallback((msg: string) => {
    // Toggle a trailing space so identical consecutive messages are still announced.
    setAnnouncement((prev) => (prev === msg ? msg + "\u00a0" : msg));
  }, []);

  /** True (and tells the customer why) when the shop is closed right now. Judges the moment of the tap. */
  const refuseIfClosed = React.useCallback((): boolean => {
    const live = isStoreClosed(settingsRef.current);
    if (!live.closed) return false;
    const msg = live.reason || "We are closed right now and not accepting orders.";
    toast.error(msg, { id: "store-closed" });
    announce(msg);
    return true;
  }, [announce]);

  // Latest list for announcements only. State updates below stay purely functional.
  const linesRef = React.useRef(lines);
  linesRef.current = lines;

  const addLine = React.useCallback(
    (input: AddInput) => {
      if (refuseIfClosed()) return;
      const key = makeKey(input.category, input.name, input.variantId);
      const current = linesRef.current;
      const existing = current.find((l) => l.key === key);

      if (!existing && current.length >= MAX_LINES) {
        announce("Your enquiry list is full. Please send it first or remove an item.");
        return;
      }

      setLines((prev) => {
        const found = prev.find((l) => l.key === key);
        if (found) {
          return prev.map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, l.qty + 1) } : l));
        }
        if (prev.length >= MAX_LINES) return prev;
        return [
          ...prev,
          {
            key,
            category: input.category,
            name: input.name,
            variantId: input.variantId,
            variant: input.variant,
            unitPrice: input.unitPrice,
            qty: 1,
            note: "",
          },
        ];
      });

      announce(
        existing
          ? `${input.name} quantity ${Math.min(MAX_QTY, existing.qty + 1)}`
          : `Added ${input.name} to your enquiry list`,
      );
    },
    [announce, refuseIfClosed],
  );

  const setQty = React.useCallback(
    (key: string, qty: number) => {
      // While closed the customer may still lower quantities or remove items, but not add more.
      const existing = linesRef.current.find((l) => l.key === key);
      if (existing && qty > existing.qty && refuseIfClosed()) return;
      setLines((prev) =>
        qty < 1
          ? prev.filter((l) => l.key !== key)
          : prev.map((l) => (l.key === key ? { ...l, qty: clampQty(qty) } : l)),
      );
    },
    [refuseIfClosed],
  );

  const setNote = React.useCallback((key: string, note: string) => {
    const value = note.replace(/[\r\n]+/g, " ").slice(0, MAX_ITEM_NOTE);
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, note: value } : l)));
  }, []);

  const removeLine = React.useCallback(
    (key: string) => {
      setLines((prev) => prev.filter((l) => l.key !== key));
      announce("Item removed from your enquiry list");
    },
    [announce],
  );

  const clearAll = React.useCallback(() => {
    setLines([]);
    announce("Enquiry list cleared");
  }, [announce]);

  const updateForm = React.useCallback((patch: Partial<EnquiryForm>) => {
    setForm((f) => ({ ...f, ...patch }));
  }, []);

  const value = React.useMemo<EnquiryContextValue>(() => {
    const { total, hasUnpriced } = estimateTotal(lines);
    const qtyByKey = new Map(lines.map((l) => [l.key, l.qty]));
    return {
      lines,
      totalQty: lines.reduce((s, l) => s + l.qty, 0),
      estimate: total,
      hasUnpriced,
      hydrated,
      storeClosed: store.closed,
      storeClosedReason: store.reason,
      open,
      setOpen,
      getQty: (key) => qtyByKey.get(key) ?? 0,
      addLine,
      setQty,
      setNote,
      removeLine,
      clearAll,
      form,
      updateForm,
    };
  }, [lines, hydrated, store.closed, store.reason, open, form, addLine, setQty, setNote, removeLine, clearAll, updateForm]);

  return (
    <EnquiryContext.Provider value={value}>
      {children}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </EnquiryContext.Provider>
  );
}
