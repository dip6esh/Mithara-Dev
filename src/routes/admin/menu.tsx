import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "../../lib/supabase";
import { refreshDailyStock } from "../../lib/dailyStock";
import { useProductsRealtime } from "../../hooks/useAdminOrders";
import { cacheGet, cacheSet, hasCache, useCachedState } from "../../lib/adminCache";
import { Product, ProductCategory, ProductStatus, ProductVariant } from "../../lib/types";
import {
  UtensilsCrossed,
  Plus,
  Search,
  Edit2,
  Trash2,
  Copy,
  RefreshCw,
  Sparkles,
  GripVertical,
  ChevronDown,
  CheckCircle2,
  Ban,
  EyeOff,
  Pencil,
  X,
  Check,
  AlertTriangle,
  Flame,
  Star,
  ImageIcon,
  PackageCheck,
  PackageX,
  CircleDashed,
  IndianRupee,
} from "lucide-react";
import { toast } from "sonner";
import { CountUp } from "../../components/admin/CountUp";
import { ModalBackdrop } from "../../components/ModalBackdrop";

export const Route = createFileRoute("/admin/menu")({
  head: () => ({
    meta: [{ title: "Mithara Admin — Menu & Stock Control" }],
  }),
  component: AdminMenuPage,
});

const ALLERGEN_OPTIONS = [
  "dairy",
  "gluten",
  "nuts",
  "soy",
  "egg",
  "sesame",
  "spices",
  "peanuts",
  "fish",
  "shellfish",
  "mustard",
  "sulphites",
];

const CATEGORY_STYLE: Record<string, { label: string; grad: string }> = {
  kunafa: { label: "Kunafa", grad: "from-[#d39c54] via-[#c48b3f] to-[#8f5a17]" },
  baklava: { label: "Baklava", grad: "from-[#6d5fb3] via-[#4b4189] to-[#2c2650]" },
  gelato: { label: "Gelato", grad: "from-[#3a3360] via-[#2c2650] to-[#1c1733]" },
};

type StatusMeta = {
  label: string;
  desc: string;
  dot: string;
  text: string;
  tile: string;
  icon: React.ComponentType<{ className?: string }>;
};

const STATUS_META: Record<string, StatusMeta> = {
  active: { label: "Active", desc: "Visible & orderable", dot: "bg-emerald-500", text: "text-emerald-700", tile: "bg-emerald-500/12 text-emerald-600", icon: CheckCircle2 },
  sold_out: { label: "Sold out", desc: "Visible, not orderable", dot: "bg-rose-500", text: "text-rose-700", tile: "bg-rose-500/12 text-rose-600", icon: Ban },
  hidden: { label: "Hidden", desc: "Not shown on the website", dot: "bg-amber-500", text: "text-amber-800", tile: "bg-amber-500/15 text-amber-700", icon: EyeOff },
  draft: { label: "Draft", desc: "Still being prepared", dot: "bg-slate-400", text: "text-slate-600", tile: "bg-slate-500/12 text-slate-600", icon: Pencil },
};
const STATUS_ORDER: ProductStatus[] = ["active", "sold_out", "hidden", "draft"];

