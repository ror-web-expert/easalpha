"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Page, PurchaseOrder, SupplierPrice, Unit } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/admin/page";
import { useUnits } from "@/components/admin/stock";
import { newPurchaseLine, PurchaseLineEditor, purchaseLinesToInput, purchaseLinesTotal, SupplierSelect, useAllSuppliers, type PurchaseLine } from "@/components/admin/purchasing";
import { Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Loading, Textarea } from "@/components/ui";
import { toast } from "@/store/toast";

const PO_KEYS = ["purchase_orders", "purchase_order", "purchasing_summary", "supplier_insights"];

/** Last price this supplier charged for the item, shown under a line; the API uses the same price when the cost is left blank. */
function LastPrice({ supplierId, itemId, unit, onUse }: { supplierId: string; itemId: string; unit: Unit | undefined; onUse: (minor: number) => void }) {
  const q = useQuery({ queryKey: ["supplier_prices", { supplierId, itemId }], queryFn: () => api<Page<SupplierPrice>>("/purchasing/prices", { query: { supplier_id: supplierId, stock_item_id: itemId, limit: 1 } }), enabled: !!supplierId && !!itemId, select: (r) => r.data[0] ?? null });
  if (!supplierId) return <span>Choose a supplier to see their last price.</span>;
  if (q.isLoading) return null;
  if (!q.data) return <span>No price history with this supplier; blank cost stays 0.</span>;
  const p = q.data;
  const inUnit = unit ? Math.round(Number(p.base_unit_cost_minor) * Number(unit.factor_to_base)) : p.unit_cost_minor;
  return <span>Last paid {formatMoney(inUnit)} / {unit?.code ?? p.unit_code} on {formatDate(p.observed_on)} <button type="button" className="text-primary hover:underline" onClick={() => onUse(inUnit)}>Use</button></span>;
}

function NewOrder() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const units = useUnits();
  const suppliers = useAllSuppliers();
  const [supplierId, setSupplierId] = useState(params.get("supplier_id") ?? "");
  const [expectedOn, setExpectedOn] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<PurchaseLine[]>([newPurchaseLine()]);
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  useEffect(() => { const sid = params.get("supplier_id"); if (sid) setSupplierId(sid); }, [params]);
  const supplier = suppliers.data?.find((s) => s.id === supplierId);
  const total = purchaseLinesTotal(lines);
  const problems = useMemo(() => {
    const p: string[] = [];
    if (!supplierId) p.push("Choose a supplier.");
    const filled = lines.filter((l) => l.item);
    if (!filled.length) p.push("Add at least one line.");
    filled.forEach((l) => { if (!(Number(l.quantity) > 0)) p.push(`${l.item!.name}: enter a quantity.`); });
    return p;
  }, [supplierId, lines]);
  const submit = async (send: boolean) => {
    setBusy(send ? "send" : "draft");
    try {
      const po = await api<PurchaseOrder>("/purchase_orders", { method: "POST", body: { supplier_id: supplierId, expected_on: expectedOn || null, note: note || null, lines: purchaseLinesToInput(lines), send } });
      PO_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(send ? `${po.label} sent` : `${po.label} saved as draft`);
      router.replace(`/admin/purchasing/orders/${po.id}`);
    } catch (e) { toast.error(send ? "Could not send" : "Could not save", errorMessage(e)); setBusy(null); }
  };
  return (
    <>
      <PageHeader icon={ShoppingCart} title="New purchase order" description="Leave a cost blank to use the supplier's last price for that item." actions={<Link href="/admin/purchasing/orders"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /> Orders</Button></Link>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <Field label="Supplier" hint={supplier?.balance_minor ? `Current balance ${formatMoney(supplier.balance_minor)}` : undefined}><SupplierSelect value={supplierId} onChange={(id) => setSupplierId(id)} autoFocus={!supplierId} /></Field>
            <Field label="Expected delivery"><Input type="date" value={expectedOn} onChange={(e) => setExpectedOn(e.target.value)} /></Field>
            <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Delivery instructions, PO terms…" /></Field>
            <div className="flex items-center justify-between border-t pt-3 text-sm"><span className="text-fg-secondary">Order total</span><span className="font-semibold tabular">{formatMoney(total)}</span></div>
            {lines.some((l) => l.item && !l.cost_touched && !l.unit_cost_minor) ? <p className="text-xs text-fg-muted">Blank costs are filled from price history when saved; the total updates then.</p> : null}
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
          <CardBody>
            <PurchaseLineEditor lines={lines} onChange={setLines} units={units.data} onPickItem={(l) => ({ unit_cost_minor: l.cost_touched ? l.unit_cost_minor : 0 })}
              costHint={(l, unit) => (l.item ? <LastPrice supplierId={supplierId} itemId={l.item.id} unit={unit} onUse={(minor) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, unit_cost_minor: minor, cost_touched: true } : x)))} /> : null)} />
          </CardBody>
        </Card>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <ul className="text-xs text-fg-muted">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => submit(false)} loading={busy === "draft"} disabled={!!busy || problems.length > 0}>Save draft</Button>
          <Button onClick={() => submit(true)} loading={busy === "send"} disabled={!!busy || problems.length > 0}>Send to supplier</Button>
        </div>
      </div>
    </>
  );
}

export default function NewPurchaseOrderPage() {
  return <Suspense fallback={<Loading />}><NewOrder /></Suspense>;
}
