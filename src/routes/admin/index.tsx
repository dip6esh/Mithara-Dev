import { Navigate, createFileRoute } from "@tanstack/react-router";
import { useAuth } from "../../lib/auth";
import { landingPath } from "../../lib/roles";

/**
 * /admin itself has no page. It is rendered inside the admin shell, whose access check runs first,
 * so this only ever redirects an already-verified person - to the first page their role allows
 * (Owner and Manager: dashboard; Counter: orders; Kitchen: kitchen board; Delivery: deliveries).
 * A signed-out visitor goes straight to the sign-in screen instead.
 */
export const Route = createFileRoute("/admin/")({
  component: AdminIndex,
});

function AdminIndex() {
  const { roles } = useAuth();
  return <Navigate to={landingPath(roles)} replace />;
}