/** Status badge that opens a small menu. The menu is portalled to <body> so the card's overflow can't clip it. */
function StatusMenu({
  status,
  name,
  onChange,
}: {
  status: ProductStatus;
  name: string;
  onChange: (next: ProductStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const meta = STATUS_META[status] ?? STATUS_META.draft;

  const toggle = () => {
    if (open) return setOpen(false);
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) {
      const width = 232;
      const height = 4 * 58 + 44;
      const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
      const top = r.bottom + 8 + height > window.innerHeight ? Math.max(8, r.top - height - 8) : r.bottom + 8;
      setPos({ left, top });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Status for ${name}: ${meta.label}. Change status`}
        className="adm-no-lift group/status inline-flex items-center gap-2 rounded-full bg-white/95 py-1 pr-1.5 pl-2.5 text-[11px] font-semibold text-[#1c1733] shadow-md shadow-black/10 ring-1 ring-black/5 backdrop-blur hover:shadow-lg"
      >
        <span className="relative flex h-2 w-2">
          {status === "active" && (
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${meta.dot}`} />
          )}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${meta.dot}`} />
        </span>
        <span className={meta.text}>{meta.label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 rounded-full text-[#6b6488] transition-transform duration-300 group-hover/status:text-[#1c1733] ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ left: pos.left, top: pos.top }}
            className="adm-modal fixed z-[80] w-[232px] rounded-2xl bg-white p-1.5 text-[#1c1733] shadow-2xl shadow-[#282345]/30 ring-1 ring-black/5"
          >
            <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold tracking-[0.16em] text-[#6b6488] uppercase">
              Set status
            </p>
            {STATUS_ORDER.map((key) => {
              const m = STATUS_META[key];
              const Icon = m.icon;
              const current = key === status;
              return (
                <button
                  key={key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={current}
                  onClick={() => {
                    setOpen(false);
                    if (!current) onChange(key);
                  }}
                  className={`adm-no-lift flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors ${
                    current ? "bg-[#f5f3fa]" : "hover:bg-[#f5f3fa]"
                  }`}
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${m.tile}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold">{m.label}</span>
                    <span className="block text-[11px] text-[#6b6488]">{m.desc}</span>
                  </span>
                  {current && <Check className="h-4 w-4 shrink-0 text-[#a8691d]" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}

const DIETARY_SUGGESTIONS = ["Vegetarian", "Eggless", "Vegan", "Gluten-free", "Contains alcohol"];
const INGREDIENT_SUGGESTIONS = ["Flour", "Sugar", "Milk", "Cream", "Butter", "Pistachios", "Saffron", "Lemon"];

const cleanList = (list?: string[] | null) =>
  Array.from(new Set((list ?? []).map((x) => x.trim()).filter(Boolean)));
const cleanText = (v?: string | null) => (v && v.trim() ? v.trim() : null);

const isMissingColumnError = (err: any) =>
  err?.code === "PGRST204" ||
  err?.code === "42703" ||
  /column .* (does not exist|of relation)|could not find the .* column|schema cache/i.test(err?.message ?? "");

/** Chip-style list input: type a value and press Enter or comma. Backspace on empty removes the last chip. */
function TagInput({
  value,
  onChange,
  placeholder,
  suggestions = [],
  label,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  label: string;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(",").map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    parts.forEach((part) => {
      if (!next.some((x) => x.toLowerCase() === part.toLowerCase())) next.push(part);
    });
    onChange(next);
    setDraft("");
  };
  const remaining = suggestions.filter((sg) => !value.some((x) => x.toLowerCase() === sg.toLowerCase()));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-neutral-800 bg-neutral-950 p-2 focus-within:border-amber-500">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/15 py-1 pr-1 pl-2.5 text-xs font-medium text-amber-200"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={() => onChange(value.filter((x) => x !== tag))}
              className="adm-no-lift flex h-5 w-5 items-center justify-center rounded-md text-amber-300/70 hover:bg-amber-500/20 hover:text-amber-100"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          aria-label={label}
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(",")) add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => add(draft)}
          placeholder={value.length ? "Add another…" : placeholder}
          className="min-w-[8rem] flex-1 bg-transparent p-1 text-base text-neutral-200 placeholder:text-neutral-500 focus:outline-none sm:text-xs"
        />
      </div>
      {remaining.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {remaining.map((sg) => (
            <button
              key={sg}
              type="button"
              onClick={() => onChange([...value, sg])}
              className="adm-no-lift rounded-lg border border-dashed border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-400 hover:border-amber-500/50 hover:text-amber-300"
            >
              + {sg}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const isUsableImage = (url?: string | null) =>
  !!url && (url.startsWith("http") || url.startsWith("/") || url.startsWith("data:"));

function stockInfo(p: Product): { level: "out" | "low" | "ok" | "unlimited"; pct: number; left: number } {
  if (p.daily_stock === null || p.daily_stock === undefined) return { level: "unlimited", pct: 100, left: 0 };
  const left = p.stock_remaining ?? p.daily_stock;
  if (left <= 0) return { level: "out", pct: 0, left: 0 };
  const pct = Math.min(100, Math.round((left / (p.daily_stock || 1)) * 100));
  return { level: pct <= 25 ? "low" : "ok", pct, left };
}

function CardImage({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  const cat = CATEGORY_STYLE[product.category] ?? CATEGORY_STYLE.kunafa;
  if (isUsableImage(product.image_url) && !failed) {
    return (
      <img
        src={product.image_url!}
        alt={product.name}
        loading="lazy"
        onError={() => setFailed(true)}
        draggable={false}
        className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
      />
    );
  }
  return (
    <div className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br ${cat.grad}`}>
      <div className="bg-pattern absolute inset-0 opacity-70" aria-hidden />
      <span className="relative font-serif text-6xl font-bold text-white/90 transition-transform duration-700 group-hover:scale-125 group-hover:rotate-6">
        {product.name.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  tone,
  index,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: string;
  index: number;
}) {
  return (
    <div
      style={{ ["--i" as string]: index }}
      className="adm-card adm-item flex items-center gap-3 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm"
    >
      <div className={`adm-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="font-serif text-2xl leading-none font-semibold text-foreground">
          <CountUp value={value} />
        </p>
        <p className="mt-1 truncate text-xs font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="adm-skeleton h-44" />
      <div className="space-y-3 p-5">
        <div className="adm-skeleton h-5 w-2/3 rounded-lg" />
        <div className="adm-skeleton h-3 w-full rounded-lg" />
        <div className="adm-skeleton h-3 w-4/5 rounded-lg" />
        <div className="adm-skeleton mt-4 h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}

function AdminMenuPage() {
  const [products, setProducts] = useCachedState<Product[]>("admin:menu:products", []);
  const [isLoading, setIsLoading] = useState(() => !hasCache("admin:menu:products"));
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [newAllergen, setNewAllergen] = useState("");

  // Structured price list (source of truth for checkout totals)
  const [showPrices, setShowPrices] = useState(false);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantsSaving, setVariantsSaving] = useState(false);

  const fetchProducts = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      await refreshDailyStock(); // a new day starts with full stock
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .neq("status", "deleted")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load products");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts(hasCache("admin:menu:products"));
  }, []);

  // Stock changes the moment an order is placed (or the menu is edited elsewhere): show it without a refresh.
  useProductsRealtime(() => fetchProducts(true));

  const openPrices = async () => {
    setShowPrices(true);
    setVariantsLoading(true);
    try {
      const { data, error } = await supabase
        .from("product_variants")
        .select("*")
        .order("category", { ascending: true })
        .order("item_name", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      setVariants(data || []);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to load prices");
      setVariants([]);
    } finally {
      setVariantsLoading(false);
    }
  };

  const savePrices = async () => {
    setVariantsSaving(true);
    try {
      for (const v of variants) {
        const { error } = await supabase
          .from("product_variants")
          .update({
            price_inr: Math.max(0, Math.round(Number(v.price_inr) || 0)),
            is_available: v.is_available,
            updated_at: new Date().toISOString(),
          })
          .eq("id", v.id);
        if (error) throw error;
      }
      toast.success("Prices saved — checkout will use these amounts.");
      setShowPrices(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save prices");
    } finally {
      setVariantsSaving(false);
    }
  };

  const groupedVariants = useMemo(() => {
    const map = new Map<string, ProductVariant[]>();
    variants.forEach((v) => {
      const list = map.get(v.category) ?? [];
      list.push(v);
      map.set(v.category, list);
    });
    return Array.from(map.entries());
  }, [variants]);

  const handleOpenAdd = () => {
    setNewAllergen("");
    setEditingProduct({
      category: "kunafa",
      name: "",
      slug: "",
      description: "",
      price_label: "₹ 550/-",
      status: "active",
      allergens: ["dairy", "gluten"],
      ingredients: [],
      dietary: ["Vegetarian", "Eggless"],
      topping: "",
      weight: "",
      allergen_notes: "",
      temperature: "",
      shelf_life: "",
      storage: "",
      image_alt: "",
      daily_stock: null,
      stock_remaining: null,
      sort_order: products.length + 1,
      is_available: true,
      is_featured: false,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setNewAllergen("");
    setEditingProduct({ ...p });
    setIsModalOpen(true);
  };

  const handleDuplicate = async (p: Product) => {
    try {
      const newSlug = `${p.slug}-copy-${Date.now().toString().slice(-4)}`;
      const core = {
        slug: newSlug,
        category: p.category,
        name: `${p.name} (Copy)`,
        description: p.description,
        image_url: p.image_url,
        price_label: p.price_label,
        is_available: p.is_available,
        is_featured: false,
        sort_order: (p.sort_order || 0) + 1,
        allergens: p.allergens,
        status: "draft",
        daily_stock: p.daily_stock,
        stock_remaining: p.daily_stock,
      };
      const details = {
        ingredients: p.ingredients ?? [],
        topping: p.topping ?? null,
        weight: p.weight ?? null,
        allergen_notes: p.allergen_notes ?? null,
        dietary: p.dietary ?? [],
        temperature: p.temperature ?? null,
        shelf_life: p.shelf_life ?? null,
        storage: p.storage ?? null,
        image_alt: p.image_alt ?? null,
      };
      let { error } = await supabase.from("products").insert({ ...core, ...details });
      if (error && isMissingColumnError(error)) {
        ({ error } = await supabase.from("products").insert(core)); // DB not migrated yet
      }

      if (error) throw error;
      toast.success(`Duplicated "${p.name}" as draft`);
      fetchProducts();
    } catch (err: any) {
      toast.error(err.message || "Failed to duplicate item");
    }
  };

  const handleSoftDelete = async (p: Product) => {
    if (!confirm(`Are you sure you want to remove "${p.name}" from the menu? Past orders will remain preserved.`)) {
      return;
    }
    try {
      const { error } = await supabase
        .from("products")
        .update({ status: "deleted", updated_at: new Date().toISOString() })
        .eq("id", p.id);

      if (error) throw error;
      toast.success(`"${p.name}" marked as deleted`);
      fetchProducts();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete item");
    }
  };

  const handleQuickStatusChange = async (p: Product, newStatus: ProductStatus) => {
    try {
      const { error } = await supabase
        .from("products")
        .update({
          status: newStatus,
          is_available: newStatus === "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", p.id);

      if (error) throw error;
      toast.success(`${p.name} marked as ${newStatus.replace(/_/g, " ")}`);
      fetchProducts();
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    }
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct?.name || !editingProduct?.category) {
      toast.error("Please enter item name and category");
      return;
    }

    const alertAt =
      editingProduct.daily_stock !== null && editingProduct.daily_stock !== undefined
        ? (editingProduct.low_stock_alert_at ?? null)
        : null; // no daily limit, so no alert
    if (alertAt !== null && (!Number.isInteger(alertAt) || alertAt < 0 || alertAt > Number(editingProduct.daily_stock))) {
      toast.error(`The low-stock alert number must be between 0 and the daily limit (${editingProduct.daily_stock}).`);
      return;
    }
    // Only send the column when it matters, so saving keeps working on a database that has not run migration 009.
    const includeAlert = alertAt !== null || "low_stock_alert_at" in editingProduct;

    setIsSaving(true);
    try {
      const slug =
        editingProduct.slug?.trim() ||
        editingProduct.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

      const payload = {
        name: editingProduct.name.trim(),
        slug,
        category: editingProduct.category,
        description: editingProduct.description || null,
        price_label: editingProduct.price_label || null,
        image_url: editingProduct.image_url || null,
        status: editingProduct.status || "active",
        is_available: editingProduct.status === "active",
        is_featured: Boolean(editingProduct.is_featured),
        sort_order: Number(editingProduct.sort_order) || 0,
        allergens: editingProduct.allergens || [],
        daily_stock:
          editingProduct.daily_stock !== null && editingProduct.daily_stock !== undefined
            ? Number(editingProduct.daily_stock)
            : null,
        updated_at: new Date().toISOString(),
      };
      // Orders lower stock_remaining all day. Saving other changes (name, price, photo...) must not put
      // sold portions back, so stock is only reset when the daily limit itself was edited (or for a new item).
      const original = editingProduct.id ? products.find((p) => p.id === editingProduct.id) : undefined;
      const limitChanged = !original || (original.daily_stock ?? null) !== (editingProduct.daily_stock ?? null);
      if (limitChanged) {
        (payload as Record<string, unknown>).stock_remaining =
          editingProduct.daily_stock !== null && editingProduct.daily_stock !== undefined
            ? Number(editingProduct.daily_stock)
            : null;
      }

      // Website detail fields (migration 004).
      const details = {
        ingredients: cleanList(editingProduct.ingredients),
        topping: cleanText(editingProduct.topping),
        weight: cleanText(editingProduct.weight),
        allergen_notes: cleanText(editingProduct.allergen_notes),
        dietary: cleanList(editingProduct.dietary),
        temperature: cleanText(editingProduct.temperature),
        shelf_life: cleanText(editingProduct.shelf_life),
        storage: cleanText(editingProduct.storage),
        image_alt: cleanText(editingProduct.image_alt),
      };

      const write = (body: Record<string, unknown>) =>
        editingProduct.id
          ? supabase.from("products").update(body).eq("id", editingProduct.id)
          : supabase.from("products").insert(body);

      const alertBody = includeAlert ? { low_stock_alert_at: alertAt } : {};
      let { error } = await write({ ...payload, ...details, ...alertBody });
      let alertSkipped = false;
      if (error && includeAlert && isMissingColumnError(error)) {
        // Migration 009 is not applied yet: save everything else.
        alertSkipped = true;
        ({ error } = await write({ ...payload, ...details }));
      }
      if (error && isMissingColumnError(error)) {
        // The database hasn't had migration 004 applied yet: still save the core fields so nothing is lost.
        ({ error } = await write(payload));
        if (!error) {
          toast.warning(
            "Saved, but the new detail fields (ingredients, topping, weight…) were skipped — run migration 004 in Supabase first."
          );
        }
      }
      if (error) throw error;
      toast.success(`${editingProduct.id ? "Updated" : "Created"} "${payload.name}"`);
      if (alertSkipped && alertAt !== null) {
        toast.warning("Saved, but the low-stock alert number was skipped. Run migration 009 in Supabase first.");
      }

      setIsModalOpen(false);
      setEditingProduct(null);
      fetchProducts();
    } catch (err: any) {
      toast.error(err.message || "Failed to save product");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.slug.toLowerCase().includes(q))
        return false;
    }
    return true;
  });

  // ───────── Drag-and-drop ordering ─────────
  // While dragging, `dragOrder` holds the live order of the visible cards. On drop it is merged back
  // into the full menu (so filtered views reorder correctly) and saved as sequential sort_order values.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const orderRef = useRef<string[]>([]);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const pointerRef = useRef({ x: 0, y: 0 });
  const prevRects = useRef(new Map<string, { x: number; y: number }>());
  const [entered, setEntered] = useState(false);

  const productsRef = useRef<Product[]>(products);
  productsRef.current = products;
  const filteredIdsRef = useRef<string[]>([]);
  filteredIdsRef.current = filteredProducts.map((p) => p.id);

  // Entrance animations should play once on load, not replay each time a card moves in the DOM.
  useEffect(() => {
    if (isLoading || products.length === 0 || entered) return;
    const t = setTimeout(() => setEntered(true), 1500);
    return () => clearTimeout(t);
  }, [isLoading, products.length, entered]);

  // The DOM order never changes while dragging: cards are shifted between fixed slots with transforms,
  // which keeps hit-testing stable and lets CSS transitions retarget smoothly mid-motion.
  const displayProducts = filteredProducts;
  const slotsRef = useRef<{ x: number; y: number; w: number; h: number }[]>([]);
  const skipFlipRef = useRef(false);
  const [settling, setSettling] = useState(false);
  const displayKey = displayProducts.map((p) => p.id).join(",");

  // FLIP: when the order changes, glide every card from its old spot to its new one.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const g = grid.getBoundingClientRect();
    const next = new Map<string, { x: number; y: number }>();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const skip = skipFlipRef.current; // right after a drop the cards are already where they belong
    skipFlipRef.current = false;
    cardRefs.current.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      const pos = { x: r.left - g.left, y: r.top - g.top };
      next.set(id, pos);
      const prev = prevRects.current.get(id);
      if (!reduce && !skip && prev && (Math.abs(prev.x - pos.x) > 1 || Math.abs(prev.y - pos.y) > 1)) {
        el.animate(
          [{ transform: `translate(${prev.x - pos.x}px, ${prev.y - pos.y}px)` }, { transform: "none" }],
          { duration: 320, easing: "cubic-bezier(.2,.7,.2,1)" }
        );
      }
    });
    prevRects.current = next;
  }, [displayKey]);

  const persistOrder = async (visibleOrder: string[]) => {
    const current = productsRef.current;
    const fullIds = current.map((p) => p.id);
    const visible = new Set(visibleOrder);
    const slots = fullIds.flatMap((id, i) => (visible.has(id) ? [i] : []));
    const merged = fullIds.slice();
    slots.forEach((slot, i) => {
      merged[slot] = visibleOrder[i];
    });
    if (merged.every((id, i) => id === fullIds[i])) return;

    const byId = new Map<string, Product>(current.map((p) => [p.id, p] as [string, Product]));
    const reordered: Product[] = merged.map((id, i) => ({ ...byId.get(id)!, sort_order: i + 1 }));
    const changed = reordered.filter((p) => byId.get(p.id)!.sort_order !== p.sort_order);
    setProducts(reordered); // optimistic
    try {
      const results = await Promise.all(
        changed.map((p) =>
          supabase
            .from("products")
            .update({ sort_order: p.sort_order, updated_at: new Date().toISOString() })
            .eq("id", p.id)
        )
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
      toast.success("Menu order saved");
    } catch (err: any) {
      toast.error(err.message || "Could not save the new order");
      fetchProducts();
    }
  };
  const persistRef = useRef(persistOrder);
  persistRef.current = persistOrder;

  // Press anywhere on a card (except its buttons / status menu) and drag.
  //  • mouse & pen: the drag starts after the pointer moves a few pixels, so plain clicks still work
  //  • touch: press and hold briefly; moving sooner than that is treated as a normal scroll
  const dragStartRef = useRef({ x: 0, y: 0, sx: 0, sy: 0 });
  const armDrag = (e: React.PointerEvent, p: Product) => {
    if (dragId) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, select, input, textarea, a, label, option")) return;

    const isTouch = e.pointerType === "touch";
    // Touch: dragging starts only from the grip handle (it has touch-action: none, so the browser
    // never claims the gesture for scrolling). The rest of the card keeps scrolling the page normally.
    if (isTouch && !(e.target as HTMLElement).closest("[data-drag-handle]")) return;

    const sx = e.clientX;
    const sy = e.clientY;
    let latest = { x: sx, y: sy };
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
    };
    const begin = () => {
      cleanup();
      const el = cardRefs.current.get(p.id);
      if (!el) return;
      pointerRef.current = latest;
      dragStartRef.current = { x: latest.x, y: latest.y, sx: window.scrollX, sy: window.scrollY };
      orderRef.current = filteredIdsRef.current.slice();
      // Freeze the layout: measure every slot once, with any running glide animation settled.
      cardRefs.current.forEach((c) => c.getAnimations?.().forEach((a) => a.finish()));
      const gr = gridRef.current?.getBoundingClientRect();
      slotsRef.current = orderRef.current.map((id) => {
        const cr = cardRefs.current.get(id)!.getBoundingClientRect();
        return { x: cr.left - (gr?.left ?? 0), y: cr.top - (gr?.top ?? 0), w: cr.width, h: cr.height };
      });
      setDragOrder(orderRef.current);
      setDragId(p.id);
      if (isTouch) navigator.vibrate?.(12);
    };
    function move(ev: PointerEvent) {
      latest = { x: ev.clientX, y: ev.clientY };
      const dist = Math.hypot(latest.x - sx, latest.y - sy);
      if (!isTouch && dist > 6) begin();
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
    if (isTouch) begin();
  };

  // Keyboard: focus a card, then Shift + arrow keys move it one place.
  const nudge = (p: Product, delta: number) => {
    const ids = filteredIdsRef.current;
    const from = ids.indexOf(p.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = ids.slice();
    next.splice(from, 1);
    next.splice(to, 0, p.id);
    persistRef.current(next);
  };

  useEffect(() => {
    if (!dragId) return;
    let raf = 0;
    const prevSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    // The card itself follows the pointer (scroll-aware, so it stays under the cursor while the page auto-scrolls).
    const place = () => {
      const el = cardRefs.current.get(dragId);
      if (!el) return;
      const st = dragStartRef.current;
      const dx = pointerRef.current.x - st.x + (window.scrollX - st.sx);
      const dy = pointerRef.current.y - st.y + (window.scrollY - st.sy);
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    };
    // Once a touch-drag has begun, stop the page from scrolling under the finger.
    const onTouchMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    window.addEventListener("touchmove", onTouchMove, { passive: false });

    const onMove = (e: PointerEvent) => {
      if (closing) return;
      pointerRef.current = { x: e.clientX, y: e.clientY };
      place();
    };
    let closing = false;
    const finish = (commit: boolean) => {
      if (closing) return;
      closing = true;
      cancelAnimationFrame(raf);
      const final = orderRef.current;
      const el = cardRefs.current.get(dragId);
      let finalized = false;
      let anim: Animation | undefined;
      const done = () => {
        if (finalized) return;
        finalized = true;
        anim?.cancel();
        if (el) el.style.transform = "";
        skipFlipRef.current = commit;
        if (commit) {
          // Drop the transforms and reorder the DOM in the same frame, with no transform transition in between.
          setSettling(true);
          requestAnimationFrame(() => requestAnimationFrame(() => setSettling(false)));
        }
        setDragId(null);
        setDragOrder(null);
        if (commit) persistRef.current(final);
      };
      // Glide the card into its slot (or back where it came from on cancel) before finishing.
      const origIdx = filteredIdsRef.current.indexOf(dragId);
      const from = slotsRef.current[origIdx];
      const to = slotsRef.current[commit ? final.indexOf(dragId) : origIdx];
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (el && from && to && !reduce) {
        const a = el.animate(
          [
            { transform: el.style.transform || "none" },
            { transform: `translate3d(${to.x - from.x}px, ${to.y - from.y}px, 0)` },
          ],
          { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }
        );
        anim = a;
        a.onfinish = done;
      } else {
        done();
      }
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
    };

    const loop = () => {
      const { x, y } = pointerRef.current;
      place();
      // Auto-scroll near the top/bottom edge
      const edge = 110;
      if (y < edge) window.scrollBy(0, -Math.ceil(((edge - y) / edge) * 22));
      else if (y > window.innerHeight - edge) window.scrollBy(0, Math.ceil(((y - (window.innerHeight - edge)) / edge) * 22));

      // Which fixed slot is the pointer over? Only the central part of a slot counts, so the order
      // doesn't flicker when the pointer sits near an edge or in the gap between cards.
      const gr = gridRef.current?.getBoundingClientRect();
      if (gr) {
        const px = x - gr.left;
        const py = y - gr.top;
        const slot = slotsRef.current.findIndex(
          (r) =>
            px >= r.x + r.w * 0.2 && px <= r.x + r.w * 0.8 && py >= r.y + r.h * 0.2 && py <= r.y + r.h * 0.8
        );
        const order = orderRef.current;
        if (slot >= 0 && slot !== order.indexOf(dragId)) {
          const next = order.filter((id) => id !== dragId);
          next.splice(slot, 0, dragId);
          orderRef.current = next;
          setDragOrder(next);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("touchmove", onTouchMove);
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
    };
  }, [dragId]);

  const count = (fn: (p: Product) => boolean) => products.filter(fn).length;
  const categoryTabs = [
    { value: "all", label: "All", n: products.length },
    { value: "kunafa", label: "Kunafa", n: count((p) => p.category === "kunafa") },
    { value: "baklava", label: "Baklava", n: count((p) => p.category === "baklava") },
    { value: "gelato", label: "Gelato", n: count((p) => p.category === "gelato") },
  ];
  const statusChips = [
    { value: "all", label: "Any status" },
    { value: "active", label: "Active" },
    { value: "sold_out", label: "Sold out" },
    { value: "hidden", label: "Hidden" },
    { value: "draft", label: "Draft" },
  ];

  return (
    <>
      <div className="adm-stagger space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-serif text-2xl font-bold tracking-tight text-neutral-100 sm:text-3xl">
              Menu & Stock Control
            </h1>
            <p className="mt-1 text-xs text-neutral-400">
              Manage recipes, prices, photography, allergen disclosures, and daily batch availability
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchProducts()}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 px-4 py-2 text-xs font-medium text-neutral-300 shadow-sm hover:border-amber-500/50 hover:text-amber-300 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={openPrices}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 px-4 py-2 text-xs font-medium text-neutral-300 shadow-sm hover:border-[#d39c54]/50 hover:text-amber-300"
            >
              <IndianRupee className="h-3.5 w-3.5" />
              <span>Prices</span>
            </button>
            <button
              onClick={handleOpenAdd}
              className="group inline-flex items-center gap-2 rounded-full bg-[#282345] px-5 py-2 text-xs font-semibold text-white shadow-md shadow-[#282345]/25 hover:-translate-y-0.5 hover:bg-[#1c1733] hover:shadow-lg hover:shadow-[#282345]/35"
            >
              <Plus className="h-4 w-4 text-[#ebb976] transition-transform duration-300 group-hover:rotate-90" />
              <span>Add New Delicacy</span>
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryTile index={0} icon={UtensilsCrossed} label="Total delicacies" value={products.length} tone="bg-[#282345]/8 text-[#282345]" />
          <SummaryTile index={1} icon={PackageCheck} label="Live on website" value={count((p) => p.status === "active")} tone="bg-emerald-500/10 text-emerald-600" />
          <SummaryTile index={2} icon={PackageX} label="Sold out" value={count((p) => p.status === "sold_out" || stockInfo(p).level === "out")} tone="bg-rose-500/10 text-rose-500" />
          <SummaryTile index={3} icon={CircleDashed} label="Hidden or draft" value={count((p) => p.status === "hidden" || p.status === "draft")} tone="bg-[#d39c54]/15 text-[#a8691d]" />
        </div>

        {/* Filters */}
        <div className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative lg:max-w-sm lg:flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search delicacies by name or slug..."
                className="w-full rounded-full border border-neutral-800 bg-neutral-950 py-2.5 pr-10 pl-10 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                  className="adm-no-lift absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1 rounded-full bg-neutral-950 p-1">
              {categoryTabs.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setCategoryFilter(t.value)}
                  className={`adm-no-lift inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-300 ${
                    categoryFilter === t.value
                      ? "bg-[#282345] text-white shadow-md shadow-[#282345]/25"
                      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
                  }`}
                >
                  {t.label}
                  <span
                    className={`rounded-full px-1.5 py-px text-[10px] ${
                      categoryFilter === t.value ? "bg-white/20 text-white" : "bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    {t.n}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {statusChips.map((c) => (
              <button
                key={c.value}
                onClick={() => setStatusFilter(c.value)}
                className={`adm-no-lift rounded-full border px-3 py-1 text-[11px] font-semibold transition-all duration-200 ${
                  statusFilter === c.value
                    ? "border-[#d39c54] bg-[#d39c54]/15 text-amber-300"
                    : "border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
                }`}
              >
                {c.label}
              </button>
            ))}
            <span className="ml-auto flex items-center gap-1.5 text-[11px] text-neutral-500">
              <GripVertical className="h-3.5 w-3.5 text-amber-400" />
              Drag any card to reorder (on phones: drag the grip handle) · order shows on the website
              <span className="mx-1 text-neutral-700">|</span>
              Showing {filteredProducts.length} of {products.length}
            </span>
          </div>
        </div>

        {/* Product cards */}
        {isLoading && products.length === 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-neutral-700 bg-neutral-900 py-16 text-center">
            <div className="adm-float flex h-14 w-14 items-center justify-center rounded-2xl bg-[#d39c54]/15">
              <UtensilsCrossed className="h-7 w-7 text-amber-300" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-neutral-100">No delicacies match</h3>
            <p className="mt-1 max-w-xs text-xs text-neutral-400">
              Try a different search or filter, or add a new item to the menu.
            </p>
            <button
              onClick={() => {
                setSearchQuery("");
                setCategoryFilter("all");
                setStatusFilter("all");
              }}
              className="mt-5 rounded-full border border-neutral-700 px-4 py-2 text-xs font-semibold text-neutral-200 hover:border-amber-500/50 hover:text-amber-300"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <div
            ref={gridRef}
            className={`relative grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 ${
              dragId ? "[&_*]:!cursor-grabbing [&_.adm-card]:pointer-events-none" : ""
            }`}
          >
            {/* Dashed marker showing where the card will land */}
            {dragId && dragOrder && slotsRef.current[dragOrder.indexOf(dragId)] && (
              <div
                aria-hidden
                className="pointer-events-none absolute rounded-3xl border-2 border-dashed border-[#d39c54]/70 bg-[#d39c54]/10 transition-[left,top] duration-300 ease-out"
                style={{
                  left: slotsRef.current[dragOrder.indexOf(dragId)].x,
                  top: slotsRef.current[dragOrder.indexOf(dragId)].y,
                  width: slotsRef.current[dragOrder.indexOf(dragId)].w,
                  height: slotsRef.current[dragOrder.indexOf(dragId)].h,
                }}
              />
            )}
            {displayProducts.map((p, idx) => {
              const stock = stockInfo(p);
              const cat = CATEGORY_STYLE[p.category] ?? CATEGORY_STYLE.kunafa;
              const isDragging = dragId === p.id;
              const dimmed = p.status === "hidden" || p.status === "draft";
              const bar =
                stock.level === "out" ? "bg-rose-500" : stock.level === "low" ? "bg-[#d39c54]" : "bg-emerald-500";

              return (
                <article
                  key={p.id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(p.id, el);
                    else cardRefs.current.delete(p.id);
                  }}
                  style={{
                    ["--i" as string]: idx,
                    ...(dragOrder && slotsRef.current.length && !isDragging
                      ? (() => {
                          const to = slotsRef.current[dragOrder.indexOf(p.id)];
                          const from = slotsRef.current[idx];
                          return to && from
                            ? { transform: `translate3d(${to.x - from.x}px, ${to.y - from.y}px, 0)` }
                            : {};
                        })()
                      : {}),
                    transition: isDragging
                      ? "scale .25s cubic-bezier(.2,.8,.2,1), rotate .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s, border-color .2s"
                      : dragId
                        ? "transform .34s cubic-bezier(.2,.8,.2,1)"
                        : settling
                          ? "transform 0s, box-shadow .25s, border-color .25s, scale .25s, rotate .25s"
                          : undefined,
                  }}
                  onPointerDown={(e) => armDrag(e, p)}
                  onDragStart={(e) => e.preventDefault()}
                  onContextMenu={(e) => {
                    if (dragId) e.preventDefault();
                  }}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget || !e.shiftKey) return;
                    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                      e.preventDefault();
                      nudge(p, -1);
                    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                      e.preventDefault();
                      nudge(p, 1);
                    }
                  }}
                  tabIndex={0}
                  aria-label={`${p.name}. Drag to reorder, or press Shift and an arrow key.`}
                  className={`adm-card ${entered ? "" : "adm-item"} group flex cursor-grab select-none [-webkit-touch-callout:none] [&_a]:cursor-pointer [&_button]:cursor-pointer flex-col overflow-hidden rounded-3xl border bg-neutral-900 shadow-sm ${
                    isDragging
                      ? "z-40 scale-[1.03] rotate-[1.5deg] !border-[#d39c54] shadow-2xl shadow-[#282345]/40 ring-4 ring-[#d39c54]/20"
                      : "border-neutral-800"
                  }`}
                >
                  {/* Photo */}
                  <div className="relative h-44 overflow-hidden">
                    <div className={`h-full w-full transition-[filter,opacity] duration-500 ${dimmed ? "opacity-60 saturate-50" : p.status === "sold_out" ? "saturate-[.35]" : ""}`}>
                      <CardImage product={p} />
                    </div>
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#1c1733]/75 via-transparent to-[#1c1733]/25" />

                    {/* Touch drag handle (phones / tablets only) */}
                    <div
                      data-drag-handle
                      role="button"
                      aria-label={`Drag ${p.name} to reorder`}
                      className="absolute bottom-3 right-3 z-10 hidden h-11 w-11 touch-none items-center justify-center rounded-full bg-white/95 text-[#282345] shadow-lg ring-1 ring-black/10 select-none pointer-coarse:flex"
                    >
                      <GripVertical className="pointer-events-none h-5 w-5" />
                    </div>

                    {/* Category + featured */}
                    <div className="absolute top-3 left-3 flex items-center gap-1.5">
                      <span className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold tracking-wider text-[#282345] uppercase shadow-sm backdrop-blur">
                        {cat.label}
                      </span>
                      {p.is_featured && (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#d39c54] text-white shadow-sm" title="Featured">
                          <Star className="h-3 w-3 fill-current" />
                        </span>
                      )}
                    </div>

                    {/* Status (quick change) */}
                    <div className="absolute top-3 right-3">
                      <StatusMenu
                        status={p.status}
                        name={p.name}
                        onChange={(next) => handleQuickStatusChange(p, next)}
                      />
                    </div>

                    {/* Price */}
                    <div className="absolute bottom-3 left-3">
                      <span className="rounded-full bg-[#1c1733]/70 px-3 py-1 font-mono text-xs font-bold text-[#ebb976] backdrop-blur-md">
                        {p.price_label || "—"}
                      </span>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="truncate font-serif text-lg font-semibold text-neutral-100 transition-colors duration-300 group-hover:text-amber-300">
                      {p.name}
                    </h3>
                    <p className="mt-1 line-clamp-2 min-h-[2.25rem] text-xs leading-relaxed text-neutral-400">
                      {p.description || "No description provided."}
                    </p>

                    {p.allergens && p.allergens.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {p.allergens.slice(0, 4).map((a) => (
                          <span
                            key={a}
                            className="rounded-full border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-[10px] font-medium text-neutral-400 capitalize transition-colors group-hover:border-[#d39c54]/30"
                          >
                            {a}
                          </span>
                        ))}
                        {p.allergens.length > 4 && (
                          <span className="rounded-full bg-neutral-950 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
                            +{p.allergens.length - 4}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Stock meter */}
                    <div className="mt-4 rounded-2xl bg-neutral-950 p-3">
                      <div className="flex items-baseline justify-between text-[11px]">
                        <span className="font-medium text-neutral-400">Daily stock</span>
                        {stock.level === "unlimited" ? (
                          <span className="font-semibold text-neutral-300">Unlimited</span>
                        ) : stock.level === "out" ? (
                          <span className="font-bold text-rose-400">Out of stock</span>
                        ) : (
                          <span className="font-semibold text-neutral-200">
                            <span className={stock.level === "low" ? "text-amber-300" : "text-emerald-500"}>
                              {stock.left}
                            </span>
                            <span className="text-neutral-500"> / {p.daily_stock} left</span>
                          </span>
                        )}
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800">
                        <div
                          style={{ width: `${stock.level === "unlimited" ? 100 : Math.max(stock.pct, stock.level === "out" ? 0 : 4)}%`, ["--i" as string]: idx }}
                          className={`${entered ? "" : "adm-fill"} h-full rounded-full ${stock.level === "unlimited" ? "bg-neutral-700" : bar}`}
                        />
                      </div>
                      {stock.level === "low" && (
                        <p className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-amber-300">
                          <Flame className="h-3 w-3" /> Running low
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="mt-auto flex items-center gap-2 pt-4">
                      <button
                        onClick={() => handleOpenEdit(p)}
                        className="adm-no-lift group/edit flex flex-1 items-center justify-center gap-2 rounded-full bg-[#282345] py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#1c1733] hover:shadow-md hover:shadow-[#282345]/30"
                      >
                        <Edit2 className="h-3.5 w-3.5 transition-transform duration-300 group-hover/edit:-rotate-12 group-hover/edit:scale-110" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDuplicate(p)}
                        title="Duplicate delicacy"
                        aria-label="Duplicate delicacy"
                        className="adm-no-lift rounded-full border border-neutral-800 p-2.5 text-neutral-400 hover:border-amber-500/50 hover:bg-[#d39c54]/10 hover:text-amber-300"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleSoftDelete(p)}
                        title="Delete item"
                        aria-label="Delete item"
                        className="adm-no-lift rounded-full border border-neutral-800 p-2.5 text-neutral-400 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Structured Prices Modal */}
        {showPrices && (
          <ModalBackdrop onClose={() => setShowPrices(false)}>
            <div className="adm-modal relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-200 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-serif text-xl font-bold text-neutral-100">Structured Prices</h2>
                  <p className="mt-1 text-xs text-neutral-400">
                    These amounts are the source of truth for checkout totals. Update a price to change what
                    customers pay.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={setShowPrices(false)}
                  aria-label="Close"
                  className="-mr-2 -mt-1 shrink-0 rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {variantsLoading ? (
                <p className="py-10 text-center text-xs text-neutral-500">Loading prices…</p>
              ) : variants.length === 0 ? (
                <p className="py-10 text-center text-xs text-neutral-500">No structured prices found.</p>
              ) : (
                <div className="mt-5 space-y-4">
                  {groupedVariants.map(([category, rows]) => (
                    <div key={category} className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                      <span className="mb-3 block text-xs font-semibold uppercase tracking-wider text-neutral-400">
                        {CATEGORY_STYLE[category]?.label ?? category}
                      </span>
                      <div className="space-y-2">
                        {rows.map((v) => (
                          <div
                            key={v.id}
                            className="flex flex-wrap items-center gap-3 rounded-xl bg-neutral-900/70 px-3 py-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-neutral-200">{v.item_name}</p>
                              <p className="text-[10px] text-neutral-500">{v.label || v.variant_id}</p>
                            </div>
                            <label className="flex items-center gap-1.5 text-[11px] text-neutral-400">
                              <IndianRupee className="h-3 w-3" />
                              <input
                                type="number"
                                min={0}
                                value={v.price_inr}
                                onChange={(e) =>
                                  setVariants((prev) =>
                                    prev.map((row) =>
                                      row.id === v.id
                                        ? { ...row, price_inr: parseInt(e.target.value, 10) || 0 }
                                        : row
                                    )
                                  )
                                }
                                className="w-24 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200 focus:border-amber-500 focus:outline-none"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                setVariants((prev) =>
                                  prev.map((row) =>
                                    row.id === v.id ? { ...row, is_available: !row.is_available } : row
                                  )
                                )
                              }
                              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                                v.is_available
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : "bg-rose-500/15 text-rose-300"
                              }`}
                            >
                              {v.is_available ? "Available" : "Unavailable"}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPrices(false)}
                  className="rounded-xl border border-neutral-800 px-4 py-2.5 text-xs font-semibold text-neutral-300 hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={savePrices}
                  disabled={variantsSaving || variantsLoading || variants.length === 0}
                  className="rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-bold text-gold-foreground hover:bg-amber-400 disabled:opacity-50"
                >
                  {variantsSaving ? "Saving…" : "Save Prices"}
                </button>
              </div>
            </div>
          </ModalBackdrop>
        )}

        {/* Add/Edit Modal */}
        {isModalOpen && editingProduct && (
          <ModalBackdrop onClose={() => setIsModalOpen(false)}>
            <div
              className="adm-modal relative max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-neutral-800 bg-neutral-900 p-5 text-neutral-200 shadow-2xl sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-serif text-xl font-bold text-neutral-100">
                    {editingProduct.id ? "Edit Delicacy" : "Create New Delicacy"}
                  </h2>
                  <p className="mt-1 text-xs text-neutral-400">
                    Configure details that appear on the customer website
                  </p>
                </div>
                <button
                  type="button"
                  onClick={setIsModalOpen(false)}
                  aria-label="Close"
                  className="-mr-2 -mt-1 shrink-0 rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveModal} className="mt-6 space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-300">
                      Delicacy Name *
                    </label>
                    <input
                      type="text"
                      value={editingProduct.name || ""}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, name: e.target.value })
                      }
                      required
                      placeholder="e.g. Pistachio Kunafa"
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-base text-neutral-200 sm:text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-300">
                      Category *
                    </label>
                    <select
                      value={editingProduct.category || "kunafa"}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          category: e.target.value as ProductCategory,
                        })
                      }
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-base text-neutral-200 sm:text-xs focus:outline-none focus:border-amber-500"
                    >
                      <option value="kunafa">Kunafa</option>
                      <option value="baklava">Baklava</option>
                      <option value="gelato">Gelato</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-300">
                      Price Label *
                    </label>
                    <input
                      type="text"
                      value={editingProduct.price_label || ""}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, price_label: e.target.value })
                      }
                      required
                      placeholder="e.g. ₹ 575/- or 6pc/9pc - ₹700/₹975"
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-base text-neutral-200 sm:text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-300">
                      Status
                    </label>
                    <select
                      value={editingProduct.status || "active"}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          status: e.target.value as ProductStatus,
                        })
                      }
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-base text-neutral-200 sm:text-xs focus:outline-none focus:border-amber-500"
                    >
                      <option value="active">Active (Visible & Orderable)</option>
                      <option value="sold_out">Sold Out (Visible, Not Orderable)</option>
                      <option value="hidden">Hidden from Website</option>
                      <option value="draft">Draft (Being Prepared)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-300">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={editingProduct.description || ""}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, description: e.target.value })
                    }
                    placeholder="Short heirloom recipe description..."
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-base text-neutral-200 sm:text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-300">
                      Daily Stock Limit (Leave empty for Unlimited)
                    </label>
                    <input
                      type="number"
                      value={editingProduct.daily_stock ?? ""}
                      onChange={(e) => {
                        const val = e.target.value ? parseInt(e.target.value, 10) : null;
                        setEditingProduct({
                          ...editingProduct,
                          daily_stock: val,
                          stock_remaining: val,
                        });
                      }}
                      placeholder="e.g. 25 portions"
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-base text-neutral-200 sm:text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-300">
                      Sort Order Position
                    </label>
                    <input
                      type="number"
                      value={editingProduct.sort_order ?? 1}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          sort_order: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-base text-neutral-200 sm:text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {editingProduct.daily_stock !== null && editingProduct.daily_stock !== undefined && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-300">
                      Low-stock alert: warn me when this many or fewer are left (leave empty for no alert)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={editingProduct.daily_stock}
                      value={editingProduct.low_stock_alert_at ?? ""}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          low_stock_alert_at: e.target.value ? parseInt(e.target.value, 10) : null,
                        })
                      }
                      placeholder={`e.g. ${Math.max(1, Math.round((editingProduct.daily_stock || 0) * 0.4))}`}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-base text-neutral-200 sm:text-xs focus:outline-none focus:border-amber-500"
                    />
                    <p className="mt-1 text-[11px] text-neutral-500">
                      Example: daily limit {editingProduct.daily_stock}, alert number{" "}
                      {Math.max(1, Math.round((editingProduct.daily_stock || 0) * 0.4))} → the dashboard warns, with its
                      own sound, once {Math.max(1, Math.round((editingProduct.daily_stock || 0) * 0.4))} or fewer are left.
                    </p>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-300">
                    Photo URL
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
                      {isUsableImage(editingProduct.image_url) ? (
                        <img src={editingProduct.image_url!} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-neutral-500" />
                      )}
                    </div>
                    <input
                      type="text"
                      value={editingProduct.image_url || ""}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, image_url: e.target.value })
                      }
                      placeholder="https://… or /images/item.jpg"
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-base text-neutral-200 sm:text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* Ingredients */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-300">
                    Ingredients
                  </label>
                  <TagInput
                    label="Ingredients"
                    value={editingProduct.ingredients ?? []}
                    onChange={(next) => setEditingProduct({ ...editingProduct, ingredients: next })}
                    placeholder="Type an ingredient and press Enter (e.g. Flour)"
                    suggestions={INGREDIENT_SUGGESTIONS}
                  />
                  <p className="mt-1 text-[11px] text-neutral-500">Shown on the website as a comma-separated list.</p>
                </div>

                {/* Allergens selection: presets + any custom allergen the kitchen adds */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-neutral-300">
                    Allergens
                  </label>
                  {(() => {
                    const selected = editingProduct.allergens || [];
                    const has = (a: string) => selected.some((x) => x.toLowerCase() === a.toLowerCase());
                    // Presets first, then anything custom already on this item, so it can always be removed.
                    const custom = selected.filter((x) => !ALLERGEN_OPTIONS.includes(x.toLowerCase()));
                    const toggleAllergen = (alg: string) =>
                      setEditingProduct({
                        ...editingProduct,
                        allergens: has(alg)
                          ? selected.filter((x) => x.toLowerCase() !== alg.toLowerCase())
                          : [...selected, alg],
                      });
                    const addCustom = () => {
                      const val = newAllergen.trim();
                      if (!val) return;
                      if (!has(val)) {
                        setEditingProduct({ ...editingProduct, allergens: [...selected, val] });
                      }
                      setNewAllergen("");
                    };
                    return (
                      <>
                        <div className="flex flex-wrap gap-2">
                          {[...ALLERGEN_OPTIONS, ...custom].map((alg) => {
                            const isSelected = has(alg);
                            const isCustom = !ALLERGEN_OPTIONS.includes(alg);
                            return (
                              <button
                                type="button"
                                key={alg}
                                onClick={() => toggleAllergen(alg)}
                                className={`rounded-lg border px-2.5 py-1 text-xs font-medium capitalize transition-all ${
                                  isSelected
                                    ? "border-amber-500/40 bg-amber-500/20 text-amber-300"
                                    : "border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-neutral-200"
                                }`}
                              >
                                {alg}
                                {isCustom && <span className="ml-1 text-[10px] text-amber-400/70">• custom ✕</span>}
                              </button>
                            );
                          })}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <input
                            type="text"
                            value={newAllergen}
                            onChange={(e) => setNewAllergen(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addCustom();
                              }
                            }}
                            placeholder="Other allergen, e.g. Coconut, Kiwi, Alcohol…"
                            aria-label="Add another allergen"
                            className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-base text-neutral-200 focus:border-amber-500 focus:outline-none sm:text-xs"
                          />
                          <button
                            type="button"
                            onClick={addCustom}
                            disabled={!newAllergen.trim()}
                            className="adm-no-lift shrink-0 rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 disabled:opacity-40"
                          >
                            Add
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Allergen note, topping, weight */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-300">
                    Allergen details <span className="text-neutral-500">(optional, shown beside the badges)</span>
                  </label>
                  <input
                    type="text"
                    value={editingProduct.allergen_notes || ""}
                    onChange={(e) => setEditingProduct({ ...editingProduct, allergen_notes: e.target.value })}
                    placeholder="e.g. Tree Nuts (Pistachio)"
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-base text-neutral-200 focus:outline-none focus:border-amber-500 sm:text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-300">Topping</label>
                    <input
                      type="text"
                      value={editingProduct.topping || ""}
                      onChange={(e) => setEditingProduct({ ...editingProduct, topping: e.target.value })}
                      placeholder="e.g. Pistachio powder"
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-base text-neutral-200 focus:outline-none focus:border-amber-500 sm:text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-300">Weight</label>
                    <input
                      type="text"
                      value={editingProduct.weight || ""}
                      onChange={(e) => setEditingProduct({ ...editingProduct, weight: e.target.value })}
                      placeholder="e.g. 165 grams - 175 grams Approx"
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-base text-neutral-200 focus:outline-none focus:border-amber-500 sm:text-xs"
                    />
                  </div>
                </div>

                {/* Serving & care */}
                <div className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-950/50 p-3.5">
                  <p className="text-[11px] font-bold tracking-[0.14em] text-neutral-400 uppercase">Serving &amp; care</p>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-300">Dietary</label>
                    <TagInput
                      label="Dietary"
                      value={editingProduct.dietary ?? []}
                      onChange={(next) => setEditingProduct({ ...editingProduct, dietary: next })}
                      placeholder="e.g. Vegetarian"
                      suggestions={DIETARY_SUGGESTIONS}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-neutral-300">Served</label>
                      <input
                        type="text"
                        value={editingProduct.temperature || ""}
                        onChange={(e) => setEditingProduct({ ...editingProduct, temperature: e.target.value })}
                        placeholder="e.g. Warm"
                        className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-base text-neutral-200 focus:outline-none focus:border-amber-500 sm:text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-neutral-300">Shelf life</label>
                      <input
                        type="text"
                        value={editingProduct.shelf_life || ""}
                        onChange={(e) => setEditingProduct({ ...editingProduct, shelf_life: e.target.value })}
                        placeholder="e.g. 12 hours"
                        className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-base text-neutral-200 focus:outline-none focus:border-amber-500 sm:text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-300">Storage</label>
                    <textarea
                      rows={2}
                      value={editingProduct.storage || ""}
                      onChange={(e) => setEditingProduct({ ...editingProduct, storage: e.target.value })}
                      placeholder="e.g. Store in an airtight container at room temperature or in the refrigerator."
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-base text-neutral-200 focus:outline-none focus:border-amber-500 sm:text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-300">
                      Photo description <span className="text-neutral-500">(alt text for accessibility)</span>
                    </label>
                    <input
                      type="text"
                      value={editingProduct.image_alt || ""}
                      onChange={(e) => setEditingProduct({ ...editingProduct, image_alt: e.target.value })}
                      placeholder="e.g. A golden kataifi Cream Kunafa topped with pistachio powder."
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 text-base text-neutral-200 focus:outline-none focus:border-amber-500 sm:text-xs"
                    />
                  </div>
                </div>

                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300 transition-colors hover:border-amber-500/40">
                  <span className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-amber-400" /> Feature this delicacy on the website
                  </span>
                  <input
                    type="checkbox"
                    checked={Boolean(editingProduct.is_featured)}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, is_featured: e.target.checked })
                    }
                    className="h-4 w-4 accent-[#d39c54]"
                  />
                </label>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full rounded-xl bg-amber-500 py-3 text-xs font-bold text-gold-foreground hover:bg-amber-400 transition-colors shadow"
                >
                  {isSaving ? "Saving..." : "Save Delicacy Configuration"}
                </button>
              </form>
            </div>
          </ModalBackdrop>
        )}
      </div>
    </>
  );
}
