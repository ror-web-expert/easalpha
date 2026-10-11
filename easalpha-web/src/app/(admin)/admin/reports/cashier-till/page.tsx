"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, FileDown, Lock, AlertTriangle } from "lucide-react";
import { api, errorCode, errorMessage } from "@/lib/api";
import type { CashierTillReport, DayEndSettlement } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime, isoDay } from "@/lib/dates";
import { exportTablePdf } from "@/lib/pdf";
import { useCan } from "@/store/auth";
import { Cards, DateRangePicker, FilterBar, PageHeader, type DateRange } from "@/components/admin/page";
import { RIDER_PERMS, dayEndNeedsForce, methodChips, tillNeedsSettlement, tillShiftsText } from "@/components/admin/riders-helpers";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Dialog, EmptyRow, ErrorState, Field, Input, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { toast } from "@/store/toast";

const EXPLANATION = "Orders taken and money collected are different measures and deliberately do not reconcile: an order rung up by one cashier and paid to another counts once for each. Only Collected is a figure someone is accountable for. In tills now is an all-time balance that runs until a Day-End Settlement clears it, so an unsettled till shows more than the period's collections.";

export default function CashierTillPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [range, setRange] = useState<DateRange>({ from: isoDay(), to: isoDay() });
  const q = useQuery({ queryKey: ["reports_cashier_till", range], queryFn: () => api<CashierTillReport>("/reports/cashier_till", { query: { from: range.from, to: range.to } }) });
  const [dialog, setDialog] = useState<{ business_day: string; note: string; needsForce: boolean; conflict: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const r = q.data;
  const rows = r?.rows ?? [];
  const canSettle = can(...RIDER_PERMS.dayEnd);
  const settle = async (force: boolean) => {
    if (!dialog) return;
    setBusy(true);
    try {
      const rec = await api<DayEndSettlement>("/day_end_settlements", { method: "POST", body: { business_day: dialog.business_day || undefined, note: dialog.note || undefined, force: force || undefined } });
      toast.success("Day-End Settlement recorded", `${rec.shifts_count} shift(s), ${formatMoney(rec.amount_minor)} cleared from tills`);
      setDialog(null);
      ["reports_cashier_till", "day_end_settlements", "shifts", "my_till", "accounts"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e) {
      if (dayEndNeedsForce(errorCode(e))) setDialog({ ...dialog, needsForce: true, conflict: errorMessage(e) });
      else toast.error("Could not settle", errorMessage(e));
    } finally { setBusy(false); }
  };
  const exportPdf = () => {
    if (!r) return;
    exportTablePdf({
      title: "Cashier Till", subtitle: `${range.from} to ${range.to}`, landscape: true, filename: `cashier-till-${range.from}-${range.to}.pdf`,
      columns: [{ header: "Cashier", key: "name" }, { header: "Orders taken", key: "orders", align: "right" }, { header: "Taken", key: "taken", align: "right" }, { header: "Payments", key: "payments", align: "right" }, { header: "Collected", key: "collected", align: "right" }, { header: "By method", key: "methods" }, { header: "In tills now", key: "tills", align: "right" }, { header: "Shifts", key: "shifts" }],
      rows: rows.map((x) => ({ name: x.name, orders: x.orders_taken, taken: formatMoney(x.taken_minor), payments: x.payments, collected: formatMoney(x.collected_minor), methods: methodChips(x.collected_by_method).map((m) => `${m.label} ${formatMoney(m.minor)}`).join(", "), tills: formatMoney(x.in_tills_now_minor), shifts: tillShiftsText(x) })),
      footer: [`Orders taken ${r.totals.orders_taken} (${formatMoney(r.totals.taken_minor)})  |  Collected ${formatMoney(r.totals.collected_minor)}  |  In tills now ${formatMoney(r.totals.in_tills_now_minor)}  |  Unsettled shifts ${r.totals.shifts_unsettled}`, r.note],
    });
  };
  return (
    <>
      <PageHeader icon={Landmark} title="Cashier Till" description="What each cashier rang up, what each cashier collected, and what is still sitting in their tills."
        actions={<>
          <Button variant="secondary" onClick={exportPdf} disabled={!rows.length}><FileDown className="h-4 w-4" /> PDF</Button>
          {canSettle ? <Button onClick={() => setDialog({ business_day: range.to || isoDay(), note: "", needsForce: false, conflict: null })}><Lock className="h-4 w-4" /> Day-End Settlement</Button> : null}
        </>} />
      <Card className="mb-6 border-info/40 bg-info-soft/40"><CardBody className="text-sm text-fg-secondary">{EXPLANATION}</CardBody></Card>
      <FilterBar><DateRangePicker value={range} onChange={setRange} /></FilterBar>
      <Cards className="xl:grid-cols-5">
        <SummaryCard label="Orders taken" value={r?.totals.orders_taken ?? 0} sub="Rung up in the period" tone="neutral" />
        <SummaryCard label="Taken" value={formatMoney(r?.totals.taken_minor ?? 0)} sub="Value of orders taken" tone="info" />
        <SummaryCard label="Collected" value={formatMoney(r?.totals.collected_minor ?? 0)} sub="Payments received, the accountable figure" tone="success" />
        <SummaryCard label="In tills now" value={formatMoney(r?.totals.in_tills_now_minor ?? 0)} sub="All-time, until a Day-End Settlement" tone={r?.totals.in_tills_now_minor ? "warning" : "neutral"} />
        <SummaryCard label="Unsettled shifts" value={r?.totals.shifts_unsettled ?? 0} sub="Closed, waiting for Day-End" tone={r?.totals.shifts_unsettled ? "danger" : "neutral"} />
      </Cards>
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message="Could not load the Cashier Till report" onRetry={() => q.refetch()} /> : (
        <Table>
          <THead><tr><TH>Cashier</TH><TH right>Orders taken</TH><TH right>Taken</TH><TH right>Payments</TH><TH right>Collected</TH><TH>Collected by method</TH><TH right>In tills now</TH><TH>Shifts</TH></tr></THead>
          <TBody>
            {rows.length ? rows.map((x) => (
              <TR key={x.membership_id}>
                <TD className="font-medium">{x.name}{tillNeedsSettlement(x) ? <Badge variant="warning" className="ml-2">unsettled</Badge> : null}</TD>
                <TD right>{x.orders_taken}</TD>
                <TD right className="text-fg-secondary">{formatMoney(x.taken_minor)}</TD>
                <TD right>{x.payments}</TD>
                <TD right className="font-medium">{formatMoney(x.collected_minor)}</TD>
                <TD><div className="flex flex-wrap gap-1">{methodChips(x.collected_by_method).map((m) => <Badge key={m.code} variant="outline">{m.label} {formatMoney(m.minor)}</Badge>)}{!Object.keys(x.collected_by_method).length ? <span className="text-xs text-fg-muted">-</span> : null}</div></TD>
                <TD right className={x.in_tills_now_minor ? "font-medium text-warning-ink" : "text-fg-muted"}>{formatMoney(x.in_tills_now_minor)}</TD>
                <TD className="text-fg-secondary">{tillShiftsText(x)}</TD>
              </TR>
            )) : <EmptyRow colSpan={8}>No orders, payments or till balances for this period.</EmptyRow>}
          </TBody>
          {rows.length && r ? <tfoot><tr className="border-t bg-muted/40 font-medium"><TD>Total</TD><TD right>{r.totals.orders_taken}</TD><TD right>{formatMoney(r.totals.taken_minor)}</TD><TD right>{rows.reduce((a, x) => a + x.payments, 0)}</TD><TD right>{formatMoney(r.totals.collected_minor)}</TD><TD /><TD right>{formatMoney(r.totals.in_tills_now_minor)}</TD><TD>{r.totals.shifts_unsettled} unsettled</TD></tr></tfoot> : null}
        </Table>
      )}
      <Card className="mt-6">
        <CardHeader><CardTitle>Day-End Settlements</CardTitle><span className="text-sm text-fg-secondary">Each one clears every closed, unsettled shift up to that business day</span></CardHeader>
        <CardBody className="p-0">
          <Table>
            <THead><tr><TH>Business day</TH><TH right>Shifts</TH><TH right>Amount cleared</TH><TH>Note</TH><TH>Recorded</TH></tr></THead>
            <TBody>
              {r?.settlements.length ? r.settlements.map((s) => (
                <TR key={s.id}><TD className="font-medium">{formatDate(s.business_day)}</TD><TD right>{s.shifts_count}</TD><TD right>{formatMoney(s.amount_minor)}</TD><TD className="text-fg-secondary">{s.note ?? "-"}{(s.detail as { forced?: boolean } | null)?.forced ? <Badge variant="warning" className="ml-2">forced</Badge> : null}</TD><TD className="text-fg-secondary">{formatDateTime(s.created_at)}</TD></TR>
              )) : <EmptyRow colSpan={5}>No Day-End Settlement in this period. Build the settlement record first; the report is meaningless without it.</EmptyRow>}
            </TBody>
          </Table>
        </CardBody>
      </Card>

      <Dialog open={!!dialog} onClose={() => setDialog(null)} title="Day-End Settlement" description="Settles every closed, unsettled shift up to the business day and clears In tills now. Tills still open are not touched unless you force." size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
          {dialog?.needsForce ? <Button variant="destructive" loading={busy} onClick={() => settle(true)}><AlertTriangle className="h-4 w-4" /> Force</Button> : <Button loading={busy} onClick={() => settle(false)}>Settle</Button>}
        </>}>
        {dialog ? (
          <div className="space-y-3">
            <Field label="Business day"><Input type="date" value={dialog.business_day} onChange={(e) => setDialog({ ...dialog, business_day: e.target.value, needsForce: false, conflict: null })} /></Field>
            <Field label="Note"><Textarea value={dialog.note} onChange={(e) => setDialog({ ...dialog, note: e.target.value })} placeholder="Counted by the manager at close" /></Field>
            {dialog.needsForce ? <div className="rounded-md bg-warning-soft p-3 text-sm text-warning-ink"><strong>Tills are still open.</strong> {dialog.conflict} Force settles the closed shifts anyway and leaves the open tills for the next settlement.</div> : null}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
