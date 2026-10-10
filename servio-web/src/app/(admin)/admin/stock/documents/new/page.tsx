"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileStack, Plus, Trash2, ArrowLeft, AlertTriangle } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { InventorySettings, StockDocument, StockDocumentInput, StockDocumentKind, StockItem } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatBaseQty, fromBase, unitsOfKind } from "@/lib/units";
import { uuid } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page";
import { DOC_KINDS, ItemPicker, useSections, useUnits } from "@/components/admin/stock";
import { Button, Card, CardBody, CardHeader, CardTitle, Field, Input, MoneyInput, Select, Textarea } from "@/components/ui";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";

interface Line { key: string; item: StockItem | null; unit_id: string; quantity: string; unit_cost_minor: number; counted_qty: string }
const newLine = (): Line => ({ key: uuid(), item: null, unit_id: "", quantity: "", unit_cost_minor: 0, counted_qty: "" });

const needsFrom = (k: StockDocumentKind) => ["transfer", "waste", "adjustment", "count", "supplier_return"].includes(k);
const needsTo = (k: StockDocumentKind) => ["receive", "transfer"].includes(k);

export default function NewStockDocumentPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const sections = useSections();
  const units = useUnits();
  const settings = useQuery({ queryKey: ["inventory_settings"], queryFn: () => api<InventorySettings>("/inventory_settings") });
  const [kind, setKind] = useState<StockDocumentKind>("receive");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [clientId] = useState(() => uuid());
  const [busy, setBusy] = useState<"draft" | "post" | null>(null);
  const [openingCount, setOpeningCount] = useState(false);

  const defaultSection = sections.data?.find((s) => s.is_default)?.id ?? sections.data?.[0]?.id ?? "";
  const fromId = from || (needsFrom(kind) ? defaultSection : "");
  const toId = to || (needsTo(kind) && kind !== "transfer" ? defaultSection : "");
  const isCount = kind === "count";
  const isReceive = kind === "receive";
  const countingClosed = isCount && settings.data && !settings.data.counting_open;

  const problems = useMemo(() => {
    const p: string[] = [];
    if (needsFrom(kind) && !fromId) p.push("Choose a source section.");
    if (needsTo(kind) && !toId) p.push("Choose a destination section.");
    if (kind === "transfer" && fromId && toId && fromId === toId) p.push("Transfer needs two different sections.");
    if (kind === "waste" && !reason.trim()) p.push("Waste needs a reason.");
    const filled = lines.filter((l) => l.item);
    if (!filled.length) p.push("Add at least one line.");
    filled.forEach((l) => {
      const q = isCount ? l.counted_qty : l.quantity;
      if (q === "" || !Number.isFinite(Number(q))) p.push(`${l.item!.name}: enter a ${isCount ? "counted" : ""} quantity.`);
      else if (!isCount && kind !== "adjustment" && Number(q) <= 0) p.push(`${l.item!.name}: quantity must be above zero.`);
      else if (isCount && Number(q) < 0) p.push(`${l.item!.name}: counted quantity cannot be negative.`);
    });
    return p;
  }, [kind, fromId, toId, reason, lines, isCount]);

  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickItem = (key: string, item: StockItem) => {
    const preferred = isReceive && item.purchase_unit ? item.purchase_unit.id : item.base_unit.id;
    setLine(key, { item, unit_id: preferred });
  };
  const onHand = (l: Line): string | null => {
    if (!l.item?.levels) return null;
    const sid = isReceive ? toId : fromId;
    const lvl = sid ? l.item.levels.find((x) => x.section_id === sid) : null;
    const qty = lvl ? Number(lvl.quantity) : sid ? 0 : l.item.levels.reduce((a, x) => a + Number(x.quantity), 0);
    return formatBaseQty(qty, l.item.base_unit.code);
  };
  const total = lines.reduce((a, l) => a + (l.item && isReceive ? Math.round(l.unit_cost_minor * (Number(l.quantity) || 0)) : 0), 0);

  const submit = async (post: boolean) => {
    setBusy(post ? "post" : "draft");
    const body: StockDocumentInput = {
      kind, from_section_id: needsFrom(kind) ? fromId : null, to_section_id: needsTo(kind) ? toId : null, reason: reason || null, invoice_ref: isReceive ? invoiceRef || null : null, note: note || null, client_id: clientId, post,
      lines: lines.filter((l) => l.item).map((l) => isCount
        ? { stock_item_id: l.item!.id, unit_id: l.unit_id || undefined, counted_qty: l.counted_qty }
        : { stock_item_id: l.item!.id, unit_id: l.unit_id || undefined, quantity: l.quantity, unit_cost_minor: isReceive && l.unit_cost_minor ? l.unit_cost_minor : undefined }),
    };
    try {
      const doc = await api<StockDocument>("/stock_documents", { method: "POST", body });
      ["stock_documents", "stock_levels", "stock_valuation", "stock_items", "stock_item", "stock_item_ledger", "daily_sheet", "stock_waste"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(post ? `${doc.label} posted` : `${doc.label} saved as draft`);
      router.replace(`/admin/stock/documents/${doc.id}`);
    } catch (e) {
      toast.error(post ? "Could not post" : "Could not save", errorMessage(e));
      setBusy(null);
    }
  };
  const openCounting = async () => {
    setOpeningCount(true);
    try { await api("/inventory_settings/counting", { method: "POST", body: { open: true } }); qc.invalidateQueries({ queryKey: ["inventory_settings"] }); toast.success("Counting is open"); }
    catch (e) { toast.error("Could not open counting", errorMessage(e)); }
    finally { setOpeningCount(false); }
  };
  const kindMeta = DOC_KINDS.find((k) => k.value === kind)!;

  return (
    <>
      <PageHeader icon={FileStack} title="New stock document" description={kindMeta.hint} actions={<Link href="/admin/stock/documents"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /> Documents</Button></Link>} />
      <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {DOC_KINDS.map((k) => (
          <button key={k.value} type="button" onClick={() => { setKind(k.value); setFrom(""); setTo(""); }} className={cn("rounded-lg border bg-card px-3 py-3 text-left text-sm transition-colors hover:border-primary", kind === k.value && "border-primary bg-primary-soft font-medium")}>
            {k.label}
          </button>
        ))}
      </div>
      {countingClosed ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/50 bg-warning-soft px-4 py-3 text-sm">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Counting is closed. Counts can only be posted while counting is open; you can still save a draft.</span>
          <Button size="sm" variant="secondary" onClick={openCounting} loading={openingCount}>Open counting</Button>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            {needsFrom(kind) ? <Field label={kind === "transfer" ? "From section" : "Section"}><Select value={fromId} onChange={(e) => setFrom(e.target.value)}><option value="">Choose…</option>{sections.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field> : null}
            {needsTo(kind) ? <Field label={kind === "transfer" ? "To section" : "Into section"}><Select value={toId} onChange={(e) => setTo(e.target.value)}><option value="">Choose…</option>{sections.data?.filter((s) => kind !== "transfer" || s.id !== fromId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field> : null}
            {isReceive ? <Field label="Invoice / GRN reference"><Input value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} placeholder="INV-123" /></Field> : null}
            <Field label={kind === "waste" ? "Reason (required)" : "Reason"}><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === "waste" ? "Spoiled, burnt, dropped…" : "Optional"} /></Field>
            <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            {isReceive ? <div className="flex items-center justify-between border-t pt-3 text-sm"><span className="text-fg-secondary">Total cost</span><span className="font-semibold tabular">{formatMoney(total)}</span></div> : null}
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Lines</CardTitle><Button size="sm" variant="secondary" onClick={() => setLines((ls) => [...ls, newLine()])}><Plus className="h-4 w-4" /> Add line</Button></CardHeader>
          <CardBody className="space-y-3">
            {lines.map((l, idx) => {
              const kindUnits = unitsOfKind(units.data, l.item?.base_unit.kind);
              const unit = kindUnits.find((u) => u.id === l.unit_id) ?? l.item?.base_unit;
              const hand = onHand(l);
              return (
                <div key={l.key} className="rounded-md border p-3">
                  <div className={cn("grid items-end gap-2", isReceive ? "sm:grid-cols-[1fr_110px_120px_140px_40px]" : "sm:grid-cols-[1fr_110px_120px_40px]")}>
                    <Field label={idx === 0 ? "Item" : undefined}><ItemPicker value={l.item} onPick={(it) => pickItem(l.key, it)} autoFocus={idx === lines.length - 1 && !l.item} /></Field>
                    <Field label={idx === 0 ? "Unit" : undefined}>
                      <Select value={l.unit_id} onChange={(e) => setLine(l.key, { unit_id: e.target.value })} disabled={!l.item}>
                        {l.item ? kindUnits.map((u) => <option key={u.id} value={u.id}>{u.code}</option>) : <option value="">-</option>}
                      </Select>
                    </Field>
                    <Field label={idx === 0 ? (isCount ? "Counted" : "Quantity") : undefined}>
                      <Input type="number" inputMode="decimal" step="any" className="tabular" value={isCount ? l.counted_qty : l.quantity} onChange={(e) => setLine(l.key, isCount ? { counted_qty: e.target.value } : { quantity: e.target.value })} disabled={!l.item} />
                    </Field>
                    {isReceive ? <Field label={idx === 0 ? `Cost per ${unit?.code ?? "unit"}` : undefined}><MoneyInput value={l.unit_cost_minor} onChange={(v) => setLine(l.key, { unit_cost_minor: v })} disabled={!l.item} /></Field> : null}
                    <Button variant="ghost" size="icon" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [newLine()]))} aria-label="Remove line"><Trash2 className="h-4 w-4 text-danger" /></Button>
                  </div>
                  {l.item ? (
                    <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-fg-muted">
                      {hand !== null ? <span>On hand{isReceive ? " there" : ""}: <span className="tabular">{hand}</span>{isCount && unit && l.item.levels ? <span> (expected {fromBase(l.item.levels.filter((x) => !fromId || x.section_id === fromId).reduce((a, x) => a + Number(x.quantity), 0), unit).toLocaleString("en-US", { maximumFractionDigits: 3 })} {unit.code})</span> : null}</span> : null}
                      {isReceive && l.item.avg_cost_minor_per_base && Number(l.item.avg_cost_minor_per_base) > 0 && unit ? <span>Last avg: {formatMoney(Math.round(Number(l.item.avg_cost_minor_per_base) * Number(unit.factor_to_base)))} / {unit.code}</span> : null}
                      {unit && !unit.is_base ? <span>1 {unit.code} = {Number(unit.factor_to_base)} {l.item.base_unit.code}</span> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </CardBody>
        </Card>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <ul className="text-xs text-fg-muted">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => submit(false)} loading={busy === "draft"} disabled={!!busy || (problems.length > 0 && !lines.some((l) => l.item))}>Save draft</Button>
          <Button onClick={() => submit(true)} loading={busy === "post"} disabled={!!busy || problems.length > 0 || !!countingClosed}>Post</Button>
        </div>
      </div>
    </>
  );
}
