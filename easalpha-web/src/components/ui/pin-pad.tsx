"use client";
import { useEffect, useRef, useState } from "react";
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

/** Manager PIN approval dialog: who is approving and what. Sends the PIN once, when its 4th digit goes in. */
export function PinDialog({ open, onClose, onSubmit, title = "Manager approval", what, error, loading }: { open: boolean; onClose: () => void; onSubmit: (pin: string) => void; title?: string; what?: string; error?: string | null; loading?: boolean }) {
  const [pin, setPin] = useState("");
  const live = useRef({ open, loading, onSubmit });
  useEffect(() => { live.current = { open, loading, onSubmit }; });
  // Opening and closing both empty it, so a PIN is never carried into the next approval.
  useEffect(() => { setPin(""); }, [open]);
  // Refused: the submit ended, or an error came, with the dialog still open. Clear it for the next try.
  const wasLoading = useRef(false);
  useEffect(() => {
    if (wasLoading.current && !loading && open) setPin("");
    wasLoading.current = !!loading;
  }, [loading, open]);
  useEffect(() => { if (error) setPin(""); }, [error]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < 4 ? p + e.key : p));
      if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      if (e.key === "Enter" && pin.length === 4 && !loading) onSubmit(pin);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pin, loading, onSubmit]);
  // Only a new 4th digit sends: re-sending whenever loading ended looped a wrong PIN until every manager's PIN locked.
  useEffect(() => {
    const l = live.current;
    if (pin.length === 4 && l.open && !l.loading) l.onSubmit(pin);
  }, [pin]);
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
