import { Outlet, createFileRoute, redirect, useRouterState } from "@tanstack/react-router";
import { AdminLayout } from "../components/admin/AdminLayout";
import { AdminError, AdminSplash } from "../components/admin/AdminSplash";
import { getAdminRoles } from "../lib/auth";
import { canAccess, landingPath, sectionForPath } from "../lib/roles";

/**
 * One admin shell for every /admin page. The sidebar, access check, live-order alert and store
 * pill stay mounted while you move between sections, so only the page content changes.
 *
 * Access is decided BEFORE anything is drawn:
 *   - ssr: false  -> the admin area is built in the browser only. Sign-in lives in the browser, so the
 *     server can never know who you are; rendering it there only produced a flash of the wrong screen.
 *   - beforeLoad  -> signed-out visitors go straight to the sign-in screen, and signed-in staff who
 *     open the sign-in screen go straight to their first allowed page. A page that belongs to another
 *     role redirects the same way. No admin page appears in between.
 */
export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // What this person may do: ["owner"], or their staff roles (one or more), or [] (not allowed in).
    const roles = await getAdminRoles();
    const isAdmin = roles.length > 0;
    const onLogin = location.pathname.startsWith("/admin/login");
    if (onLogin && isAdmin) throw redirect({ to: landingPath(roles), replace: true });
    if (!onLogin && !isAdmin) throw redirect({ to: "/admin/login", replace: true });
    // Signed in, but this page belongs to another role: go to the first page their roles allow.
    const section = sectionForPath(location.pathname);
    if (!onLogin && section && !canAccess(roles, section)) {
      throw redirect({ to: landingPath(roles), replace: true });
    }
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
