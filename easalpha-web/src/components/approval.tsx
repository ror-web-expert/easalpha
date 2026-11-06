"use client";
import { useCallback, useRef, useState } from "react";
import { PinDialog } from "@/components/ui/pin-pad";
import { needsApproval, errorMessage, ApiError } from "@/lib/api";
import { approvalAsk, mergeAsk, withApprovalCodes, type ApprovalAsk } from "@/lib/approval-codes";

/** Refusals that name a permission a manager's PIN can still lift (the API puts it in error.details.permissions). */
const APPROVABLE = ["approval.required", "permission.denied"];
/** Answers to a PIN that was tried: wrong, or the manager may not do this. pin.required goes back to the screen, which
 * asks for the user's own order-update PIN or a manager with REOPEN_ORDER (pos/page.tsx withOrderPin). */
const REFUSED_PIN = ["approval.invalid", "approval.required", "pin.invalid"];

type Pending = { fn: (pin?: string, codes?: string[]) => Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void; ask: ApprovalAsk };

/**
 * Runs an action; when the API answers "approval.required" / "permission.denied", opens the manager PIN dialog
 * and retries with approver_pin. A wrong PIN keeps the dialog open, empty, for another try; it is never re-sent.
 * The dialog lists what the refusal named (details.permissions) and the retry approves only that (review of 6 Nov
 * 2026, R6): fn gets the codes as its second argument, and any request carrying the PIN takes them along as
 * approval_codes (lib/approval-codes.ts). If the next step then needs another permission, it is added to the list and
 * the manager enters the PIN again for all of it.
 * Usage: const { run, dialog } = useApproval(); await run((pin) => api(..., { approver_pin: pin }), "Void order #12")
 */
export function useApproval() {
  const [open, setOpen] = useState(false);
  const [what, setWhat] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ask, setAsk] = useState<ApprovalAsk>({ codes: [], labels: {} });
  const [loading, setLoading] = useState(false);
  const pending = useRef<Pending | null>(null);

  const run = useCallback(async <T,>(fn: (pin?: string, codes?: string[]) => Promise<T>, label?: string): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (!needsApproval(e)) throw e;
      const first = approvalAsk(e);
      setWhat(label);
      setError(null);
      setNotice(null);
      setAsk(first);
      setOpen(true);
      return new Promise<T>((resolve, reject) => {
        pending.current = { fn: fn as Pending["fn"], resolve: resolve as (v: unknown) => void, reject, ask: first };
      });
    }
  }, []);

  const submit = useCallback(async (pin: string) => {
    const p = pending.current;
    if (!p) return;
    setLoading(true);
    try {
      const codes = p.ask.codes;
      const v = await withApprovalCodes(pin, codes, () => p.fn(pin, codes));
      setOpen(false);
      pending.current = null;
      p.resolve(v);
    } catch (e) {
      const more = approvalAsk(e);
      const added = more.codes.filter((c) => !p.ask.codes.includes(c));
      if (e instanceof ApiError && APPROVABLE.includes(e.code) && added.length) {
        // The approved step passed and the next one needs its own permission: the PIN only covered what was listed.
        p.ask = mergeAsk(p.ask, more);
        setAsk(p.ask);
        setError(null);
        setNotice(`This also needs: ${added.map((c) => p.ask.labels[c] ?? c).join(", ")}. Enter the PIN again to approve all of it.`);
      } else if (e instanceof ApiError && REFUSED_PIN.includes(e.code)) {
        setNotice(null);
        setError("Wrong PIN or not allowed. Try again.");
      } else { setOpen(false); pending.current = null; p.reject(e); setError(errorMessage(e)); }
    } finally {
      setLoading(false);
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    pending.current?.reject(new ApiError("approval.cancelled", "Approval cancelled", 0));
    pending.current = null;
  }, []);

  const approves = ask.codes.map((code) => ({ code, label: ask.labels[code] ?? code }));
  const dialog = <PinDialog open={open} onClose={close} onSubmit={submit} what={what} approves={approves} notice={notice} error={error} loading={loading} />;
  // open: the PIN dialog is showing, e.g. for a screen that pauses other input meanwhile.
  return { run, dialog, open };
}
