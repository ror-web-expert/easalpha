"use client";
import { useEffect, useMemo, useState } from "react";
import { Banknote } from "lucide-react";
import { ApiError, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { accountPaymentReceipt, receiveCustomerPayment, type AccountCustomer } from "@/lib/customer-payments";
import { paymentReceiptLines, printJob } from "@/lib/print";
import { useApproval } from "@/components/approval";
import { useCatalogStore } from "@/store/catalog";
import { useSyncStore } from "@/store/sync";
import { Button, Dialog, Field, Input, MoneyInput, Select } from "@/components/ui";
import { toast } from "@/store/toast";

/**
 * Money received against a customer's account at the till (review, debit side, items 1 to 3): the amount, a cash, card,
 * wallet or bank method and a reference; recorded on the server, or queued as a customer_payment while offline, then
 * the ACCOUNT PAYMENT receipt is printed. A cashier without khata.collect is asked for a manager's PIN the usual way.
 */
export function ReceivePaymentDialog({ open, onClose, customer, onReceived }: { open: boolean; onClose: () => void; customer: AccountCustomer; onReceived?: (newBalanceMinor: number | null) => void }) {
  const allMethods = useCatalogStore((s) => s.paymentMethods);
  const settings = useCatalogStore((s) => s.catalog?.business.settings);
  const currency = useCatalogStore((s) => s.catalog?.business.currency);
  const status = useSyncStore((s) => s.status);
  const offline = status === "offline";
  // Khata cannot settle khata, and internal methods (the canteen subsidy, salary deductions) are the system's.
  const methods = useMemo(() => allMethods.filter((m) => m.active && !m.internal && m.kind !== "khata" && (!offline || m.works_offline)).sort((a, b) => a.sort_order - b.sort_order), [allMethods, offline]);
  const { run, dialog } = useApproval();
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setAmount(0); setReference(""); setMethod(methods.find((m) => m.kind === "cash")?.code ?? methods[0]?.code ?? ""); } }, [open, methods]);
  const chosen = methods.find((m) => m.code === method);
  const needsRef = !!chosen?.needs_reference && !reference.trim();
  const ok = amount > 0 && !!chosen && !needsRef && !busy;
  const balance = customer.balance_minor;
  const owes = balance == null ? null : balance > 0 ? `Owes ${formatMoney(balance, currency)}.` : balance < 0 ? `${formatMoney(-balance, currency)} in credit.` : "Owes nothing.";

  const submit = async () => {
    if (!ok || !chosen) return;
    setBusy(true);
    try {
      const r = await run((pin) => receiveCustomerPayment(customer, { amount_minor: amount, method_code: chosen.code, reference }, pin), `Receive ${formatMoney(amount, currency)} from ${customer.name}`);
      const now = r.new_balance_minor === null ? "" : ` Balance now ${r.new_balance_minor < 0 ? `${formatMoney(-r.new_balance_minor, currency)} in credit` : formatMoney(r.new_balance_minor, currency)}.`;
      toast.success(`${formatMoney(amount, currency)} received from ${customer.name}`, `${r.offline ? "Kept on this till; it reaches the account when the till is back online." : "Recorded on the account."}${now}`);
      const printed = await printJob({ role: "receipt", lines: paymentReceiptLines(accountPaymentReceipt(r), { settings }) }, { settings });
      if (!printed.ok) toast.error("Could not print the receipt", printed.error);
      onReceived?.(r.new_balance_minor);
      onClose();
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "approval.cancelled")) toast.error("Could not receive the payment", errorMessage(e));
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} title={`Receive payment · ${customer.name}`} description="Money paid against the account. A receipt prints; the balance updates at once." size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={!ok} loading={busy}><Banknote className="h-4 w-4" /> Receive {formatMoney(amount, currency)}</Button></>}>
      <div className="space-y-3">
        {owes ? <p className="text-sm text-fg-secondary">{owes}{customer.khata_no ? ` Khata ${customer.khata_no}.` : ""}</p> : null}
        <Field label="Amount"><MoneyInput value={amount} onChange={setAmount} className="h-12 text-lg" autoFocus /></Field>
        <Field label="Method">
          <Select value={method} onChange={(e) => setMethod(e.target.value)} className="h-12" aria-label="Method">{methods.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</Select>
        </Field>
        {!methods.length ? <p className="text-sm text-danger">{offline ? "No payment method works offline. Mark cash as working offline in Settings, Payments." : "No cash, card, wallet or bank method is set up."}</p> : null}
        <Field label={`Reference${chosen?.needs_reference ? " (required)" : ""}`}><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction id / slip no." className="h-12 text-base" /></Field>
        {offline ? <p className="text-sm text-warning-ink">No internet: the payment is kept on this till and reaches the account when it is back online.</p> : null}
      </div>
      {dialog}
    </Dialog>
  );
}
