"use client";
import { CheckCircle2, Info, XCircle, X } from "lucide-react";
import { useToastStore } from "@/store/toast";
import { cn } from "@/lib/utils";

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (!toasts.length) return null;
  return (
    <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(360px,calc(100vw-32px))] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "animate-in pointer-events-auto flex min-h-12 items-start gap-3 rounded-[4px] bg-inverse px-4 py-3 text-inverse-fg shadow-[var(--shadow-pop)]",
          )}
        >
          {t.variant === "success" ? <CheckCircle2 className="h-5 w-5 shrink-0 text-inverse-primary" /> : t.variant === "error" ? <XCircle className="h-5 w-5 shrink-0 text-inverse-danger" /> : <Info className="h-5 w-5 shrink-0 text-inverse-primary" />}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{t.title}</div>
            {t.description ? <div className="mt-0.5 text-sm opacity-80">{t.description}</div> : null}
            {t.action ? (
              <button className="mt-1 text-sm font-medium text-inverse-primary" onClick={() => { t.action?.onClick(); dismiss(t.id); }}>{t.action.label}</button>
            ) : null}
          </div>
          <button onClick={() => dismiss(t.id)} className="opacity-70 hover:opacity-100" aria-label="Dismiss"><X className="h-5 w-5" /></button>
        </div>
      ))}
    </div>
  );
}
