import React from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { ensureStaffRoles, useAuth } from "../../lib/auth";
import { canAccess, landingPath, sectionForPath } from "../../lib/roles";
import { ShieldAlert } from "lucide-react";
import { AdminSplash } from "./AdminSplash";

/**
 * Safety net while the console is open. The router already checks access before any admin page is
 * drawn (see routes/admin.tsx); this covers what happens afterwards, such as signing out in another
 * tab, a session that expires, or the Owner changing / disabling this person's roles.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, roles, rolesLoaded, isLoading } = useAuth();
  const router = useRouter();
  const path = useRouterState({ select: (s) => (s.resolvedLocation ?? s.location).pathname });
  const section = sectionForPath(path);
  const allowedHere = !section || canAccess(roles, section);

  // A staff member's roles are looked up once after sign-in; make sure that has happened.
  React.useEffect(() => {
    if (user && !rolesLoaded) void ensureStaffRoles();
  }, [user, rolesLoaded]);

  React.useEffect(() => {
    if (isLoading || !rolesLoaded) return;
    if (!user || !isAdmin) {
      // replace: the back button must not return to a page that would only bounce you out again.
      router.navigate({ to: "/admin/login", replace: true });
    } else if (!allowedHere) {
      // Roles changed while this page was open: move to the first page they still allow.
      router.navigate({ to: landingPath(roles), replace: true });
    }
  }, [user, isAdmin, isLoading, rolesLoaded, allowedHere, roles, router]);

  if (isLoading || (user && !rolesLoaded)) {
    return <AdminSplash title="Verifying access" subtitle="Checking your credentials…" />;
  }
  if (!user) return <AdminSplash title="Signing you out" subtitle="Taking you to the sign-in screen…" />;

  // Signed in, but not allowed into the admin at all (customer account, or disabled staff).
  if (!isAdmin) {
    return (
      <div className="admin-theme flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
        <div className="max-w-md rounded-3xl border border-border bg-card p-8 shadow-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10">
            <ShieldAlert className="h-7 w-7 text-rose-500" />
          </div>
          <h2 className="mt-4 font-serif text-2xl font-semibold text-foreground">Access restricted</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This account does not have access to the management console. Redirecting to login…
          </p>
        </div>
      </div>
    );
  }

  if (!allowedHere) return <AdminSplash title="Taking you to your page" />;

  return <>{children}</>;
}
