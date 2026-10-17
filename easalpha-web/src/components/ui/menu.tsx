"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

export interface MenuItem { label: string; icon?: LucideIcon; onSelect: () => void; disabled?: boolean; hint?: string }

/** One button that opens a short list of page tools (review 4.4: the secondary header actions move into an overflow
 *  menu so the one primary action stands out). Keyboard: Enter or Arrow Down opens it, arrows move, Escape closes. */
export function OverflowMenu({ items, label = "More", icon: Icon = MoreHorizontal, align = "end" }: { items: MenuItem[]; label?: ReactNode; icon?: LucideIcon; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const focusItem = (i: number) => {
    const els = list.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not([disabled])");
    if (!els?.length) return;
    els[(i + els.length) % els.length].focus();
  };
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    requestAnimationFrame(() => focusItem(0));
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const close = () => { setOpen(false); button.current?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    const els = Array.from(list.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not([disabled])") ?? []);
    const at = els.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); focusItem(at + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusItem(at - 1); }
    else if (e.key === "Home") { e.preventDefault(); focusItem(0); }
    else if (e.key === "End") { e.preventDefault(); focusItem(-1); }
    else if (e.key === "Tab") setOpen(false);
  };
  return (
    <div ref={root} className="relative">
      <Button ref={button} variant="secondary" aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); } }}>
        <Icon className="h-4 w-4" /> {label}
      </Button>
      {open ? (
        <div ref={list} id={id} role="menu" onKeyDown={onKey}
          className={cn("absolute z-30 mt-1 min-w-56 rounded-lg border bg-card p-1 shadow-[var(--shadow-pop)]", align === "end" ? "right-0" : "left-0")}>
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" disabled={it.disabled}
              onClick={() => { setOpen(false); it.onSelect(); }}
              className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm hover:bg-fg/8 focus-visible:bg-fg/8 focus-visible:outline-none disabled:opacity-40">
              {it.icon ? <it.icon className="h-4 w-4 shrink-0 text-fg-secondary" /> : null}
              <span className="min-w-0"><span className="block font-medium">{it.label}</span>{it.hint ? <span className="block text-xs text-fg-muted">{it.hint}</span> : null}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
