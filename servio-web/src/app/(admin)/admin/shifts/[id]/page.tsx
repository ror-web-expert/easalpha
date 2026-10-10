"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Wallet, Printer } from "lucide-react";
import { api } from "@/lib/api";
import type { Shift, ZReport } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { Cards, PageHeader } from "@/components/admin/page";
import { useAction } from "@/components/admin/crud";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Dialog, Field, Loading, MoneyInput, SummaryCard, Textarea } from "@/components/ui";
import { ZReportView } from "@/components/z-report";
import { useAuthStore } from "@/store/auth";

export default function ShiftDetailPage() {
  const { id } = useParams<{ id: string }>();
  const currency = useAuthStore((s) => s.session?.business.currency);
  const shift = useQuery({ queryKey: ["shift", id], queryFn: () => api<Shift>(`/shifts/${id}`) });
  const z = useQuery({ queryKey: ["z_report", id], queryFn: () => api<ZReport>(`/shifts/${id}/z_report`) });
  const [closeOpen, setCloseOpen] = useState(false);
  const [counted, setCounted] = useState(0);
  const [note, setNote] = useState("");
  const approve = useAction<void>(["shift", "shifts"], () => api(`/shifts/${id}/approve`, { method: "POST" }), "Shift approved");
  const settle = useAction<void>(["shift", "shifts"], () => api(`/shifts/${id}/settle`, { method: "POST" }), "Shift settled");
  const close = useAction<void>(["shift", "shifts", "z_report"], () => api(`/shifts/${id}/close`, { method: "POST", body: { counted_cash_minor: counted, note, force: true } }), "Shift closed");
  const s = shift.data;
  if (!s) return <Loading />;
  const os = s.over_short_minor;
  return (
    <>
      <PageHeader icon={Wallet} title={`Shift ${formatDateTime(s.opened_at)}`} description={`${z.data?.cashier ?? "Cashier"} · day ${s.business_day}`} actions={<>
        <Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print Z report</Button>
        {s.status === "open" ? <Button variant="destructive" onClick={() => { setCounted(s.expected_cash_minor ?? 0); setCloseOpen(true); }}>Force close</Button> : null}
        {s.status !== "open" && !s.approved_by_membership_id ? <Button variant="secondary" onClick={() => approve.mutate()} loading={approve.isPending}>Approve count</Button> : null}
        {s.status !== "open" && s.settlement_status !== "settled" ? <Button onClick={() => settle.mutate()} loading={settle.isPending}>Settle</Button> : null}
      </>} />
      <Cards>
        <SummaryCard label="Status" value={<Badge variant={s.status === "open" ? "info" : "primary"} className="text-base">{s.status}</Badge>} sub={s.closed_at ? `Closed ${formatDateTime(s.closed_at)}` : "Still open"} tone="neutral" />
        <SummaryCard label="Expected cash" value={formatMoney(s.expected_cash_minor, currency)} sub={`Opening ${formatMoney(s.opening_cash_minor, currency)}`} />
        <SummaryCard label="Counted" value={s.counted_cash_minor !== null ? formatMoney(s.counted_cash_minor, currency) : "-"} sub={s.close_note ?? ""} tone="neutral" />
        <SummaryCard label={os !== null && os !== undefined && os < 0 ? "Short" : "Over"} value={os !== null && os !== undefined ? formatMoney(Math.abs(os), currency) : "-"} sub={s.approved_by_membership_id ? "Approved by manager" : s.settlement_status} tone={os === null || os === undefined ? "neutral" : os < 0 ? "danger" : "success"} />
      </Cards>
      <Card className="print-area max-w-2xl">
        <CardHeader><CardTitle>Z report</CardTitle></CardHeader>
        <CardBody>{z.data ? <ZReportView z={z.data} currency={currency} /> : <Loading />}</CardBody>
      </Card>
      <Dialog open={closeOpen} onClose={() => setCloseOpen(false)} title="Force close shift" description="Use when the cashier left without closing. The counted amount becomes the drawer figure." size="sm" footer={<><Button variant="secondary" onClick={() => setCloseOpen(false)}>Cancel</Button><Button variant="destructive" loading={close.isPending} onClick={() => close.mutate(undefined, { onSuccess: () => setCloseOpen(false) })}>Close shift</Button></>}>
        <div className="space-y-3">
          <Field label="Counted cash"><MoneyInput value={counted} onChange={setCounted} /></Field>
          <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      </Dialog>
    </>
  );
}
