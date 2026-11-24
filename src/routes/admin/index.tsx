import { Navigate, createFileRoute } from "@tanstack/react-router";

/**
 * /admin itself has no page. It is rendered inside the admin shell, whose access check runs first,
 * so this only ever redirects an already-verified admin. A signed-out visitor goes straight to the
 * sign-in screen instead of being bounced through the dashboard URL first.
 */
export const Route = createFileRoute("/admin/")({
  component: () => <Navigate to="/admin/dashboard" replace />,
});
