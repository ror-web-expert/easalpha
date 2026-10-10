"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileStack, Plus, Trash2, ArrowLeft, AlertTriangle } from "lucide-react";
import { api, errorCode, errorMessage } from "@/lib/api";
import type { InventorySettings, StockDocument, StockDocumentInput, StockDocumentKind, StockItem } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, isoDay } from "@/lib/dates";
import { formatBaseQty, fromBase, unitsOfKind } from "@/lib/units";
import { uuid } from "@/lib/utils";
import { useCan } from "@/store/auth";
import { PageHeader } from "@/components/admin/page";
import { ItemPicker, useSections, useUnits } from "@/components/admin/stock";
import { DOC_KIND_META, docKindMeta, postingDateProblem, sectionsRequiredByKind } from "@/components/admin/inventory-helpers";
import { Button, Card, CardBody, CardHeader, CardTitle, Field, Input, MoneyInput, Select, Textarea } from "@/components/ui";
import { toast } from "@/store/toast";

interface Line { key: string; item: StockItem | null; unit_id: string; quantity: string; unit_cost_minor: number; counted_qty: string }
const newLine = (): Line => ({ key: uuid(), item: null, unit_id: "", quantity: "", unit_cost_minor: 0, counted_qty: "" });
type Mode = "draft" | "submit" | "post";
const INVALIDATE = ["stock_documents", "stock_levels", "stock_valuation", "stock_items", "stock_item", "stock_item_ledger", "daily_sheet", "stock_waste"];

