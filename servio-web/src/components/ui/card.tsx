import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border bg-card", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex min-h-14 items-center justify-between gap-3 border-b px-4 py-3", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-medium tracking-[0.15px]", className)} {...props} />;
}
export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function SummaryCard({ label, value, sub, icon: Icon, tone = "primary", className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; tone?: "primary" | "success" | "danger" | "warning" | "info" | "neutral"; className?: string }) {
  const tones: Record<string, string> = { primary: "bg-primary-soft text-primary-ink", success: "bg-success-soft text-success-ink", danger: "bg-danger-soft text-danger-ink", warning: "bg-warning-soft text-warning-ink", info: "bg-info-soft text-info-ink", neutral: "bg-muted text-fg-secondary" };
  return (
    <Card className={cn("flex items-start justify-between gap-3 p-4", className)}>
      <div className="min-w-0">
        <div className="text-sm font-medium tracking-[0.1px] text-fg-secondary">{label}</div>
        <div className="mt-2 truncate text-2xl leading-8 tabular">{value}</div>
        {sub ? <div className="mt-1 truncate text-xs tracking-[0.4px] text-fg-secondary">{sub}</div> : null}
      </div>
      {Icon ? (
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", tones[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
    </Card>
  );
}
