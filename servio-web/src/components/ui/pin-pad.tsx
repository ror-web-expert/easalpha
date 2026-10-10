"use client";
import { useEffect, useState } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog } from "./dialog";
import { Button } from "./button";

export function Keypad({ onKey, onBackspace, onClear, className, large }: { onKey: (d: string) => void; onBackspace: () => void; onClear?: () => void; className?: string; large?: boolean }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"];
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => (k === "⌫" ? onBackspace() : k === "C" ? onClear?.() : onKey(k))}
          className={cn(
            "flex items-center justify-center rounded-lg border bg-card font-semibold hover:bg-muted active:bg-primary-soft",
            large ? "h-16 text-2xl" : "h-14 text-xl",
            k === "C" && "text-fg-muted",
          )}
          aria-label={k === "⌫" ? "Backspace" : k === "C" ? "Clear" : k}
        >
          {k === "⌫" ? <Delete className="h-6 w-6" /> : k}
        </button>
      ))}
    </div>
  );
}

export function PinDots({ length, filled }: { length: number; filled: number }) {
  return (
    <div className="flex justify-center gap-3">
      {Array.from({ length }).map((_, i) => (
        <span key={i} className={cn("h-4 w-4 rounded-full border-2 transition-colors", i < filled ? "border-primary bg-primary" : "border-fg-muted")} />
      ))}
    </div>
  );
}

/** Manager PIN approval dialog: who is approving and what. Resolves with the PIN. */
export function PinDialog({ open, onClose, onSubmit, title = "Manager approval", what, error, loading }: { open: boolean; onClose: () => void; onSubmit: (pin: string) => void; title?: string; what?: string; error?: string | null; loading?: boolean }) {
  const [pin, setPin] = useState("");
  useEffect(() => { if (open) setPin(""); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < 4 ? p + e.key : p));
      if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      if (e.key === "Enter" && pin.length === 4) onSubmit(pin);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pin, onSubmit]);
  useEffect(() => { if (pin.length === 4 && open && !loading) onSubmit(pin); }, [pin, open, loading, onSubmit]);
  return (
    <Dialog open={open} onClose={onClose} title={title} description={what ? `Approve: ${what}` : "Ask a manager to enter their PIN"} size="sm">
      <div className="space-y-4">
        <PinDots length={4} filled={pin.length} />
        {error ? <p className="text-center text-sm text-danger">{error}</p> : null}
        <Keypad onKey={(d) => setPin((p) => (p.length < 4 ? p + d : p))} onBackspace={() => setPin((p) => p.slice(0, -1))} onClear={() => setPin("")} />
        <Button variant="secondary" className="w-full" onClick={onClose}>Cancel</Button>
      </div>
    </Dialog>
  );
}
