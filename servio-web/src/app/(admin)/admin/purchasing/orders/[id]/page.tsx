"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, PackageCheck, Send, ShoppingCart } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { GoodsReceipt, PurchaseOrder, PurchaseOrderLine } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime, isoDay } from "@/lib/dates";
import { formatBaseQty, fromBase } from "@/lib/units";
import { titleCase } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page";
import { useSections, useUnits } from "@/components/admin/stock";
import { poStatusVariant, postedStatusVariant } from "@/components/admin/purchasing";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Dialog, EmptyRow, Field, Input, KeyValue, Loading, MoneyInput, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { toast } from "@/store/toast";

const KEYS = ["purchase_orders", "purchase_order", "goods_receipts", "purchasing_summary", "purchasing_aging", "suppliers", "suppliers_all", "supplier", "supplier_ledger", "stock_levels", "stock_items", "stock_item", "stock_documents", "supplier_prices"];
interface ReceiveLine { line: PurchaseOrderLine; include: boolean; quantity: string; unit_cost_minor: number; batch_no: string; expires_on: string }

export default function PurchaseOrderPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const order = useQuery({ queryKey: ["purchase_order", id], queryFn: () => api<PurchaseOrder>(`/purchase_orders/${id}`) });
  const units = useUnits();
  const sections = useSections();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [rx, setRx] = useState<ReceiveLine[]>([]);
  const [rxMeta, setRxMeta] = useState({ invoice_ref: "", received_on: isoDay(), section_id: "", note: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const po = order.data;
  const invalidate = () => KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  useEffect(() => {
    if (!receiveOpen || !po?.lines) return;
    setRx(po.lines.map((l) => {
      const unit = units.data?.find((u) => u.id === l.unit_id);
      const outstanding = unit ? fromBase(Number(l.outstanding_base_qty), unit) : Number(l.outstanding_base_qty);
      return { line: l, include: outstanding > 0, quantity: outstanding > 0 ? String(Number(outstanding.toFixed(3))) : "", unit_cost_minor: l.unit_cost_minor, batch_no: "", expires_on: "" };
    }));
    setRxMeta({ invoice_ref: "", received_on: isoDay(), section_id: "", note: "" });
  }, [receiveOpen, po, units.data]);
  if (order.isLoading || !po) return <Loading />;
  const act = async (what: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(what);
    try { await fn(); invalidate(); toast.success(ok); return true; }
    catch (e) { toast.error("Action failed", errorMessage(e)); return false; }
    finally { setBusy(null); }
  };
  const send = () => act("send", () => api(`/purchase_orders/${po.id}/send`, { method: "POST" }), `${po.label} sent`);
  const cancel = async () => { if (await act("cancel", () => api(`/purchase_orders/${po.id}/cancel`, { method: "POST", body: { reason: cancelReason || undefined } }), `${po.label} cancelled`)) setCancelOpen(false); };
  const receive = async () => {
    const chosen = rx.filter((r) => r.include && Number(r.quantity) > 0);
    const ok = await act("receive", async () => {
      const res = await api<{ receipt: GoodsReceipt; purchase_order: PurchaseOrder }>(`/purchase_orders/${po.id}/receive`, { method: "POST", body: {
        invoice_ref: rxMeta.invoice_ref || undefined, received_on: rxMeta.received_on || undefined, section_id: rxMeta.section_id || undefined, note: rxMeta.note || undefined,
        lines: chosen.map((r) => ({ purchase_order_line_id: r.line.id, quantity: r.quantity, unit_cost_minor: r.unit_cost_minor, batch_no: r.batch_no || null, expires_on: r.expires_on || null })),
      } });
      return res;
    }, "Goods received");
    if (ok) setReceiveOpen(false);
  };
  const canReceive = po.status === "sent" || po.status === "partial" || po.status === "draft";
  const rxTotal = rx.filter((r) => r.include).reduce((a, r) => a + Math.round(r.unit_cost_minor * (Number(r.quantity) || 0)), 0);
  return (
    <>
      <PageHeader icon={ShoppingCart} title={po.label} description={`${po.supplier_name} · created ${formatDateTime(po.created_at)}`} actions={<>
        <Link href="/admin/purchasing/orders"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /> Orders</Button></Link>
        {po.status === "draft" ? <Button variant="secondary" onClick={send} loading={busy === "send"} disabled={!po.lines?.length}><Send className="h-4 w-4" /> Send</Button> : null}
        {po.status === "draft" || po.status === "sent" ? <Button variant="destructive" onClick={() => setCancelOpen(true)}><Ban className="h-4 w-4" /> Cancel</Button> : null}
        {canReceive ? <Button onClick={() => setReceiveOpen(true)}><PackageCheck className="h-4 w-4" /> Receive</Button> : null}
      </>} />
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle><Badge variant={poStatusVariant(po.status)}>{titleCase(po.status)}</Badge></CardHeader>
          <CardBody>
            <KeyValue items={[
              { label: "Supplier", value: <Link href={`/admin/purchasing/suppliers/${po.supplier_id}`} className="text-primary hover:underline">{po.supplier_name}</Link> },
              { label: "Expected", value: po.expected_on ? formatDate(po.expected_on) : "-" },
              { label: "Total", value: formatMoney(po.total_minor) },
              { label: "Lines", value: po.line_count },
              ...(po.sent_at ? [{ label: "Sent", value: formatDateTime(po.sent_at) }] : []),
              ...(po.received_at ? [{ label: "Fully received", value: formatDateTime(po.received_at) }] : []),
              ...(po.cancelled_at ? [{ label: "Cancelled", value: formatDateTime(po.cancelled_at) }] : []),
            ]} />
            {po.note ? <p className="mt-3 border-t pt-3 text-sm text-fg-secondary">{po.note}</p> : null}
            {po.status === "partial" ? <p className="mt-3 text-xs text-fg-muted">Partly received. A partial order cannot be cancelled; receive the rest when it arrives.</p> : null}
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
          <Table>
            <THead><tr><TH>Item</TH><TH right>Ordered</TH><TH right>Cost</TH><TH right>Line total</TH><TH right>Received</TH><TH right>Outstanding</TH></tr></THead>
            <TBody>
              {po.lines?.length ? po.lines.map((l) => {
                const outstanding = Number(l.outstanding_base_qty);
                return (
                  <TR key={l.id}>
                    <TD><Link href={`/admin/stock/items/${l.stock_item_id}`} className="font-medium text-primary hover:underline">{l.item_name}</Link></TD>
                    <TD right>{Number(l.quantity).toLocaleString("en-US", { maximumFractionDigits: 3 })} {l.unit_code}</TD>
                    <TD right className="text-fg-secondary">{formatMoney(l.unit_cost_minor)} / {l.unit_code}</TD>
                    <TD right>{formatMoney(l.line_total_minor)}</TD>
                    <TD right className={Number(l.received_base_qty) > 0 ? "text-success" : "text-fg-muted"}>{formatBaseQty(l.received_base_qty, l.base_unit_code)}</TD>
                    <TD right className={outstanding > 0 && po.status !== "cancelled" ? "font-medium text-warning" : "text-fg-muted"}>{formatBaseQty(l.outstanding_base_qty, l.base_unit_code)}</TD>
                  </TR>
                );
              }) : <EmptyRow colSpan={6}>No lines.</EmptyRow>}
            </TBody>
          </Table>
        </Card>
      </div>
      <h2 className="mb-3 text-base font-semibold">Goods received against this order</h2>
      <Table>
        <THead><tr><TH>Receipt</TH><TH>Status</TH><TH>Received</TH><TH>Invoice</TH><TH right>Lines</TH><TH right>Total</TH></tr></THead>
        <TBody>
          {po.receipts?.length ? po.receipts.map((g) => (
            <TR key={g.id}><TD><Link href={`/admin/purchasing/receipts/${g.id}`} className="font-mono font-medium text-primary hover:underline">{g.label}</Link></TD><TD><Badge variant={postedStatusVariant(g.status)}>{g.status}</Badge></TD><TD className="text-fg-secondary">{formatDate(g.received_on)}</TD><TD className="text-fg-secondary">{g.invoice_ref ?? "-"}</TD><TD right>{g.line_count}</TD><TD right>{formatMoney(g.total_minor)}</TD></TR>
          )) : <EmptyRow colSpan={6}>Nothing received yet.</EmptyRow>}
        </TBody>
      </Table>
      <Dialog open={receiveOpen} onClose={() => setReceiveOpen(false)} title={`Receive ${po.label}`} description="Quantities default to what is still outstanding; change them for a partial delivery. Costs default to the order." size="xl"
        footer={<><span className="mr-auto self-center text-sm text-fg-secondary">Receipt total <span className="font-semibold text-fg tabular">{formatMoney(rxTotal)}</span></span><Button variant="secondary" onClick={() => setReceiveOpen(false)}>Cancel</Button><Button onClick={receive} loading={busy === "receive"} disabled={!rx.some((r) => r.include && Number(r.quantity) > 0)}>Post receipt</Button></>}>
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <Field label="Invoice / GRN reference"><Input value={rxMeta.invoice_ref} onChange={(e) => setRxMeta({ ...rxMeta, invoice_ref: e.target.value })} placeholder="INV-123" autoFocus /></Field>
          <Field label="Received on"><Input type="date" value={rxMeta.received_on} onChange={(e) => setRxMeta({ ...rxMeta, received_on: e.target.value })} /></Field>
          <Field label="Into section"><Select value={rxMeta.section_id} onChange={(e) => setRxMeta({ ...rxMeta, section_id: e.target.value })}><option value="">Default section</option>{sections.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        </div>
        <Table>
          <THead><tr><TH></TH><TH>Item</TH><TH right>Outstanding</TH><TH right>Receive</TH><TH right>Cost per unit</TH><TH>Batch</TH><TH>Expires</TH></tr></THead>
          <TBody>
            {rx.map((r, i) => (
              <TR key={r.line.id} className={!r.include ? "opacity-50" : ""}>
                <TD><input type="checkbox" className="h-4 w-4" checked={r.include} onChange={(e) => setRx((ls) => ls.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} aria-label="Include" /></TD>
                <TD className="font-medium">{r.line.item_name}</TD>
                <TD right className="text-fg-secondary">{formatBaseQty(r.line.outstanding_base_qty, r.line.base_unit_code)}</TD>
                <TD right><div className="flex items-center justify-end gap-1"><Input type="number" inputMode="decimal" min={0} step="any" className="w-24 tabular" value={r.quantity} disabled={!r.include} onChange={(e) => setRx((ls) => ls.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} /><span className="text-xs text-fg-muted">{r.line.unit_code}</span></div></TD>
                <TD right><MoneyInput className="w-28" value={r.unit_cost_minor} disabled={!r.include} onChange={(v) => setRx((ls) => ls.map((x, j) => (j === i ? { ...x, unit_cost_minor: v } : x)))} /></TD>
                <TD><Input className="w-28" value={r.batch_no} disabled={!r.include} onChange={(e) => setRx((ls) => ls.map((x, j) => (j === i ? { ...x, batch_no: e.target.value } : x)))} /></TD>
                <TD><Input type="date" className="w-36" value={r.expires_on} disabled={!r.include} onChange={(e) => setRx((ls) => ls.map((x, j) => (j === i ? { ...x, expires_on: e.target.value } : x)))} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Dialog>
      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title={`Cancel ${po.label}?`} description="Nothing was received, so stock is not affected. Tell the supplier." size="sm"
        footer={<><Button variant="secondary" onClick={() => setCancelOpen(false)}>Keep</Button><Button variant="destructive" onClick={cancel} loading={busy === "cancel"}>Cancel order</Button></>}>
        <Field label="Reason"><Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Supplier out of stock, ordered twice…" autoFocus /></Field>
      </Dialog>
    </>
  );
}
