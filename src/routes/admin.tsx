import { Outlet, createFileRoute, redirect, useRouterState } from "@tanstack/react-router";
import { AdminLayout } from "../components/admin/AdminLayout";
import { AdminError, AdminSplash } from "../components/admin/AdminSplash";
import { getAdminAccess } from "../lib/auth";

/**
 * One admin shell for every /admin page. The sidebar, access check, live-order alert and store
 * pill stay mounted while you move between sections, so only the page content changes.
 *
 * Access is decided BEFORE anything is drawn:
 *   - ssr: false  -> the admin area is built in the browser only. Sign-in lives in the browser, so the
 *     server can never know who you are; rendering it there only produced a flash of the wrong screen.
 *   - beforeLoad  -> signed-out visitors go straight to the sign-in screen, and signed-in admins who
 *     open the sign-in screen go straight to the dashboard. No admin page appears in between.
 */
export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const isAdmin = await getAdminAccess();
    const onLogin = location.pathname.startsWith("/admin/login");
    if (onLogin && isAdmin) throw redirect({ to: "/admin/dashboard", replace: true });
    if (!onLogin && !isAdmin) throw redirect({ to: "/admin/login", replace: true });
  },
  pendingComponent: () => <AdminSplash title="Opening Mithara Admin" />,
  errorComponent: AdminError,
  component: AdminShell,
});

function AdminShell() {
  // Follow the page that is actually on screen, not the address being navigated to. The address changes
  // the moment a navigation starts, while the old page stays visible until the new one is ready; going by
  // the address swapped the layout under the old page and made the sign-in form flash and reset.
  const path = useRouterState({ select: (s) => (s.resolvedLocation ?? s.location).pathname });
  // The sign-in screen is full-bleed: no sidebar and no admin-only access check around it.
  if (path.startsWith("/admin/login")) return <Outlet />;
  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
