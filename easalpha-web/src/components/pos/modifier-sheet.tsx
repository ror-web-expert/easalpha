"use client";
import { useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { Catalog, Deal, Product, Variant } from "@/lib/types";
import { priceFor, productDiscountFields, taxFor, type CartLine, type CartModifier } from "@/lib/pricing";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button, Field, Input, Sheet } from "@/components/ui";

interface Props { product: Product | null; deal: Deal | null; catalog: Catalog; orderType: string; onClose: () => void; onAdd: (line: Omit<CartLine, "key">) => void; editing?: CartLine | null; /** Pre-select this variant (Quick Add items name one). */ initialVariantId?: string | null; /** Start on this quantity (a scanned pack or a scale label's weight). */ initialQuantity?: number | null }

export function ModifierSheet({ product, deal, catalog, orderType, onClose, onAdd, editing, initialVariantId, initialQuantity }: Props) {
  const open = !!product || !!deal;
  const [variant, setVariant] = useState<Variant | null>(null);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [picked, setPicked] = useState<Record<string, number>>({});
  const groups = useMemo(() => (product?.modifier_group_ids ?? []).map((id) => catalog.modifier_groups.find((g) => g.id === id)).filter(Boolean) as Catalog["modifier_groups"], [product, catalog.modifier_groups]);
  useEffect(() => {
    if (!open) return;
    const wanted = editing?.variant_id ?? initialVariantId;
    setVariant((wanted ? product?.variants?.find((v) => v.id === wanted) : null) ?? product?.variants?.[0] ?? null);
    setQty(editing?.quantity ?? initialQuantity ?? 1);
    setNotes(editing?.notes ?? "");
    const p: Record<string, number> = {};
    editing?.modifiers.forEach((m) => { p[m.modifier_id] = m.quantity; });
    setPicked(p);
  }, [open, product, editing, initialVariantId, initialQuantity]);
  const currency = catalog.business.currency;
  const unit = product ? priceFor(product, orderType, variant, catalog.branch?.id) : deal?.price_minor ?? 0;
  const mods: CartModifier[] = groups.flatMap((g) => g.modifiers.filter((m) => m.active && picked[m.id]).map((m) => ({ modifier_id: m.id, name: m.name, price_minor: m.price_minor, quantity: picked[m.id] })));
  const modsTotal = mods.reduce((s, m) => s + m.price_minor * m.quantity, 0);
  const invalid = groups.find((g) => { const n = g.modifiers.filter((m) => picked[m.id]).reduce((s, m) => s + picked[m.id], 0); return (g.required && n < Math.max(1, g.min_select)) || n < g.min_select || (g.max_select && n > g.max_select); });
  const toggle = (gid: string, mid: string) => {
    const g = groups.find((x) => x.id === gid)!;
    const next = { ...picked };
    if (next[mid]) { delete next[mid]; }
    else {
      const n = g.modifiers.filter((m) => next[m.id]).length;
      if (g.max_select === 1) g.modifiers.forEach((m) => delete next[m.id]);
      else if (g.max_select && n >= g.max_select) return;
      next[mid] = 1;
    }
    setPicked(next);
  };
  const add = () => {
    if (product) {
      const tax = taxFor(product, catalog);
      onAdd({ id: editing?.id, product_id: product.id, variant_id: variant?.id ?? null, name: variant ? `${product.name} (${variant.name})` : product.name, unit_price_minor: unit, quantity: qty, notes: notes || null, modifiers: mods, tax_rate: tax.rate, tax_inclusive: tax.inclusive, station_id: product.station_id, price_override_minor: editing?.price_override_minor ?? null, sent: editing?.sent, ...productDiscountFields(product) });
    } else if (deal) {
      const tax = taxFor(null, catalog);
      onAdd({ id: editing?.id, deal_id: deal.id, name: deal.name, unit_price_minor: deal.price_minor, quantity: qty, notes: notes || null, modifiers: [], tax_rate: tax.rate, tax_inclusive: tax.inclusive });
    }
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} side="bottom" title={product?.name ?? deal?.name} description={deal?.description ?? product?.description ?? undefined} className="mx-auto max-w-3xl"
      footer={<div className="flex w-full items-center gap-3">
        <div className="flex items-center gap-1 rounded-md border">
          <button className="grid h-12 w-12 place-items-center" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Less"><Minus className="h-5 w-5" /></button>
          <span className="w-10 text-center text-lg font-semibold tabular">{qty}</span>
          <button className="grid h-12 w-12 place-items-center" onClick={() => setQty((q) => q + 1)} aria-label="More"><Plus className="h-5 w-5" /></button>
        </div>
        <Button size="xl" className="flex-1" onClick={add} disabled={!!invalid}>{editing ? "Update" : "Add"} · {formatMoney((unit + modsTotal) * qty, currency)}</Button>
      </div>}>
      <div className="space-y-5">
        {product?.variants?.length ? (
          <div>
            <div className="mb-2 text-sm font-semibold">Size</div>
            <div className="flex flex-wrap gap-2">{product.variants.map((v) => <Chip key={v.id} active={variant?.id === v.id} onClick={() => setVariant(v)}>{v.name} <span className="text-fg-secondary">{formatMoney(priceFor(product, orderType, v, catalog.branch?.id), currency)}</span></Chip>)}</div>
          </div>
        ) : null}
        {groups.map((g) => (
          <div key={g.id}>
            <div className="mb-2 text-sm font-semibold">{g.name} <span className="font-normal text-fg-muted">{g.required ? "required" : "optional"}{g.max_select ? ` · up to ${g.max_select}` : ""}</span></div>
            <div className="flex flex-wrap gap-2">{g.modifiers.filter((m) => m.active).map((m) => <Chip key={m.id} active={!!picked[m.id]} onClick={() => toggle(g.id, m.id)}>{m.name}{m.price_minor ? <span className="text-fg-secondary"> +{formatMoney(m.price_minor, currency)}</span> : null}</Chip>)}</div>
          </div>
        ))}
        {deal?.items?.length ? <p className="text-sm text-fg-secondary">Includes {deal.items.map((i) => `${i.quantity}× ${catalog.products.find((p) => p.id === i.product_id)?.name ?? "item"}`).join(", ")}</p> : null}
        <Field label="Notes for the kitchen"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="No onions, extra spicy…" className="h-12 text-base" /></Field>
      </div>
    </Sheet>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={cn("min-h-12 rounded-lg border px-4 text-base font-medium", active ? "border-primary bg-primary-soft" : "bg-card hover:bg-muted")}>{children}</button>;
}
