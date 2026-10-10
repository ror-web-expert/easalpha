"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileStack, ArrowLeft, CheckCircle2, Ban, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { StockDocument } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatBaseQty, formatUnitQty } from "@/lib/units";
import { PageHeader } from "@/components/admin/page";
import { useRemove } from "@/components/admin/crud";
import { useApproval } from "@/components/approval";
import { docKindVariant, docStatusVariant, KIND_LABELS, sectionName, useSections, useUnits } from "@/components/admin/stock";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, ConfirmDialog, Dialog, EmptyRow, Field, Input, KeyValue, Loading, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { toast } from "@/store/toast";

const INVALIDATE = ["stock_documents", "stock_document", "stock_levels", "stock_valuation", "stock_items", "stock_item", "stock_item_ledger", "daily_sheet", "stock_waste"];

export default function StockDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const sections = useSections();
  const units = useUnits();
  const q = useQuery({ queryKey: ["stock_document", id], queryFn: () => api<StockDocument>(`/stock_documents/${id}`) });
  const { run, dialog: pinDialog } = useApproval();
  const [posting, setPosting] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [del, setDel] = useState(false);
  const remove = useRemove(["stock_documents"], (did) => `/stock_documents/${did}`, "Draft deleted");
  const invalidate = () => INVALIDATE.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const d = q.data;
  if (q.isLoading || !d) return <Loading />;
  const isCount = d.kind === "count";
  const isReceive = d.kind === "receive";
  const baseCodeFor = (unitId: string) => { const u = units.data?.find((x) => x.id === unitId); return units.data?.find((x) => x.kind === u?.kind && x.is_base)?.code ?? ""; };

  const post = async () => {
    setPosting(true);
    try { await api(`/stock_documents/${d.id}/post`, { method: "POST" }); invalidate(); toast.success(`${d.label} posted`); }
    catch (e) { toast.error("Could not post", errorMessage(e)); }
    finally { setPosting(false); }
  };
  const cancel = async () => {
    setCancelling(true);
    try {
      await run((pin) => api(`/stock_documents/${d.id}/cancel`, { method: "POST", body: { reason: cancelReason || undefined, approver_pin: pin } }), `Cancel ${d.label}`);
      invalidate(); setCancelOpen(false); toast.success(`${d.label} cancelled`);
    } catch (e) { if (errorMessage(e) !== "Approval cancelled") toast.error("Could not cancel", errorMessage(e)); }
    finally { setCancelling(false); }
  };

  return (
    <>
      <PageHeader icon={FileStack} title={d.label} description={`${KIND_LABELS[d.kind] ?? d.kind} · business day ${formatDate(d.business_day)}`} actions={<>
        <Link href="/admin/inventory/stock-actions"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /> Documents</Button></Link>
        {d.status === "draft" ? <>
          <Button variant="destructive" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" /> Delete draft</Button>
          <Button onClick={post} loading={posting}><CheckCircle2 className="h-4 w-4" /> Post</Button>
        </> : null}
        {d.status === "posted" ? <Button variant="destructive" onClick={() => { setCancelReason(""); setCancelOpen(true); }}><Ban className="h-4 w-4" /> Cancel document</Button> : null}
      </>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant={docKindVariant(d.kind)}>{KIND_LABELS[d.kind] ?? d.kind}</Badge>
        <Badge variant={docStatusVariant(d.status)}>{d.status}</Badge>
        {d.status === "draft" ? <span className="text-xs text-fg-muted">Nothing has moved yet. Post to write the ledger.</span> : null}
        {d.status === "cancelled" ? <span className="text-xs text-fg-muted">Reversed with offsetting ledger entries on {formatDateTime(d.cancelled_at)}.</span> : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardBody>
            <KeyValue items={[
              ...(d.from_section_id ? [{ label: d.kind === "transfer" ? "From" : "Section", value: sectionName(sections.data, d.from_section_id) }] : []),
              ...(d.to_section_id ? [{ label: d.kind === "transfer" ? "To" : "Into", value: sectionName(sections.data, d.to_section_id) }] : []),
              { label: "Business day", value: formatDate(d.business_day) },
              ...(d.invoice_ref ? [{ label: "Invoice", value: d.invoice_ref }] : []),
              ...(d.reason ? [{ label: "Reason", value: d.reason }] : []),
              ...(isReceive ? [{ label: "Total cost", value: formatMoney(d.total_cost_minor) }] : []),
              { label: "Created", value: formatDateTime(d.created_at) },
              ...(d.posted_at ? [{ label: "Posted", value: formatDateTime(d.posted_at) }] : []),
              ...(d.cancelled_at ? [{ label: "Cancelled", value: formatDateTime(d.cancelled_at) }] : []),
            ]} />
            {d.note ? <p className="mt-3 whitespace-pre-wrap border-t pt-3 text-sm text-fg-secondary">{d.note}</p> : null}
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Lines</CardTitle><span className="text-sm text-fg-secondary">{d.line_count} line{d.line_count === 1 ? "" : "s"}</span></CardHeader>
          <Table>
            <THead><tr><TH>Item</TH>{isCount ? <><TH right>Expected</TH><TH right>Counted</TH><TH right>Difference</TH></> : <><TH right>Quantity</TH><TH right>In base unit</TH></>}{isReceive ? <><TH right>Unit cost</TH><TH right>Line total</TH></> : null}<TH>Batch / expiry</TH></tr></THead>
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
                    {isReceive ? <>
                      <TD right className="text-fg-secondary">{l.unit_cost_minor !== null ? `${formatMoney(l.unit_cost_minor)} / ${l.unit_code}` : "-"}</TD>
                      <TD right>{l.unit_cost_minor !== null ? formatMoney(Math.round(l.unit_cost_minor * Number(l.quantity))) : "-"}</TD>
                    </> : null}
                    <TD className="text-fg-secondary">{[l.batch_no, l.expires_on ? `exp ${formatDate(l.expires_on)}` : null].filter(Boolean).join(" · ") || "-"}</TD>
                  </TR>
                );
              }) : <EmptyRow colSpan={isCount ? 5 : isReceive ? 6 : 4}>No lines.</EmptyRow>}
            </TBody>
          </Table>
        </Card>
      </div>
      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title={`Cancel ${d.label}?`} description="Reversing ledger entries are written; the original rows stay. A manager PIN may be asked for." size="sm"
        footer={<><Button variant="secondary" onClick={() => setCancelOpen(false)}>Keep</Button><Button variant="destructive" onClick={cancel} loading={cancelling}>Cancel document</Button></>}>
        <Field label="Reason"><Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Wrong supplier, duplicate…" autoFocus /></Field>
      </Dialog>
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={() => remove.mutate(d.id, { onSuccess: () => router.replace("/admin/inventory/stock-actions") })} title={`Delete draft ${d.label}?`} description="Drafts have not touched stock; deleting is permanent." confirmLabel="Delete" destructive loading={remove.isPending} />
      {pinDialog}
    </>
  );
}
