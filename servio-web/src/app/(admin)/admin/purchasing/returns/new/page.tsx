"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Undo2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { GoodsReceipt, Page, PurchaseReturn, ReturnSettlement, StockItem } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/admin/page";
import { useSections, useUnits } from "@/components/admin/stock";
import { newPurchaseLine, PurchaseLineEditor, purchaseLinesToInput, purchaseLinesTotal, SupplierSelect, usePaymentMethods, type PurchaseLine } from "@/components/admin/purchasing";
import { Button, Card, CardBody, CardHeader, CardTitle, Field, Loading, Select, Textarea } from "@/components/ui";
import { toast } from "@/store/toast";

const KEYS = ["purchase_returns", "goods_receipts", "goods_receipt", "purchasing_summary", "purchasing_aging", "suppliers", "suppliers_all", "supplier", "supplier_ledger", "stock_levels", "stock_items", "stock_item", "stock_documents"];

function NewReturn() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const units = useUnits();
  const sections = useSections();
  const methods = usePaymentMethods();
  const [supplierId, setSupplierId] = useState(params.get("supplier_id") ?? "");
  const [receiptId, setReceiptId] = useState(params.get("goods_receipt_id") ?? "");
  const [sectionId, setSectionId] = useState("");
  const [reason, setReason] = useState("");
  const [settlement, setSettlement] = useState<ReturnSettlement>("credit_note");
  const [methodCode, setMethodCode] = useState("cash");
  const [lines, setLines] = useState<PurchaseLine[]>([newPurchaseLine()]);
  const [busy, setBusy] = useState(false);
  const receipts = useQuery({ queryKey: ["goods_receipts", { supplier_id: supplierId, status: "posted", pick: true }], queryFn: () => api<Page<GoodsReceipt>>("/goods_receipts", { query: { supplier_id: supplierId, status: "posted", limit: 50 } }), enabled: !!supplierId, select: (r) => r.data });
  const receipt = useQuery({ queryKey: ["goods_receipt", receiptId], queryFn: () => api<GoodsReceipt>(`/goods_receipts/${receiptId}`), enabled: !!receiptId });
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  // Prefill lines from the receipt once: its items, units and unit costs, with quantity left for the user.
  useEffect(() => {
    const g = receipt.data;
    if (!g?.lines || prefilledFor === g.id) return;
    if (!supplierId) setSupplierId(g.supplier_id);
    Promise.all(g.lines.map((l) => api<StockItem>(`/stock_items/${l.stock_item_id}`).catch(() => null))).then((items) => {
      const prefilled = g.lines!.map((l, i) => newPurchaseLine({ item: items[i], unit_id: l.unit_id, quantity: "", unit_cost_minor: l.unit_cost_minor, cost_touched: true })).filter((l) => l.item);
      setLines(prefilled.length ? prefilled : [newPurchaseLine()]);
      setPrefilledFor(g.id);
    });
  }, [receipt.data, prefilledFor, supplierId]);
  const total = purchaseLinesTotal(lines);
  const usableMethods = methods.data?.filter((m) => m.active && m.kind !== "khata") ?? [];
  const problems = useMemo(() => {
    const p: string[] = [];
    if (!supplierId) p.push("Choose a supplier.");
    if (!reason.trim()) p.push("Give a reason.");
    const filled = lines.filter((l) => l.item && Number(l.quantity) > 0);
    if (!filled.length) p.push("Enter a quantity on at least one line.");
    if (settlement === "cash_refund" && !methodCode) p.push("Choose how the refund was received.");
    return p;
  }, [supplierId, reason, lines, settlement, methodCode]);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api<PurchaseReturn>("/purchase_returns", { method: "POST", body: {
        supplier_id: supplierId, goods_receipt_id: receiptId || null, section_id: sectionId || undefined, reason: reason.trim(), settlement, method_code: settlement === "cash_refund" ? methodCode : undefined,
        lines: purchaseLinesToInput(lines.filter((l) => Number(l.quantity) > 0)),
      } });
      KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(`${r.label} posted`, `${formatMoney(r.amount_minor)} ${r.settlement === "cash_refund" ? "refunded" : "credited"} by ${r.supplier_name}`);
      router.replace("/admin/purchasing/returns");
    } catch (e) { toast.error("Could not post", errorMessage(e)); setBusy(false); }
  };
  return (
    <>
      <PageHeader icon={Undo2} title="Return goods to a supplier" description="Pick the receipt the goods came on to prefill items and costs, or add lines by hand." actions={<Link href="/admin/purchasing/returns"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /> Returns</Button></Link>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <Field label="Supplier"><SupplierSelect value={supplierId} onChange={(id) => { setSupplierId(id); setReceiptId(""); setPrefilledFor(null); }} autoFocus={!supplierId} /></Field>
            <Field label="Goods receipt" hint="Optional; prefills the lines with that receipt's costs">
              <Select value={receiptId} onChange={(e) => { setReceiptId(e.target.value); setPrefilledFor(null); if (!e.target.value) setLines([newPurchaseLine()]); }} disabled={!supplierId}>
                <option value="">None</option>
                {receipts.data?.map((g) => <option key={g.id} value={g.id}>{g.label} · {formatDate(g.received_on)} · {formatMoney(g.total_minor)}{g.invoice_ref ? ` · ${g.invoice_ref}` : ""}</option>)}
                {receiptId && receipt.data && !receipts.data?.some((g) => g.id === receiptId) ? <option value={receiptId}>{receipt.data.label}</option> : null}
              </Select>
            </Field>
            <Field label="From section"><Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}><option value="">Default section</option>{sections.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Reason (required)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Stale, damaged, wrong item…" /></Field>
            <Field label="Settlement">
              <Select value={settlement} onChange={(e) => setSettlement(e.target.value as ReturnSettlement)}><option value="credit_note">Credit note (reduces what you owe)</option><option value="cash_refund">Cash refund (money received now)</option></Select>
            </Field>
            {settlement === "cash_refund" ? <Field label="Refund received by"><Select value={methodCode} onChange={(e) => setMethodCode(e.target.value)}>{usableMethods.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</Select></Field> : null}
            <div className="flex items-center justify-between border-t pt-3 text-sm"><span className="text-fg-secondary">Return value</span><span className="font-semibold tabular">{formatMoney(total)}</span></div>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Lines</CardTitle>{receipt.data ? <span className="text-xs text-fg-muted">Lines with no quantity are left out</span> : null}</CardHeader>
          <CardBody>
            {receiptId && receipt.isLoading ? <Loading label="Loading receipt" /> : <PurchaseLineEditor lines={lines} onChange={setLines} units={units.data} />}
          </CardBody>
        </Card>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <ul className="text-xs text-fg-muted">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        <Button onClick={submit} loading={busy} disabled={busy || problems.length > 0}>Post return</Button>
      </div>
    </>
  );
}

export default function NewPurchaseReturnPage() {
  return <Suspense fallback={<Loading />}><NewReturn /></Suspense>;
}
