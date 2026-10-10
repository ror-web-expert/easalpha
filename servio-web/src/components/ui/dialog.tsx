"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizes = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

export function Dialog({ open, onClose, title, description, children, footer, size = "md", className }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/32 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className={cn("animate-in flex max-h-[95vh] w-full flex-col rounded-t-[28px] bg-high shadow-[var(--shadow-pop)] sm:rounded-[28px]", sizes[size], className)}>
        {(title || description) && (
          <div className="flex items-start justify-between gap-3 px-6 pb-4 pt-6">
            <div>
              {title ? <h2 className="text-2xl leading-8">{title}</h2> : null}
              {description ? <p className="mt-2 text-sm text-fg-secondary">{description}</p> : null}
            </div>
            <Button variant="ghost" size="icon" className="-mr-2 -mt-1" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></Button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 pb-2">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 px-6 pb-6 pt-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = "Confirm", destructive, loading }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; description?: string; confirmLabel?: string; destructive?: boolean; loading?: boolean }) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} size="sm" footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button variant={destructive ? "destructive" : "primary"} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
    </>} />
  );
}
