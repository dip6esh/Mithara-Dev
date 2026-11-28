/**
 * Who can open what in the admin.
 *
 * The Owner is the existing administrator account (app_metadata.role = "admin") and can do everything.
 * Everyone else is a staff member created from Admin → Staff, holding ONE OR MORE of the roles below.
 * Someone with several roles gets everything any of their roles allows.
 *
 * This file only decides what the app SHOWS. The database enforces the same rules independently
 * (see supabase/migrations/014_staff_roles.sql), so a hidden page can't be reached by typing its address.
 */

export type StaffRole = "manager" | "counter" | "kitchen" | "delivery";
export type AppRole = "owner" | StaffRole;

export const STAFF_ROLES: StaffRole[] = ["manager", "counter", "kitchen", "delivery"];

export const ROLE_INFO: Record<AppRole, { label: string; short: string; description: string }> = {
  owner: {
    label: "Owner",
    short: "Full access",
    description: "Everything, including settings and staff.",
  },
  manager: {
    label: "Manager",
    short: "Runs the day",
    description:
      "Dashboard, orders, kitchen, customers, invoices, revenue and menu. Can cancel orders and undo payments. No settings or staff.",
  },
  counter: {
    label: "Counter / Biller",
    short: "Billing",
    description:
      "Creates walk-in orders, takes payment, hands orders over and prints invoices. Cannot cancel or undo.",
  },
  kitchen: {
    label: "Kitchen",
    short: "Cooking",
    description: "Sees the kitchen board only and moves orders New → Preparing → Ready.",
  },
  delivery: {
    label: "Delivery",
    short: "Deliveries",
    description:
      "Sees delivery orders with address and phone, and marks them handed over (recording cash or UPI collected).",
  },
};

export type AdminSection =
  | "dashboard"
  | "orders"
  | "deliveries"
  | "kitchen"
  | "customers"
  | "invoices"
  | "revenue"
  | "menu"
  | "staff"
  | "settings";

const SECTION_ACCESS: Record<AdminSection, AppRole[]> = {
  dashboard: ["owner", "manager"],
  orders: ["owner", "manager", "counter"],
  deliveries: ["owner", "manager", "delivery"],
  kitchen: ["owner", "manager", "kitchen"],
  customers: ["owner", "manager"],
  invoices: ["owner", "manager", "counter"],
  revenue: ["owner", "manager"],
  menu: ["owner", "manager"],
  staff: ["owner"],
  settings: ["owner"],
};

export function canAccess(roles: AppRole[], section: AdminSection): boolean {
  return SECTION_ACCESS[section].some((r) => roles.includes(r));
}

/** Which section an /admin/... address belongs to (null = login, index or unknown). */
export function sectionForPath(pathname: string): AdminSection | null {
  const m = /^\/admin\/([^/?#]+)/.exec(pathname);
  if (!m) return null;
  const seg = m[1] as AdminSection;
  return seg in SECTION_ACCESS ? seg : null;
}

/** First page this person should land on (and where "not allowed" sends them). */
export type LandingPath = "/admin/dashboard" | "/admin/orders" | "/admin/kitchen" | "/admin/deliveries" | "/admin/login";
const LANDING_ORDER: Array<[AdminSection, LandingPath]> = [
  ["dashboard", "/admin/dashboard"],
  ["orders", "/admin/orders"],
  ["kitchen", "/admin/kitchen"],
  ["deliveries", "/admin/deliveries"],
];
export function landingPath(roles: AppRole[]): LandingPath {
  for (const [section, path] of LANDING_ORDER) {
    if (canAccess(roles, section)) return path;
  }
  return "/admin/login";
}

/** "Owner", "Manager", or "Counter / Biller · Delivery". */
export function roleSummary(roles: AppRole[]): string {
  if (roles.includes("owner")) return ROLE_INFO.owner.label;
  if (roles.length === 0) return "No access";
  return roles.map((r) => ROLE_INFO[r].label).join(" · ");
}

/** Owner and Manager can cancel orders, restore them and undo payments / handovers. */
export const canReverseOrders = (roles: AppRole[]) => roles.includes("owner") || roles.includes("manager");

/** Which live alerts a person's screen should run. Each reads data only those roles may see. */
export const wantsNewOrderAlert = (roles: AppRole[]) =>
  ["owner", "manager", "counter", "kitchen"].some((r) => roles.includes(r as AppRole));
export const wantsReadyOrderAlert = (roles: AppRole[]) =>
  ["owner", "manager", "counter", "delivery"].some((r) => roles.includes(r as AppRole));
export const wantsAdminNotifications = (roles: AppRole[]) =>
  roles.includes("owner") || roles.includes("manager");

/* ---------------------------- sign-in names ---------------------------- */

/**
 * Staff without an email sign in with a short username. Supabase signs people in by email, so a username
 * is stored as a private address that can never receive mail (example.com is reserved for exactly this).
 * Anything containing "@" is treated as a real email and used as typed.
 */
export const USERNAME_EMAIL_SUFFIX = ".staff@example.com";

export function loginNameToEmail(input: string): string {
  const v = input.trim().toLowerCase();
  return v.includes("@") ? v : `${v}${USERNAME_EMAIL_SUFFIX}`;
}

export const isValidUsername = (v: string) => /^[a-z0-9][a-z0-9._-]{1,29}$/.test(v.trim().toLowerCase());
export const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
