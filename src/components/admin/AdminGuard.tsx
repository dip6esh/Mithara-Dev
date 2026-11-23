import React from "react";
import { useRouter } from "@tanstack/react-router";
import { useAuth } from "../../lib/auth";
import { ShieldAlert, Loader2 } from "lucide-react";
import logoIcon from "../../assets/mithara-icon.png";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isLoading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (!isLoading) {
      if (!user || !isAdmin) {
        router.navigate({ to: "/admin/login" });
      }
    }
  }, [user, isAdmin, isLoading, router]);

  if (isLoading) {
    return (
      <div className="admin-theme flex min-h-screen flex-col items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-5">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-[#282345] shadow-xl">
            <img src={logoIcon} alt="" className="h-10 w-10 object-contain" />
            <Loader2 className="absolute -right-2 -bottom-2 h-7 w-7 animate-spin rounded-full bg-background p-1 text-[#d39c54]" />
          </div>
          <div className="text-center">
            <p className="font-serif text-lg text-foreground">Verifying access</p>
            <p className="mt-1 text-xs text-muted-foreground">Checking administrator credentials…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
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
