"use client";
import { Loader2, Inbox, Moon, Sun, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { useThemeStore } from "@/store/theme";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-fg-muted", className)} />;
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-fg-muted">
      <Spinner /> {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-danger-soft py-10 text-center">
      <div className="text-sm font-medium text-danger-ink">{message}</div>
      {onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, hint, action, className }: { icon?: React.ComponentType<{ className?: string }>; title: string; hint?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border bg-card py-12 text-center", className)}>
      <span className="grid h-12 w-12 place-items-center rounded-full bg-primary-soft"><Icon className="h-6 w-6 text-primary-ink" /></span>
      <div className="text-base font-medium">{title}</div>
      {hint ? <div className="max-w-sm text-sm text-fg-secondary">{hint}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <Button variant="ghost" size="icon" className={className} onClick={() => setTheme(next)} title={`Theme: ${theme}`} aria-label="Toggle theme">
      <Icon className="h-5 w-5" />
    </Button>
  );
}

export function KeyValue({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-2 text-sm", className)}>
      {items.map((it) => (
        <div key={it.label} className="contents">
          <dt className="text-fg-secondary">{it.label}</dt>
          <dd className="text-right font-medium tabular">{it.value ?? "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Stat({ label, value, className, tone }: { label: string; value: React.ReactNode; className?: string; tone?: "success" | "danger" }) {
  return (
    <div className={cn("flex items-center justify-between py-1 text-sm", className)}>
      <span className="text-fg-secondary">{label}</span>
      <span className={cn("font-medium tabular", tone === "success" && "text-success", tone === "danger" && "text-danger")}>{value}</span>
    </div>
  );
}
