"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  side?: "right" | "bottom";
  className?: string;
}

export function Sheet({ open, onClose, title, description, children, footer, side = "right", className }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/32" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "animate-in absolute flex flex-col bg-page shadow-[var(--shadow-pop)]",
          side === "right" ? "right-0 top-0 h-full w-full max-w-xl sm:rounded-l-2xl" : "bottom-0 left-0 right-0 max-h-[90vh] rounded-t-[28px]",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 px-6 pb-4 pt-6">
          <div>
            {title ? <h2 className="text-[22px] leading-7">{title}</h2> : null}
            {description ? <div className="mt-1 text-sm text-fg-secondary">{description}</div> : null}
          </div>
          <Button variant="ghost" size="icon" className="-mr-2 -mt-1" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></Button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-4">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t px-6 py-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
