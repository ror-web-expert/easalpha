"use client";
import { useCallback, useRef, useState } from "react";
import { PinDialog } from "@/components/ui/pin-pad";
import { needsApproval, errorMessage, ApiError } from "@/lib/api";

/**
 * Runs an action; when the API answers "approval.required" / "permission.denied", opens the manager PIN dialog
 * and retries with approver_pin. Usage: const { run, dialog } = useApproval(); await run((pin) => api(..., { approver_pin: pin }), "Void order #12")
 */
export function useApproval() {
  const [open, setOpen] = useState(false);
  const [what, setWhat] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pending = useRef<{ fn: (pin?: string) => Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void } | null>(null);

  const run = useCallback(async <T,>(fn: (pin?: string) => Promise<T>, label?: string): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (!needsApproval(e)) throw e;
      setWhat(label);
      setError(null);
      setOpen(true);
      return new Promise<T>((resolve, reject) => {
        pending.current = { fn: fn as (pin?: string) => Promise<unknown>, resolve: resolve as (v: unknown) => void, reject };
      });
    }
  }, []);

  const submit = useCallback(async (pin: string) => {
    const p = pending.current;
    if (!p) return;
    setLoading(true);
    try {
      const v = await p.fn(pin);
      setOpen(false);
      pending.current = null;
      p.resolve(v);
    } catch (e) {
      if (e instanceof ApiError && (e.code === "approval.invalid" || e.code === "approval.required" || e.code === "pin.invalid")) setError("Wrong PIN or not allowed. Try again.");
      else { setOpen(false); pending.current = null; p.reject(e); setError(errorMessage(e)); }
    } finally {
      setLoading(false);
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    pending.current?.reject(new ApiError("approval.cancelled", "Approval cancelled", 0));
    pending.current = null;
  }, []);

  const dialog = <PinDialog open={open} onClose={close} onSubmit={submit} what={what} error={error} loading={loading} />;
  return { run, dialog };
}
