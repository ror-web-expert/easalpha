import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border bg-card", className)} {...props} />;
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
export function SummaryCard({ label, value, sub, icon: Icon, tone = "primary", className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; tone?: "primary" | "success" | "danger" | "warning" | "info" | "neutral"; className?: string }) {
  const tones: Record<string, string> = { primary: "bg-primary-soft text-primary-ink", success: "bg-success-soft text-success-ink", danger: "bg-danger-soft text-danger-ink", warning: "bg-warning-soft text-warning-ink", info: "bg-info-soft text-info-ink", neutral: "bg-muted text-fg-secondary" };
  return (
    <Card className={cn("flex items-start justify-between gap-3 p-5", className)}>
      <div className="min-w-0">
        <div className="text-[12px] font-semibold uppercase leading-4 tracking-[0.04em] text-fg-muted">{label}</div>
        <div className="mt-2 text-[clamp(20px,1.5vw,28px)] font-bold leading-tight tracking-[-0.01em] text-heading tabular">{value}</div>
        {sub ? <div className="mt-1 line-clamp-2 text-[13px] leading-4 text-fg-muted">{sub}</div> : null}
      </div>
      {Icon ? (
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tones[tone])} aria-hidden="true">
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
    </Card>
  );
}
