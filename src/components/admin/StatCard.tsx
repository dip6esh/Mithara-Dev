import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { CountUp } from "./CountUp";

/** Metric tile shared by the admin dashboard and the customer dashboard. */
export function StatCard({
  icon: Icon,
  label,
  value,
  prefix,
  sub,
  tone = "indigo",
  to,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  prefix?: string;
  sub: React.ReactNode;
  tone?: "indigo" | "gold" | "green" | "rose";
  to?: string;
}) {
  const tones = {
    indigo: "bg-[#282345]/8 text-[#282345]",
    gold: "bg-[#d39c54]/15 text-[#a8691d]",
    green: "bg-emerald-500/10 text-emerald-600",
    rose: "bg-rose-500/10 text-rose-500",
  } as const;
  const body = (
    <div className="adm-card group h-full overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between">
        <div className={`adm-icon flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
        {to && (
          <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#b9772a]" />
        )}
      </div>
      <p className="mt-3 font-serif text-2xl font-semibold sm:mt-4 sm:text-3xl tracking-tight text-foreground"><CountUp value={value} prefix={prefix} /></p>
      <p className="mt-0.5 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-xs text-muted-foreground/80">{sub}</p>
    </div>
  );
  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
