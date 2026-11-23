import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { AdminLayout } from "../components/admin/AdminLayout";

/**
 * One admin shell for every /admin page. The sidebar, access check, live-order alert and store
 * pill stay mounted while you move between sections, so only the page content changes.
 * (Before, each page wrapped itself in <AdminLayout>, so all of that was torn down and rebuilt,
 * including a fresh sign-in check, on every click.)
 */
export const Route = createFileRoute("/admin")({
  component: AdminShell,
});

function AdminShell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  // The sign-in screen is full-bleed: no sidebar and no admin-only access check around it.
  if (path.startsWith("/admin/login")) return <Outlet />;
  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
