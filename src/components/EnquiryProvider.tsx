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

  // Latest list for announcements only. State updates below stay purely functional.
  const linesRef = React.useRef(lines);
  linesRef.current = lines;

  const addLine = React.useCallback(
    (input: AddInput) => {
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
    [announce],
  );

  const setQty = React.useCallback((key: string, qty: number) => {
    setLines((prev) =>
      qty < 1
        ? prev.filter((l) => l.key !== key)
        : prev.map((l) => (l.key === key ? { ...l, qty: clampQty(qty) } : l)),
    );
  }, []);

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
  }, [lines, hydrated, open, form, addLine, setQty, setNote, removeLine, clearAll, updateForm]);

  return (
    <EnquiryContext.Provider value={value}>
      {children}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </EnquiryContext.Provider>
  );
}
