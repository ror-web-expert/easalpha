import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 rounded-2xl border bg-card", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex min-h-14 items-center justify-between gap-3 border-b px-5 py-4", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold leading-6 tracking-[-0.01em] text-heading", className)} {...props} />;
}
export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

/** Stat tile: small uppercase label, big navy figure, optional sub-text and an icon tile at the top right. */
/** A KPI tile. `size="compact"` is the small tile for a secondary strip (the dashboard's second tier). The helper
 *  line wraps instead of being clamped, so it is never cut off mid-sentence (review 4.5). */
export function SummaryCard({ label, value, sub, icon: Icon, tone = "primary", className, size = "default" }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; tone?: "primary" | "success" | "danger" | "warning" | "info" | "neutral"; className?: string; size?: "default" | "large" | "compact" }) {
  const tones: Record<string, string> = { primary: "bg-primary-soft text-primary-ink", success: "bg-success-soft text-success-ink", danger: "bg-danger-soft text-danger-ink", warning: "bg-warning-soft text-warning-ink", info: "bg-info-soft text-info-ink", neutral: "bg-muted text-fg-secondary" };
  const compact = size === "compact", large = size === "large";
  return (
    <Card className={cn("flex items-start justify-between gap-3", compact ? "p-3.5" : large ? "p-6" : "p-5", className)}>
      <div className="min-w-0">
        <div className={cn("font-semibold uppercase leading-4 tracking-[0.04em] text-fg-muted", compact ? "text-[11px]" : "text-[12px]")}>{label}</div>
        <div className={cn("font-bold leading-tight tracking-[-0.01em] text-heading tabular", compact ? "mt-1 text-lg" : large ? "mt-2 text-[clamp(26px,2.2vw,36px)]" : "mt-2 text-[clamp(20px,1.5vw,28px)]")}>{value}</div>
        {sub ? <div className={cn("mt-1 leading-4 text-fg-muted", compact ? "text-xs" : "text-[13px]")}>{sub}</div> : null}
      </div>
      {Icon ? (
        <span className={cn("grid shrink-0 place-items-center rounded-xl", compact ? "h-8 w-8" : "h-10 w-10", tones[tone])} aria-hidden="true">
          <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </span>
      ) : null}
    </Card>
  );
}

/** The shape of a SummaryCard while its figure loads, so nobody reads a false Rs 0 (review 6). */
export function SummaryCardSkeleton({ size = "default", className }: { size?: "default" | "large" | "compact"; className?: string }) {
  return (
    <Card aria-hidden className={cn("animate-pulse", size === "compact" ? "p-3.5" : size === "large" ? "p-6" : "p-5", className)}>
      <div className="h-3 w-24 rounded bg-muted" />
      <div className={cn("mt-3 rounded bg-muted", size === "large" ? "h-8 w-40" : size === "compact" ? "h-5 w-20" : "h-7 w-32")} />
      {size === "compact" ? null : <div className="mt-2 h-3 w-36 rounded bg-muted" />}
    </Card>
  );
}
