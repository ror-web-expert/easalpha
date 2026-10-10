"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { OrderTypeConsumable, StockItem, Variant } from "@/lib/types";
import { titleCase, uuid } from "@/lib/utils";
import { unitsOfKind } from "@/lib/units";
import { toast } from "@/store/toast";
import { ItemPicker, useUnits } from "@/components/admin/stock";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Loading, Select, orderTypeVariant } from "@/components/ui";
import { CONSUMABLE_ORDER_TYPES, completeConsumables, consumableToRow, consumablesToInputs, copyAllOrderTypes, copyOrderType, type ConsumableRow } from "@/components/admin/catalog-helpers";

type Row = ConsumableRow & { item?: StockItem | null };
const KEYS = ["consumables", "product"];

const blankRow = (order_type: string): Row => ({ key: uuid(), variant_id: "", order_type, stock_item_id: "", item_name: "", quantity: "1", unit_id: "", unit_code: "", item: null });

/** Loads the saved rows and the stock items behind them so the unit picker knows each item's unit kind. */
async function loadRows(productId: string): Promise<Row[]> {
  const res = await api<{ data: OrderTypeConsumable[] }>(`/products/${productId}/consumables`);
  const ids = Array.from(new Set(res.data.map((c) => c.stock_item_id)));
  const items = await Promise.all(ids.map((id) => api<StockItem>(`/stock_items/${id}`).catch(() => null)));
  const byId = new Map(ids.map((id, i) => [id, items[i]]));
  return res.data.map((c) => ({ ...consumableToRow(c, uuid()), item: byId.get(c.stock_item_id) ?? null }));
}

/** SPEC "Order Inventory" tab: consumables charged by order type (boxes, bags, fuel), per variant, deducted at checkout. */
export function ConsumablesTab({ productId, variants }: { productId: string; variants: Variant[] }) {
  const qc = useQueryClient();
  const units = useUnits();
  const saved = useQuery({ queryKey: ["consumables", productId], queryFn: () => loadRows(productId) });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (saved.data && rows === null) setRows(saved.data); }, [saved.data, rows]);
  const dirty = useMemo(() => rows !== null && JSON.stringify(consumablesToInputs(rows)) !== JSON.stringify(consumablesToInputs(saved.data ?? [])), [rows, saved.data]);
  const setRow = (key: string, patch: Partial<Row>) => setRows((rs) => (rs ?? []).map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const put = async (body: { rows: ReturnType<typeof consumablesToInputs>; copy_all_order_types?: boolean }, label: string, what: string) => {
    setBusy(label);
    try {
      await api(`/products/${productId}/consumables`, { method: "PUT", body });
      KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setRows(null);
      toast.success(what);
    } catch (e) { toast.error("Could not save", errorMessage(e)); }
    finally { setBusy(null); }
  };
  const saveAll = () => rows && put({ rows: consumablesToInputs(rows) }, "save", "Order inventory saved");
  /** SPEC "Copy all order types": the API repeats this card's rows under every order type and replaces everything else. */
  const copyAll = (ot: string) => {
    if (!rows) return;
    const base = completeConsumables(rows.filter((r) => r.order_type === ot));
    if (!base.length) { toast.error("Nothing to copy", `Add at least one complete row under ${titleCase(ot)} first.`); return; }
    setRows(copyAllOrderTypes(rows, ot, CONSUMABLE_ORDER_TYPES, () => uuid()));
    put({ rows: consumablesToInputs(base), copy_all_order_types: true }, `copy-all-${ot}`, `${titleCase(ot)} consumables copied to all order types`);
  };
  const incomplete = rows ? rows.filter((r) => (r.stock_item_id || r.item) && !(Number(r.quantity) > 0 && r.unit_id)).length : 0;

  if (saved.isLoading || rows === null) return <Loading />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-secondary">Supplies deducted once per order line by order type, on top of the recipe. Set rows for all variants or for one variant; a variant with its own rows ignores the shared ones.</p>
        <div className="flex items-center gap-2">
          {incomplete ? <span className="text-xs text-warning">{incomplete} row{incomplete === 1 ? "" : "s"} missing a quantity or unit will not be saved.</span> : null}
          <Button onClick={saveAll} loading={busy === "save"} disabled={!dirty || !!busy}>Save order inventory</Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {CONSUMABLE_ORDER_TYPES.map((ot) => {
          const mine = rows.filter((r) => r.order_type === ot);
          return (
            <Card key={ot}>
              <CardHeader className="flex-wrap">
                <CardTitle className="flex items-center gap-2"><Badge variant={orderTypeVariant(ot)}>{titleCase(ot)}</Badge><span className="text-sm font-normal text-fg-muted">{mine.length} row{mine.length === 1 ? "" : "s"}</span></CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Select className="h-8 w-auto text-xs" value="" aria-label={`Copy ${titleCase(ot)} rows to another order type`} disabled={!mine.length || !!busy} onChange={(e) => { if (e.target.value) setRows(copyOrderType(rows, ot, e.target.value, () => uuid())); }}>
                    <option value="">Copy to…</option>
                    {CONSUMABLE_ORDER_TYPES.filter((t) => t !== ot).map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
                  </Select>
                  <Button size="sm" variant="secondary" onClick={() => copyAll(ot)} loading={busy === `copy-all-${ot}`} disabled={!mine.length || !!busy}><Copy className="h-4 w-4" /> Copy all order types</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRows([...rows, blankRow(ot)])} disabled={!!busy}><Plus className="h-4 w-4" /> Add</Button>
                </div>
              </CardHeader>
              <CardBody className="space-y-2">
                {mine.length ? mine.map((r, idx) => {
                  const kindUnits = unitsOfKind(units.data, r.item?.base_unit.kind);
                  const unitOptions = kindUnits.length ? kindUnits : r.unit_id ? [{ id: r.unit_id, code: r.unit_code }] : [];
                  return (
                    <div key={r.key} className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_80px_90px_36px]">
                      <Field label={idx === 0 ? "Variant" : undefined}>
                        <Select value={r.variant_id} onChange={(e) => setRow(r.key, { variant_id: e.target.value })}>
                          <option value="">All variants</option>
                          {variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </Select>
                      </Field>
                      <Field label={idx === 0 ? "Item" : undefined}>
                        <ItemPicker value={r.item ?? (r.item_name ? ({ name: r.item_name } as StockItem) : null)} onPick={(it) => setRow(r.key, { item: it, stock_item_id: it.id, item_name: it.name, unit_id: it.base_unit.id, unit_code: it.base_unit.code })} />
                      </Field>
                      <Field label={idx === 0 ? "Qty" : undefined}><Input type="number" inputMode="decimal" min={0} step="any" className="tabular" value={r.quantity} onChange={(e) => setRow(r.key, { quantity: e.target.value })} disabled={!r.stock_item_id} /></Field>
                      <Field label={idx === 0 ? "Unit" : undefined}>
                        <Select value={r.unit_id} onChange={(e) => setRow(r.key, { unit_id: e.target.value, unit_code: unitOptions.find((u) => u.id === e.target.value)?.code ?? "" })} disabled={!r.stock_item_id}>
                          {unitOptions.length ? unitOptions.map((u) => <option key={u.id} value={u.id}>{u.code}</option>) : <option value="">-</option>}
                        </Select>
                      </Field>
                      <Button variant="ghost" size="icon-sm" aria-label="Remove row" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}><Trash2 className="h-4 w-4 text-danger" /></Button>
                    </div>
                  );
                }) : <p className="text-sm text-fg-muted">Nothing deducted for {titleCase(ot).toLowerCase()} orders.</p>}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
