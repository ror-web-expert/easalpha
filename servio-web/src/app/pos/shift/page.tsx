"use client";
import { useEffect, useState } from "react";
import { Wallet, ArrowDownToLine, ArrowUpFromLine, Lock, Printer } from "lucide-react";
import { useCatalogStore } from "@/store/catalog";
import { useDeviceStore } from "@/store/device";
import { useSyncStore } from "@/store/sync";
import { cashMovement, closeShift, loadCurrentShift, openShift } from "@/lib/pos-actions";
import { errorMessage } from "@/lib/api";
import type { ZReport } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { PosShell } from "@/components/pos/shell";
import { ZReportView } from "@/components/z-report";
import { useApproval } from "@/components/approval";
import { Button, Card, CardBody, CardHeader, CardTitle, Dialog, EmptyState, Field, Input, MoneyInput, Stat, Textarea } from "@/components/ui";
import { toast } from "@/store/toast";

const DENOMS = [5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1];

export default function ShiftPage() {
  const shift = useCatalogStore((s) => s.shift);
  const currency = useCatalogStore((s) => s.catalog?.business.currency);
  const session = useDeviceStore((s) => s.session);
  const status = useSyncStore((s) => s.status);
  const { run, dialog } = useApproval();
  const [opening, setOpening] = useState<number | null>(null);
  const [move, setMove] = useState<{ kind: "cash_in" | "cash_out"; amount: number; reason: string } | null>(null);
  const [closing, setClosing] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [z, setZ] = useState<ZReport | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { loadCurrentShift(); }, []);
  const counted = DENOMS.reduce((s, d) => s + (counts[d] || 0) * d * 100, 0);

  const doOpen = async () => {
    setBusy(true);
    try { const r = await openShift(opening ?? 0); toast.success(r.offline ? "Shift opened on till; syncs later" : "Shift opened"); setOpening(null); }
    catch (e) { toast.error("Could not open shift", errorMessage(e)); }
    finally { setBusy(false); }
  };
  const doMove = async () => {
    if (!shift || !move) return;
    setBusy(true);
    try { const r = await run((pin) => cashMovement(shift, move.kind, move.amount, move.reason, pin), `${titleCase(move.kind)} ${formatMoney(move.amount, currency)}`); toast.success(r.offline ? "Recorded on till" : "Recorded"); setMove(null); }
    catch (e) { toast.error("Could not record", errorMessage(e)); }
    finally { setBusy(false); }
  };
  const doClose = async () => {
    if (!shift) return;
    setBusy(true);
    try {
      const r = await run((pin) => closeShift(shift, counted, Object.fromEntries(DENOMS.map((d) => [String(d), counts[d] || 0])), note, pin), "Close shift");
      setClosing(false); setCounts({}); setNote("");
      if (r.z) setZ(r.z); else toast.info("Shift closed on till", "The Z report is available once the till syncs.");
    } catch (e) { toast.error("Could not close shift", errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <PosShell title="Shift">
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        {!shift ? (
          <EmptyState icon={Wallet} title="No open shift" hint={`Open a shift for ${session?.user?.name ?? "you"} to take cash payments.`} action={<Button size="xl" onClick={() => setOpening(0)}>Open shift</Button>} />
        ) : (
          <>
            <Card>
              <CardHeader><CardTitle>Open shift</CardTitle><span className="text-sm text-fg-secondary">since {formatDateTime(shift.opened_at)}</span></CardHeader>
              <CardBody>
                <Stat label="Business day" value={shift.business_day} />
                <Stat label="Opening cash" value={formatMoney(shift.opening_cash_minor, currency)} />
                {shift.movements?.length ? <div className="mt-3 border-t pt-2">{shift.movements.map((m) => <Stat key={m.id} label={`${titleCase(m.kind)}${m.reason ? ` · ${m.reason}` : ""}`} value={formatMoney(m.amount_minor, currency)} tone={m.amount_minor >= 0 ? "success" : "danger"} />)}</div> : null}
                <p className="mt-3 text-xs text-fg-muted">Expected cash is not shown here: the close is a blind count.</p>
              </CardBody>
            </Card>
            <div className="grid grid-cols-2 gap-3">
              <Button size="xl" variant="secondary" onClick={() => setMove({ kind: "cash_in", amount: 0, reason: "" })}><ArrowDownToLine className="h-5 w-5" /> Cash in</Button>
              <Button size="xl" variant="secondary" onClick={() => setMove({ kind: "cash_out", amount: 0, reason: "" })}><ArrowUpFromLine className="h-5 w-5" /> Cash out</Button>
              <Button size="xl" variant="destructive" className="col-span-2" onClick={() => setClosing(true)}><Lock className="h-5 w-5" /> Close shift (blind count)</Button>
            </div>
          </>
        )}
        {status === "offline" ? <p className="text-center text-sm text-warning">Offline: shift actions are saved on the till and sent later.</p> : null}
      </div>
      <Dialog open={opening !== null} onClose={() => setOpening(null)} title="Open shift" description="Count the cash in the drawer before you start." size="sm" footer={<><Button variant="secondary" onClick={() => setOpening(null)}>Cancel</Button><Button loading={busy} onClick={doOpen}>Open</Button></>}>
        <Field label="Opening cash"><MoneyInput value={opening ?? 0} onChange={setOpening} className="h-14 text-2xl" autoFocus /></Field>
      </Dialog>
      <Dialog open={!!move} onClose={() => setMove(null)} title={move?.kind === "cash_in" ? "Cash in" : "Cash out"} description={move?.kind === "cash_out" ? "Petty cash, supplier payment, drop to safe. A manager PIN may be asked." : "Float added to the drawer."} size="sm" footer={<><Button variant="secondary" onClick={() => setMove(null)}>Cancel</Button><Button loading={busy} disabled={!move?.amount || !move?.reason.trim()} onClick={doMove}>Record</Button></>}>
        {move ? <div className="space-y-3"><Field label="Amount"><MoneyInput value={move.amount} onChange={(v) => setMove({ ...move, amount: v })} className="h-14 text-2xl" autoFocus /></Field><Field label="Reason"><Input value={move.reason} onChange={(e) => setMove({ ...move, reason: e.target.value })} className="h-12" placeholder="Milk, change float, drop…" /></Field></div> : null}
      </Dialog>
      <Dialog open={closing} onClose={() => setClosing(false)} title="Close shift" description="Count every denomination. The system compares with its own figure after you submit." size="md" footer={<><Button variant="secondary" onClick={() => setClosing(false)}>Cancel</Button><Button variant="destructive" loading={busy} onClick={doClose}>Close with {formatMoney(counted, currency)}</Button></>}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DENOMS.map((d) => (
            <label key={d} className="rounded-lg border p-2 text-sm"><span className="block text-fg-secondary">Rs {d.toLocaleString()} ×</span><Input type="number" inputMode="numeric" min={0} className="mt-1 h-12 text-lg" value={counts[d] ?? ""} onChange={(e) => setCounts({ ...counts, [d]: Math.max(0, Number(e.target.value)) })} /></label>
          ))}
        </div>
        <div className="mt-3 flex items-baseline justify-between"><span className="font-semibold">Counted</span><span className="text-3xl font-bold tabular">{formatMoney(counted, currency)}</span></div>
        <Field label="Note" className="mt-3"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </Dialog>
      <Dialog open={!!z} onClose={() => setZ(null)} title="Z report" description="Shift closed." size="md" footer={<><Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button><Button onClick={() => setZ(null)}>Done</Button></>}>
        <div className="print-area">{z ? <ZReportView z={z} currency={currency} /> : null}</div>
      </Dialog>
      {dialog}
    </PosShell>
  );
}
