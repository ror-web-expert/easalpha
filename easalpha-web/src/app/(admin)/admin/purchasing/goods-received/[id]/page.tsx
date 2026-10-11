"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, FileInput, Undo2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { GoodsReceipt } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatBaseQty } from "@/lib/units";
import { PageHeader } from "@/components/admin/page";
import { useApproval } from "@/components/approval";
import { sectionName, useSections } from "@/components/admin/stock";
import { postedStatusVariant } from "@/components/admin/purchasing";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Dialog, EmptyRow, Field, Input, KeyValue, Loading, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { toast } from "@/store/toast";

const KEYS = ["goods_receipts", "goods_receipt", "purchase_orders", "purchase_order", "purchasing_summary", "purchasing_aging", "suppliers", "suppliers_all", "supplier", "supplier_ledger", "stock_levels", "stock_items", "stock_item", "stock_documents", "supplier_prices"];

export default function GoodsReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const receipt = useQuery({ queryKey: ["goods_receipt", id], queryFn: () => api<GoodsReceipt>(`/goods_receipts/${id}`) });
  const sections = useSections();
  const { run, dialog: pinDialog } = useApproval();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const g = receipt.data;
  if (receipt.isLoading || !g) return <Loading />;
  const cancel = async () => {
    setCancelling(true);
    try {
      await run((pin) => api(`/goods_receipts/${g.id}/cancel`, { method: "POST", body: { reason: reason || undefined, approver_pin: pin } }), `Cancel ${g.label}`);
      KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setCancelOpen(false); toast.success(`${g.label} cancelled`);
    } catch (e) { if (errorMessage(e) !== "Approval cancelled") toast.error("Could not cancel", errorMessage(e)); }
    finally { setCancelling(false); }
  };
  const qty = g.lines?.reduce((a, l) => a + Number(l.quantity), 0) ?? 0;
  return (
    <>
      <PageHeader icon={FileInput} title={g.label} description={`${g.supplier_name} · received ${formatDate(g.received_on)}${g.invoice_ref ? ` · invoice ${g.invoice_ref}` : ""}`} actions={<>
        <Link href="/admin/purchasing/goods-received"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /> Receipts</Button></Link>
        {g.status === "posted" ? <Link href={`/admin/purchasing/purchase-returns/new?supplier_id=${g.supplier_id}&goods_receipt_id=${g.id}`}><Button variant="secondary"><Undo2 className="h-4 w-4" /> Return goods</Button></Link> : null}
        {g.status === "posted" ? <Button variant="destructive" onClick={() => setCancelOpen(true)}><Ban className="h-4 w-4" /> Cancel</Button> : null}
      </>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle><Badge variant={postedStatusVariant(g.status)}>{g.status}</Badge></CardHeader>
          <CardBody>
            <KeyValue items={[
              { label: "Supplier", value: <Link href={`/admin/suppliers/${g.supplier_id}`} className="text-primary hover:underline">{g.supplier_name}</Link> },
              { label: "Received on", value: formatDate(g.received_on) },
              { label: "Business day", value: g.business_day ? formatDate(g.business_day) : "-" },
              { label: "Section", value: sectionName(sections.data, g.stock_section_id) },
              { label: "Invoice", value: g.invoice_ref ?? "-" },
              { label: "Purchase order", value: g.purchase_order_id ? <Link href={`/admin/purchasing/purchase-orders/${g.purchase_order_id}`} className="text-primary hover:underline">Open order</Link> : "None (direct)" },
              { label: "Stock document", value: g.stock_document_id ? <Link href={`/admin/inventory/stock-actions/${g.stock_document_id}`} className="text-primary hover:underline">Open document</Link> : "-" },
              { label: "Created", value: formatDateTime(g.created_at) },
              ...(g.cancelled_at ? [{ label: "Cancelled", value: formatDateTime(g.cancelled_at) }] : []),
            ]} />
            {g.note ? <p className="mt-3 border-t pt-3 text-sm text-fg-secondary">{g.note}</p> : null}
            {g.status === "cancelled" ? <p className="mt-3 text-xs text-fg-muted">Stock was reversed and the supplier balance reduced by {formatMoney(g.total_minor)}.</p> : null}
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Lines</CardTitle><span className="text-sm text-fg-secondary">{g.line_count} lines · {qty.toLocaleString("en-US", { maximumFractionDigits: 3 })} units</span></CardHeader>
          <Table>
            <THead><tr><TH>Item</TH><TH right>Quantity</TH><TH right>In base</TH><TH right>Cost</TH><TH right>Line total</TH><TH>Batch / expiry</TH></tr></THead>
            <TBody>
              {g.lines?.length ? g.lines.map((l) => (
                <TR key={l.id}>
                  <TD><Link href={`/admin/inventory/items/${l.stock_item_id}`} className="font-medium text-primary hover:underline">{l.item_name}</Link></TD>
                  <TD right>{Number(l.quantity).toLocaleString("en-US", { maximumFractionDigits: 3 })} {l.unit_code}</TD>
                  <TD right className="text-fg-secondary">{formatBaseQty(l.base_quantity, l.unit_code === "kg" ? "g" : l.unit_code === "l" ? "ml" : l.unit_code)}</TD>
                  <TD right className="text-fg-secondary">{formatMoney(l.unit_cost_minor)} / {l.unit_code}</TD>
                  <TD right className="font-medium">{formatMoney(l.line_total_minor)}</TD>
                  <TD className="text-fg-secondary">{[l.batch_no, l.expires_on ? `exp ${formatDate(l.expires_on)}` : null].filter(Boolean).join(" · ") || "-"}</TD>
                </TR>
              )) : <EmptyRow colSpan={6}>No lines.</EmptyRow>}
              <tr className="border-t bg-muted/60 font-semibold"><td className="h-12 px-3" colSpan={4}>Total</td><td className="px-3 text-right tabular">{formatMoney(g.total_minor)}</td><td /></tr>
            </TBody>
          </Table>
        </Card>
      </div>
      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title={`Cancel ${g.label}?`} description="Stock is reversed, the supplier balance drops and the price history is removed. A manager PIN may be asked for. Returns against this receipt must be cancelled first." size="sm"
        footer={<><Button variant="secondary" onClick={() => setCancelOpen(false)}>Keep</Button><Button variant="destructive" onClick={cancel} loading={cancelling}>Cancel receipt</Button></>}>
        <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Duplicate, wrong supplier…" autoFocus /></Field>
      </Dialog>
      {pinDialog}
    </>
  );
}
