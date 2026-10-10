"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileStack, ArrowLeft, CheckCircle2, Ban, Trash2, Send, ShieldCheck, Truck, PackageCheck, AlertTriangle } from "lucide-react";
import { api, errorCode, errorMessage } from "@/lib/api";
import type { StockDocument } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatBaseQty, formatUnitQty } from "@/lib/units";
import { useCan } from "@/store/auth";
import { PageHeader } from "@/components/admin/page";
import { useRemove } from "@/components/admin/crud";
import { useApproval } from "@/components/approval";
import { sectionName, useSections, useUnits } from "@/components/admin/stock";
import { staffName, useStaff } from "@/components/admin/phase3";
import { ACTION_LABELS, allowedActions, docKindMeta, normalizeStatus, POSTING_ACTIONS, type DocAction } from "@/components/admin/inventory-helpers";
import { DocKindBadge, DocStatusBadge, DocumentTimeline } from "@/components/admin/inventory-document";
import { Button, Card, CardBody, CardHeader, CardTitle, ConfirmDialog, Dialog, EmptyRow, Field, Input, KeyValue, Loading, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { toast } from "@/store/toast";

const INVALIDATE = ["stock_documents", "stock_document", "stock_levels", "stock_valuation", "stock_items", "stock_item", "stock_item_ledger", "daily_sheet", "stock_waste"];
const STATUS_HINT: Record<string, string> = {
  draft: "Nothing has moved yet. Post to write the ledger, or submit it for a manager to approve.",
  awaiting_approval: "Waiting for someone with the Stock Actions permission. Approving posts it; a transfer goes in transit instead.",
  in_transit: "The stock has left the source section. Receive it to land it in the destination.",
  posted: "Written to the ledger. Voiding writes reversing entries; the original rows stay.",
  voided: "Reversed with offsetting ledger entries. Nothing more can happen to it.",
};
const ACTION_ICONS: Record<DocAction, React.ComponentType<{ className?: string }>> = { submit: Send, approve: ShieldCheck, dispatch: Truck, receive: PackageCheck, post: CheckCircle2, void: Ban, delete: Trash2 };

export default function StockActionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const can = useCan();
  const sections = useSections();
  const units = useUnits();
  const staff = useStaff();
  const q = useQuery({ queryKey: ["stock_document", id], queryFn: () => api<StockDocument>(`/stock_documents/${id}`) });
  const { run, dialog: pinDialog } = useApproval();
  const [busy, setBusy] = useState<DocAction | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [del, setDel] = useState(false);
  const [apiError, setApiError] = useState<{ code: string; message: string } | null>(null);
  const remove = useRemove(["stock_documents"], (did) => `/stock_documents/${did}`, "Draft deleted");
  const invalidate = () => INVALIDATE.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const d = q.data;
  if (q.isLoading || !d) return <Loading />;
  const meta = docKindMeta(d.kind);
  const status = normalizeStatus(d.status);
  const isCount = d.kind === "count";
  const showCost = meta.cost;
  const baseCodeFor = (unitId: string) => { const u = units.data?.find((x) => x.id === unitId); return units.data?.find((x) => x.kind === u?.kind && x.is_base)?.code ?? ""; };
  const who = (mid: string | null) => (staff.isError ? "-" : staffName(staff.data, mid));
  const actions = allowedActions(d.status, d.kind).filter((a) => !POSTING_ACTIONS.includes(a) || can("stock.actions"));

  const call = async (action: DocAction, fn: () => Promise<unknown>, done: string) => {
    setBusy(action);
    setApiError(null);
    try { await fn(); invalidate(); toast.success(done); return true; }
    catch (e) {
      if (errorCode(e) !== "approval.cancelled") { setApiError({ code: errorCode(e), message: errorMessage(e) }); toast.error(`Could not ${ACTION_LABELS[action].toLowerCase()}`, errorMessage(e)); }
      return false;
    } finally { setBusy(null); }
  };
  const act = (action: DocAction) => {
    switch (action) {
      case "submit": return call(action, () => api(`/stock_documents/${d.id}/submit`, { method: "POST" }), `${d.label} submitted for approval`);
      case "approve": return call(action, () => api(`/stock_documents/${d.id}/approve`, { method: "POST" }), d.kind === "transfer" ? `${d.label} approved and dispatched` : `${d.label} approved and posted`);
      case "dispatch": return call(action, () => api(`/stock_documents/${d.id}/dispatch`, { method: "POST" }), `${d.label} dispatched`);
      case "receive": return call(action, () => api(`/stock_documents/${d.id}/receive`, { method: "POST" }), `${d.label} received and posted`);
      case "post": return call(action, () => api(`/stock_documents/${d.id}/post`, { method: "POST" }), `${d.label} posted`);
      case "void": setVoidReason(""); setVoidOpen(true); return;
      case "delete": setDel(true); return;
    }
  };
  const doVoid = async () => {
    const ok = await call("void", () => run((pin) => api(`/stock_documents/${d.id}/cancel`, { method: "POST", body: { reason: voidReason || undefined, approver_pin: pin } }), `Void ${d.label}`), `${d.label} voided`);
    if (ok) setVoidOpen(false);
  };

  return (
    <>
      <PageHeader icon={FileStack} title={d.label} description={`${meta.label} · posting date ${formatDate(d.posting_date ?? d.business_day)}`} actions={<>
        <Link href="/admin/inventory/stock-actions"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /> Stock Actions</Button></Link>
        {actions.map((a) => {
          const Icon = ACTION_ICONS[a];
          const destructive = a === "void" || a === "delete";
          const primary = a === "post" || a === "approve" || a === "receive";
          return <Button key={a} variant={destructive ? "destructive" : primary ? "primary" : "secondary"} onClick={() => act(a)} loading={busy === a} disabled={!!busy}><Icon className="h-4 w-4" /> {ACTION_LABELS[a]}</Button>;
        })}
      </>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DocKindBadge kind={d.kind} />
        <DocStatusBadge status={d.status} />
        <span className="text-xs text-fg-muted">{STATUS_HINT[status]}</span>
      </div>
      {apiError ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger/50 bg-danger-soft px-4 py-3 text-sm text-danger-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span><span className="font-medium">{apiError.message}</span> <span className="font-mono text-xs opacity-80">({apiError.code})</span></span>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardBody>
              <KeyValue items={[
                { label: "Number", value: <span className="font-mono">{d.label}</span> },
                { label: "Type", value: meta.label },
                ...(d.from_section_id ? [{ label: d.kind === "transfer" ? "From" : "Section", value: sectionName(sections.data, d.from_section_id) }] : []),
                ...(d.to_section_id ? [{ label: d.kind === "transfer" ? "To" : "Into", value: sectionName(sections.data, d.to_section_id) }] : []),
                { label: "Posting date", value: formatDate(d.posting_date ?? d.business_day) },
                ...(d.purchase_order_id ? [{ label: "Purchase order", value: <Link href={`/admin/purchasing/purchase-orders/${d.purchase_order_id}`} className="text-primary hover:underline">Open PO</Link> }] : []),
                ...(d.invoice_ref ? [{ label: "Invoice", value: d.invoice_ref }] : []),
                ...(d.reason ? [{ label: "Reason", value: d.reason }] : []),
                { label: "Lines", value: d.line_count },
                ...(showCost ? [{ label: "Total value", value: formatMoney(d.total_cost_minor) }] : []),
                { label: "Created by", value: who(d.by_membership_id) },
                { label: "Created", value: formatDateTime(d.created_at) },
              ]} />
              {d.note ? <p className="mt-3 whitespace-pre-wrap border-t pt-3 text-sm text-fg-secondary">{d.note}</p> : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader><CardTitle>Status timeline</CardTitle></CardHeader>
            <CardBody><DocumentTimeline doc={d} staff={staff.data} staffUnavailable={staff.isError} /></CardBody>
          </Card>
        </div>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Lines</CardTitle><span className="text-sm text-fg-secondary">{d.line_count} line{d.line_count === 1 ? "" : "s"}</span></CardHeader>
          <Table>
            <THead><tr><TH>Item</TH>{isCount ? <><TH right>Expected</TH><TH right>Counted</TH><TH right>Difference</TH></> : <><TH right>Quantity</TH><TH right>In base unit</TH></>}{showCost ? <><TH right>Unit cost</TH><TH right>Line value</TH></> : null}<TH>Batch / expiry</TH></tr></THead>
            <TBody>
              {d.lines?.length ? d.lines.map((l) => {
                const diff = isCount && l.counted_qty !== null && l.expected_qty !== null ? Number(l.counted_qty) - Number(l.expected_qty) : null;
                return (
                  <TR key={l.id}>
                    <TD><Link href={`/admin/inventory/items/${l.stock_item_id}`} className="font-medium text-primary hover:underline">{l.item_name}</Link>{l.note ? <div className="text-xs text-fg-muted">{l.note}</div> : null}</TD>
                    {isCount ? <>
                      <TD right className="text-fg-secondary">{l.expected_qty !== null ? formatUnitQty(l.expected_qty, l.unit_code) : "-"}</TD>
                      <TD right className="font-medium">{formatUnitQty(l.counted_qty, l.unit_code)}</TD>
                      <TD right className={diff === null ? "" : diff < 0 ? "text-danger" : diff > 0 ? "text-success" : "text-fg-muted"}>{diff === null ? "-" : `${diff > 0 ? "+" : ""}${diff.toLocaleString("en-US", { maximumFractionDigits: 3 })} ${l.unit_code}`}</TD>
                    </> : <>
                      <TD right className="font-medium">{formatUnitQty(l.quantity, l.unit_code)}</TD>
                      <TD right className="text-fg-secondary">{formatBaseQty(l.base_quantity, baseCodeFor(l.unit_id))}</TD>
                    </>}
                    {showCost ? <>
                      <TD right className="text-fg-secondary">{l.unit_cost_minor !== null ? `${formatMoney(l.unit_cost_minor)} / ${l.unit_code}` : "-"}</TD>
                      <TD right>{l.unit_cost_minor !== null ? formatMoney(Math.round(l.unit_cost_minor * Number(l.quantity))) : "-"}</TD>
                    </> : null}
                    <TD className="text-fg-secondary">{[l.batch_no, l.expires_on ? `exp ${formatDate(l.expires_on)}` : null].filter(Boolean).join(" · ") || "-"}</TD>
                  </TR>
                );
              }) : <EmptyRow colSpan={isCount ? 5 : showCost ? 6 : 4}>No lines.</EmptyRow>}
            </TBody>
          </Table>
        </Card>
      </div>
      <Dialog open={voidOpen} onClose={() => setVoidOpen(false)} title={`Void ${d.label}?`} description={status === "posted" ? "Reversing ledger entries are written; the original rows stay. A manager PIN may be asked for." : "The document is marked voided and can no longer be posted."} size="sm"
        footer={<><Button variant="secondary" onClick={() => setVoidOpen(false)}>Keep</Button><Button variant="destructive" onClick={doVoid} loading={busy === "void"}>Void</Button></>}>
        <Field label="Reason"><Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Wrong supplier, duplicate…" autoFocus /></Field>
      </Dialog>
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={() => remove.mutate(d.id, { onSuccess: () => router.replace("/admin/inventory/stock-actions") })} title={`Delete draft ${d.label}?`} description="Drafts have not touched stock; deleting is permanent." confirmLabel="Delete" destructive loading={remove.isPending} />
      {pinDialog}
    </>
  );
}
