import React from "react";
import { useRouter } from "@tanstack/react-router";
import { useAuth } from "../../lib/auth";
import { ShieldAlert } from "lucide-react";
import { AdminSplash } from "./AdminSplash";

/**
 * Safety net while the console is open. The router already checks access before any admin page is
 * drawn (see routes/admin.tsx); this covers what happens afterwards, such as signing out in another
 * tab or a session that expires.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isLoading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (!isLoading && (!user || !isAdmin)) {
      // replace: the back button must not return to a page that would only bounce you out again.
      router.navigate({ to: "/admin/login", replace: true });
    }
  }, [user, isAdmin, isLoading, router]);

  if (isLoading) return <AdminSplash title="Verifying access" subtitle="Checking administrator credentials…" />;
  if (!user) return <AdminSplash title="Signing you out" subtitle="Taking you to the sign-in screen…" />;

  // Signed in, but not as an administrator.
  if (!isAdmin) {
    return (
      <div className="admin-theme flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
        <div className="max-w-md rounded-3xl border border-border bg-card p-8 shadow-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10">
            <ShieldAlert className="h-7 w-7 text-rose-500" />
          </div>
          <h2 className="mt-4 font-serif text-2xl font-semibold text-foreground">Access restricted</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This area requires verified administrator authorization. Redirecting to login…
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
