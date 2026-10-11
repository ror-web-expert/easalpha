"use client";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileInput } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { GoodsReceipt } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { isoDay } from "@/lib/dates";
import { PageHeader } from "@/components/admin/page";
import { useSections, useUnits } from "@/components/admin/stock";
import { newPurchaseLine, PurchaseLineEditor, purchaseLinesToInput, purchaseLinesTotal, SupplierSelect, type PurchaseLine } from "@/components/admin/purchasing";
import { Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Loading, Select, Textarea } from "@/components/ui";
import { toast } from "@/store/toast";

const KEYS = ["goods_receipts", "goods_receipt", "purchasing_summary", "purchasing_aging", "suppliers", "suppliers_all", "supplier", "supplier_ledger", "stock_levels", "stock_items", "stock_item", "stock_documents", "supplier_prices", "recipes", "food_cost"];

function NewReceipt() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const units = useUnits();
  const sections = useSections();
  const [supplierId, setSupplierId] = useState(params.get("supplier_id") ?? "");
  const [sectionId, setSectionId] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [receivedOn, setReceivedOn] = useState(isoDay());
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<PurchaseLine[]>([newPurchaseLine()]);
  const [busy, setBusy] = useState(false);
  const total = purchaseLinesTotal(lines);
  const problems = useMemo(() => {
    const p: string[] = [];
    if (!supplierId) p.push("Choose a supplier.");
    const filled = lines.filter((l) => l.item);
    if (!filled.length) p.push("Add at least one line.");
    filled.forEach((l) => {
      if (!(Number(l.quantity) > 0)) p.push(`${l.item!.name}: enter a quantity.`);
      if (!(l.unit_cost_minor > 0)) p.push(`${l.item!.name}: enter the cost.`);
    });
    return p;
  }, [supplierId, lines]);
  const submit = async () => {
    setBusy(true);
    try {
      const g = await api<GoodsReceipt>("/goods_receipts", { method: "POST", body: { supplier_id: supplierId, section_id: sectionId || undefined, invoice_ref: invoiceRef || null, received_on: receivedOn || undefined, note: note || null, lines: purchaseLinesToInput(lines, { batch: true }) } });
      KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(`${g.label} posted`, `${formatMoney(g.total_minor)} added to ${g.supplier_name}'s balance`);
      router.replace(`/admin/purchasing/goods-received/${g.id}`);
    } catch (e) { toast.error("Could not post", errorMessage(e)); setBusy(false); }
  };
  return (
    <>
      <PageHeader icon={FileInput} title="New goods receipt" description="A delivery without a purchase order. Posts straight into stock; to receive against an order, open the order and use Receive." actions={<Link href="/admin/purchasing/goods-received"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /> Receipts</Button></Link>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <Field label="Supplier"><SupplierSelect value={supplierId} onChange={(id) => setSupplierId(id)} autoFocus={!supplierId} /></Field>
            <Field label="Into section"><Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}><option value="">Default section</option>{sections.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Invoice reference"><Input value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} placeholder="INV-123" /></Field>
            <Field label="Received on"><Input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} /></Field>
            <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <div className="flex items-center justify-between border-t pt-3 text-sm"><span className="text-fg-secondary">Receipt total</span><span className="font-semibold tabular">{formatMoney(total)}</span></div>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
          <CardBody><PurchaseLineEditor lines={lines} onChange={setLines} units={units.data} showBatch /></CardBody>
        </Card>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <ul className="text-xs text-fg-muted">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        <Button onClick={submit} loading={busy} disabled={busy || problems.length > 0}>Post receipt</Button>
      </div>
    </>
  );
}

export default function NewGoodsReceiptPage() {
  return <Suspense fallback={<Loading />}><NewReceipt /></Suspense>;
}
