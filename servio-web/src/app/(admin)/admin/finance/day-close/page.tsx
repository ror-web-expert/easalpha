"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, Lock, Unlock } from "lucide-react";
import { api } from "@/lib/api";
import type { DayCloseStatus } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime, isoDay } from "@/lib/dates";
import { Cards, FilterBar, PageHeader } from "@/components/admin/page";
import { useAction } from "@/components/admin/crud";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Checkbox, Dialog, Field, Input, Loading, Stat, SummaryCard, Textarea } from "@/components/ui";
import { Breakdown } from "@/components/charts/charts";

export default function DayClosePage() {
  const [day, setDay] = useState(isoDay());
  const q = useQuery({ queryKey: ["day_close", day], queryFn: () => api<DayCloseStatus>("/day_close", { query: { business_day: day } }) });
  const [force, setForce] = useState(false);
  const [reopen, setReopen] = useState<string | null>(null);
  const lock = useAction<void>(["day_close", "dashboard"], () => api("/day_close/lock", { method: "POST", body: { business_day: day, force } }), "Day locked");
  const reopenM = useAction<void>(["day_close", "dashboard"], () => api("/day_close/reopen", { method: "POST", body: { business_day: day, reason: reopen } }), "Day reopened");
  const d = q.data;
  return (
    <>
      <PageHeader icon={CalendarCheck} title="Day close" description="Lock a business day once every shift is closed and no order is open. Locked days reject new sales." actions={d ? (d.locked ? <Button variant="secondary" onClick={() => setReopen("")}><Unlock className="h-4 w-4" /> Reopen day</Button> : <Button variant={d.ready ? "primary" : "destructive"} onClick={() => lock.mutate()} loading={lock.isPending} disabled={!d.ready && !force}><Lock className="h-4 w-4" /> {d.ready ? "Lock day" : "Force lock"}</Button>) : null} />
      <FilterBar>
        <Input type="date" className="w-auto" value={day} onChange={(e) => setDay(e.target.value)} />
        {d && !d.ready && !d.locked ? <Checkbox label="Force: close open shifts at expected cash and void unsent drafts" checked={force} onChange={(e) => setForce(e.target.checked)} /> : null}
      </FilterBar>
      {q.isLoading || !d ? <Loading /> : (
        <>
          <Cards>
            <SummaryCard label="Status" value={d.locked ? <Badge variant="primary" className="text-base">Locked</Badge> : d.ready ? <Badge variant="success" className="text-base">Ready to lock</Badge> : <Badge variant="warning" className="text-base">Not ready</Badge>} sub={d.locked_at ? `Locked ${formatDateTime(d.locked_at)}` : d.reopened_at ? `Reopened ${formatDateTime(d.reopened_at)}` : ""} tone="neutral" />
            <SummaryCard label="Open shifts" value={d.shifts.open} sub={`${d.shifts.total} total · ${d.shifts.unsettled} unsettled`} tone={d.shifts.open ? "warning" : "success"} />
            <SummaryCard label="Open orders" value={d.open_orders} sub={`${d.drafts} drafts or held`} tone={d.open_orders ? "warning" : "success"} />
            <SummaryCard label="Net sales" value={formatMoney(d.summary?.net_sales_minor)} sub={`${d.summary?.paid ?? 0} paid · ${d.summary?.voided ?? 0} voided`} tone="success" />
          </Cards>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
              <CardBody>
                <Stat label="Orders" value={d.summary?.orders ?? 0} />
                <Stat label="Discounts" value={formatMoney(d.summary?.discount_minor)} />
                <Stat label="Tax" value={formatMoney(d.summary?.tax_minor)} />
                <Stat label="Refunds" value={formatMoney(d.summary?.refunds_minor)} tone="danger" />
                <h4 className="mt-3 mb-1 text-xs font-semibold uppercase text-fg-secondary">Shifts</h4>
                {d.summary?.shifts.map((s) => <Stat key={s.id} label={`${s.status}`} value={s.over_short_minor !== null ? formatMoney(s.over_short_minor) : "open"} tone={s.over_short_minor !== null && s.over_short_minor < 0 ? "danger" : undefined} />)}
              </CardBody>
            </Card>
            <Card>
              <CardHeader><CardTitle>By payment method</CardTitle></CardHeader>
              <CardBody><Breakdown data={d.summary?.by_payment_method} /></CardBody>
            </Card>
          </div>
        </>
      )}
      <Dialog open={reopen !== null} onClose={() => setReopen(null)} title="Reopen day" description="A reason is logged in the audit trail." size="sm" footer={<><Button variant="secondary" onClick={() => setReopen(null)}>Cancel</Button><Button loading={reopenM.isPending} disabled={!reopen?.trim()} onClick={() => reopenM.mutate(undefined, { onSuccess: () => setReopen(null) })}>Reopen</Button></>}>
        <Field label="Reason"><Textarea value={reopen ?? ""} onChange={(e) => setReopen(e.target.value)} autoFocus /></Field>
      </Dialog>
    </>
  );
}