export default function NewStockActionPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const can = useCan();
  const canPost = can("stock.actions");
  const sections = useSections();
  const units = useUnits();
  const settings = useQuery({ queryKey: ["inventory_settings"], queryFn: () => api<InventorySettings>("/inventory_settings") });
  const [kind, setKind] = useState<StockDocumentKind>("receive");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [postingDate, setPostingDate] = useState(isoDay());
  const [reason, setReason] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [clientId] = useState(() => uuid());
  const [busy, setBusy] = useState<Mode | null>(null);
  const [apiError, setApiError] = useState<{ code: string; message: string } | null>(null);
  const [openingCount, setOpeningCount] = useState(false);

  const meta = docKindMeta(kind);
  const req = sectionsRequiredByKind(kind);
  const defaultSection = sections.data?.find((s) => s.is_default)?.id ?? sections.data?.[0]?.id ?? "";
  const fromId = from || (req.from ? defaultSection : "");
  const toId = to || (req.to && kind !== "transfer" ? defaultSection : "");
  const isCount = kind === "count";
  const goodsIn = req.to && !req.from; // receive, po_receipt, opening_balance, production: stock lands in `to`
  const countingClosed = isCount && settings.data && !settings.data.counting_open;
  const dayLock = settings.data?.day_lock_date ?? null;
  const dateProblem = postingDateProblem(postingDate, dayLock, isoDay());

  const problems = useMemo(() => {
    const p: string[] = [];
    if (req.from && !fromId) p.push("Choose a source section.");
    if (req.to && !toId) p.push("Choose a destination section.");
    if (kind === "transfer" && fromId && toId && fromId === toId) p.push("Transfer needs two different sections.");
    if (kind === "waste" && !reason.trim()) p.push("Waste needs a reason.");
    const filled = lines.filter((l) => l.item);
    if (!filled.length) p.push("Add at least one line.");
    filled.forEach((l) => {
      const q = isCount ? l.counted_qty : l.quantity;
      if (q === "" || !Number.isFinite(Number(q))) p.push(`${l.item!.name}: enter a ${isCount ? "counted " : ""}quantity.`);
      else if (!isCount && kind !== "adjustment" && Number(q) <= 0) p.push(`${l.item!.name}: quantity must be above zero.`);
      else if (kind === "adjustment" && Number(q) === 0) p.push(`${l.item!.name}: an adjustment of zero changes nothing.`);
      else if (isCount && Number(q) < 0) p.push(`${l.item!.name}: counted quantity cannot be negative.`);
    });
    return p;
  }, [kind, req.from, req.to, fromId, toId, reason, lines, isCount]);

  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickItem = (key: string, item: StockItem) => {
    const preferred = goodsIn && item.purchase_unit ? item.purchase_unit.id : item.base_unit.id;
    setLine(key, { item, unit_id: preferred });
  };
  const onHand = (l: Line): string | null => {
    if (!l.item?.levels) return null;
    const sid = goodsIn ? toId : fromId;
    const lvl = sid ? l.item.levels.find((x) => x.section_id === sid) : null;
    const qty = lvl ? Number(lvl.quantity) : sid ? 0 : l.item.levels.reduce((a, x) => a + Number(x.quantity), 0);
    return qty < 0 ? `${formatBaseQty(Math.abs(qty), l.item.base_unit.code)} short` : formatBaseQty(qty, l.item.base_unit.code);
  };
  const total = meta.cost ? lines.reduce((a, l) => a + (l.item ? Math.round(l.unit_cost_minor * Math.abs(Number(l.quantity) || 0)) : 0), 0) : 0;

  const submit = async (mode: Mode) => {
    setBusy(mode);
    setApiError(null);
    const body: StockDocumentInput = {
      kind, from_section_id: req.from ? fromId : null, to_section_id: req.to ? toId : null, posting_date: postingDate || null, reason: reason || null,
      invoice_ref: goodsIn ? invoiceRef || null : null, note: note || null, client_id: clientId, post: mode === "post", submit: mode === "submit",
      lines: lines.filter((l) => l.item).map((l) => isCount
        ? { stock_item_id: l.item!.id, unit_id: l.unit_id || undefined, counted_qty: l.counted_qty }
        : { stock_item_id: l.item!.id, unit_id: l.unit_id || undefined, quantity: l.quantity, unit_cost_minor: meta.cost && l.unit_cost_minor ? l.unit_cost_minor : undefined }),
    };
    try {
      const doc = await api<StockDocument>("/stock_documents", { method: "POST", body });
      INVALIDATE.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(mode === "post" ? `${doc.label} posted` : mode === "submit" ? `${doc.label} submitted for approval` : `${doc.label} saved as draft`);
      router.replace(`/admin/inventory/stock-actions/${doc.id}`);
    } catch (e) {
      setApiError({ code: errorCode(e), message: errorMessage(e) });
      toast.error(mode === "post" ? "Could not post" : mode === "submit" ? "Could not submit" : "Could not save", errorMessage(e));
      setBusy(null);
    }
  };
  const openCounting = async () => {
    setOpeningCount(true);
    try { await api("/inventory_settings/counting", { method: "POST", body: { open: true } }); qc.invalidateQueries({ queryKey: ["inventory_settings"] }); toast.success("Counting is open"); }
    catch (e) { toast.error("Could not open counting", errorMessage(e)); }
    finally { setOpeningCount(false); }
  };
  const hasLines = lines.some((l) => l.item);
  const qtyLabel = isCount ? "Counted" : kind === "adjustment" ? "Quantity (+ adds, - removes)" : "Quantity";

  return (
    <>
      <PageHeader icon={FileStack} title="New stock action" description={meta.hint} actions={<Link href="/admin/inventory/stock-actions"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /> Stock Actions</Button></Link>} />
      {countingClosed ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/50 bg-warning-soft px-4 py-3 text-sm">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Counting is closed. Counts can only be posted while counting is open; you can still save a draft or submit it.</span>
          <Button size="sm" variant="secondary" onClick={openCounting} loading={openingCount}>Open counting</Button>
        </div>
      ) : null}
      {apiError ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger/50 bg-danger-soft px-4 py-3 text-sm text-danger-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span><span className="font-medium">{apiError.message}</span> <span className="font-mono text-xs opacity-80">({apiError.code})</span></span>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <Field label="Type">
              <Select value={kind} onChange={(e) => { setKind(e.target.value as StockDocumentKind); setFrom(""); setTo(""); setApiError(null); }}>
                {DOC_KIND_META.map((k) => <option key={k.value} value={k.value}>{k.label} ({k.prefix})</option>)}
              </Select>
            </Field>
            {req.from ? <Field label={kind === "transfer" ? "From section" : "Section"}><Select value={fromId} onChange={(e) => setFrom(e.target.value)}><option value="">Choose…</option>{sections.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field> : null}
            {req.to ? <Field label={kind === "transfer" ? "To section" : "Into section"}><Select value={toId} onChange={(e) => setTo(e.target.value)}><option value="">Choose…</option>{sections.data?.filter((s) => kind !== "transfer" || s.id !== fromId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field> : null}
            <Field label="Posting date" hint={`Never on or before the day lock${dayLock ? ` (locked up to ${formatDate(dayLock)})` : ""}; never after today. Drafts keep the date until they post.`} error={dateProblem && postingDate ? dateProblem : undefined}>
              <Input type="date" value={postingDate} max={isoDay()} min={dayLock ?? undefined} onChange={(e) => setPostingDate(e.target.value)} />
            </Field>
            {goodsIn ? <Field label={kind === "po_receipt" ? "Supplier invoice / PO reference" : "Invoice / reference"}><Input value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} placeholder="INV-123" /></Field> : null}
            <Field label={kind === "waste" ? "Reason (required)" : "Reason"}><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === "waste" ? "Spoiled, burnt, dropped…" : "Optional"} /></Field>
            <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            {meta.cost ? <div className="flex items-center justify-between border-t pt-3 text-sm"><span className="text-fg-secondary">Total value</span><span className="font-semibold tabular">{formatMoney(total)}</span></div> : null}
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
                  <div className={meta.cost ? "grid items-end gap-2 sm:grid-cols-[1fr_110px_120px_140px_40px]" : "grid items-end gap-2 sm:grid-cols-[1fr_110px_120px_40px]"}>
                    <Field label={idx === 0 ? "Item" : undefined}><ItemPicker value={l.item} onPick={(it) => pickItem(l.key, it)} autoFocus={idx === lines.length - 1 && !l.item} /></Field>
                    <Field label={idx === 0 ? "Unit" : undefined} hint={idx === 0 ? "Compatible units only" : undefined}>
                      <Select value={l.unit_id} onChange={(e) => setLine(l.key, { unit_id: e.target.value })} disabled={!l.item}>
                        {l.item ? kindUnits.map((u) => <option key={u.id} value={u.id}>{u.code}</option>) : <option value="">-</option>}
                      </Select>
                    </Field>
                    <Field label={idx === 0 ? qtyLabel : undefined}>
                      <Input type="number" inputMode="decimal" step="any" className="tabular" value={isCount ? l.counted_qty : l.quantity} onChange={(e) => setLine(l.key, isCount ? { counted_qty: e.target.value } : { quantity: e.target.value })} disabled={!l.item} />
                    </Field>
                    {meta.cost ? <Field label={idx === 0 ? `Unit cost per ${unit?.code ?? "unit"}` : undefined}><MoneyInput value={l.unit_cost_minor} onChange={(v) => setLine(l.key, { unit_cost_minor: v })} disabled={!l.item} /></Field> : null}
                    <Button variant="ghost" size="icon" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [newLine()]))} aria-label="Remove line"><Trash2 className="h-4 w-4 text-danger" /></Button>
                  </div>
                  {l.item ? (
                    <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-fg-muted">
                      <span className="font-mono">{l.item.sku}</span>
                      {hand !== null ? <span>On hand{goodsIn ? " there" : ""}: <span className="tabular">{hand}</span>{isCount && unit && l.item.levels ? <span> (expected {fromBase(l.item.levels.filter((x) => !fromId || x.section_id === fromId).reduce((a, x) => a + Number(x.quantity), 0), unit).toLocaleString("en-US", { maximumFractionDigits: 3 })} {unit.code})</span> : null}</span> : null}
                      {meta.cost && l.item.avg_cost_minor_per_base && Number(l.item.avg_cost_minor_per_base) > 0 && unit ? <span>Avg cost: {formatMoney(Math.round(Number(l.item.avg_cost_minor_per_base) * Number(unit.factor_to_base)))} / {unit.code}</span> : null}
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
        <ul className="text-xs text-fg-muted">{problems.map((p) => <li key={p}>{p}</li>)}{!canPost ? <li>You can save drafts and submit for approval; posting needs the Stock Actions permission.</li> : null}</ul>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => submit("draft")} loading={busy === "draft"} disabled={!!busy || !hasLines}>Save draft</Button>
          <Button variant="secondary" onClick={() => submit("submit")} loading={busy === "submit"} disabled={!!busy || problems.length > 0}>Submit for approval</Button>
          {canPost ? <Button onClick={() => submit("post")} loading={busy === "post"} disabled={!!busy || problems.length > 0 || !!dateProblem || !!countingClosed}>Post</Button> : null}
        </div>
      </div>
    </>
  );
}
