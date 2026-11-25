export type ProductCategory = "kunafa" | "baklava" | "gelato";

export type ProductStatus = "active" | "sold_out" | "hidden" | "draft" | "deleted";

export type Product = {
  id: string;
  slug: string;
  category: ProductCategory;
  name: string;
  description: string | null;
  image_url: string | null;
  price_label: string | null;
  is_available: boolean;
  is_featured: boolean;
  sort_order: number;
  allergens: string[];
  /** Website detail fields (migration 004). Optional so older rows / un-migrated DBs still type-check. */
  ingredients?: string[] | null;
  topping?: string | null;
  weight?: string | null;
  allergen_notes?: string | null;
  dietary?: string[] | null;
  temperature?: string | null;
  shelf_life?: string | null;
  storage?: string | null;
  image_alt?: string | null;
  status: ProductStatus;
  daily_stock: number | null;
  stock_remaining: number | null;
  stock_reset_at: string | null;
  /** Migration 009. Warn when stock_remaining is at or below this. null / missing = no alert. */
  low_stock_alert_at?: number | null;
  created_at: string;
  updated_at: string;
};

export type ProductVariant = {
  id: string;
  product_id: string | null;
  category: string;
  item_name: string;
  variant_id: string;
  label: string | null;
  price_inr: number;
  is_available: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CustomerProfile = {
  id: string;
  name: string;
  phone: string;
  created_at: string;
  updated_at: string;
};

export type CustomerAddress = {
  id: string;
  customer_id: string;
  label: string;
  recipient_name: string | null;
  phone: string | null;
  flat: string | null;
  building: string | null;
  street: string | null;
  area: string | null;
  city: string | null;
  pincode: string | null;
  instructions: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * Simple order flow:  new ("Order received")  ->  completed ("Handed over")  |  cancelled.
 * "pending_payment" only exists while a customer is paying online and is hidden from the kitchen.
 */
export type OrderStatus = "pending_payment" | "new" | "completed" | "cancelled";

/**
 * Kitchen Display progress, only meaningful while status === "new" (migration 012).
 * Kept apart from OrderStatus so revenue, invoices and stock never depend on it.
 * null / missing = nothing started yet (same as "new").
 */
export type KitchenStatus = "new" | "preparing" | "ready";

export type PaymentStatus = "unpaid" | "partial" | "paid";

/** What the customer chose at checkout. "cash" means pay at handover (cash or UPI). */
export type PaymentMethod = "cash" | "upi" | "card" | "other";

/** How the money was actually received. */
export type PaidVia = "cash" | "upi" | "card";

/** "demo" = simulated online payment; "live" = real money (cash at handover, or a real gateway later). */
export type PaymentMode = "demo" | "live";

export type DeliveryType = "delivery" | "pickup";

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  name: string;
  variant: string | null;
  unit_price: number;
  qty: number;
  note: string | null;
  created_at: string;
};

export type Order = {
  id: string;
  order_number: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  payment_mode: PaymentMode;
  /** Set when the order is paid (online at checkout, or at handover). Migration 005. */
  paid_via?: PaidVia | null;
  paid_at?: string | null;
  /** Kitchen Display progress (migration 012). Optional so un-migrated DBs still type-check. */
  kitchen_status?: KitchenStatus | null;
  kitchen_status_at?: string | null;
  /** Set when anyone on the team acknowledged the new-order pop-up (migration 013). */
  alert_seen_at?: string | null;
  delivery_type: DeliveryType;
  address_snapshot: Partial<CustomerAddress> | null;
  notes: string | null;
  admin_notes: string | null;
  subtotal_inr: number;
  delivery_fee_inr: number;
  /** Tax recorded on the order (migration 007). Optional so older rows / un-migrated DBs still type-check. */
  tax_inr?: number;
  tax_rate?: number;
  tax_label?: string | null;
  tax_inclusive?: boolean;
  total_inr: number;
  created_at: string;
  updated_at: string;
  order_items?: OrderItem[];
};

export type SiteSettings = {
  whatsapp_number: string;
  whatsapp_display: string;
  holiday_mode: boolean;
  holiday_message: string;
  banner_enabled: boolean;
  banner_text: string;
  delivery_fee_flat?: number;
  free_delivery_above?: number;
  order_cutoff_time?: string;
  order_reopen_time?: string;
  payment_mode?: PaymentMode;
  tax_enabled?: boolean;
  tax_rate_percent?: number;
  tax_label?: string;
  tax_inclusive?: boolean;
};
