"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Percent, Plus, Pencil, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Catalog, Customer, RegularDiscountTier, RegularDiscountTiers } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/admin/page";
import { useAction, useRemove, useSave } from "@/components/admin/crud";
import { CustomerPicker, useCustomersById } from "@/components/admin/customers-picker";
import { discountValueLabel, ORDER_TYPE_OPTIONS, sortTiers, withinDaysLabel } from "@/components/admin/marketing-helpers";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Checkbox, ConfirmDialog, Dialog, EmptyRow, Field, Input, Label, Loading, MoneyInput, Select, Switch, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

// SPEC Regular discounts: recency tiers. If the customer's last order was within N days, take X off. The POS applies
// the best match automatically and the smallest day window wins. Exclusions work per tier, plus a global blocked list.

interface Form { id?: string; name: string; within_days: string; kind: "percent" | "fixed"; value: string; min_order_minor: number; excluded_order_types: string[]; excluded_product_ids: string[]; excluded_category_ids: string[]; active: boolean }
const blank: Form = { name: "", within_days: "7", kind: "percent", value: "10", min_order_minor: 0, excluded_order_types: [], excluded_product_ids: [], excluded_category_ids: [], active: true };
const ENABLED_KEY = "marketing.regular_discounts.enabled";
const BLOCKED_KEY = "marketing.regular_discounts.blocked_customer_ids";

export default function RegularDiscountsPage() {
  const q = useQuery({ queryKey: ["regular_discount_tiers"], queryFn: () => api<RegularDiscountTiers>("/regular_discount_tiers") });
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => api<Catalog>("/catalog") });
  const tiers = useMemo(() => sortTiers(q.data?.data ?? []), [q.data]);
  const blockedIds = q.data?.blocked_customer_ids ?? [];
  const blocked = useCustomersById(blockedIds);
  const [form, setForm] = useState<Form | null>(null);
  const [removing, setRemoving] = useState<RegularDiscountTier | null>(null);
  const [pick, setPick] = useState<Customer | null>(null);
  const [productQ, setProductQ] = useState("");
  const save = useSave<Record<string, unknown>>(["regular_discount_tiers"], (f) => (f.id ? `/regular_discount_tiers/${f.id}` : "/regular_discount_tiers"), { onSuccess: () => setForm(null) });
  const remove = useRemove(["regular_discount_tiers"], (id) => `/regular_discount_tiers/${id}`, "Tier removed");
  const setting = useAction<Record<string, unknown>>(["regular_discount_tiers", "settings"], (values) => api("/settings", { method: "PATCH", body: { values } }), "Saved");
  const setBlocked = (ids: string[]) => setting.mutate({ [BLOCKED_KEY]: ids });
  const edit = (t: RegularDiscountTier) => setForm({ id: t.id, name: t.name, within_days: String(t.within_days), kind: t.kind, value: String(t.value), min_order_minor: t.min_order_minor, excluded_order_types: t.excluded_order_types ?? [], excluded_product_ids: t.excluded_product_ids ?? [], excluded_category_ids: t.excluded_category_ids ?? [], active: t.active });
  const submit = () => form && save.mutate({ id: form.id, name: form.name, within_days: Number(form.within_days), kind: form.kind, value: Number(form.value), min_order_minor: form.min_order_minor, excluded_order_types: form.excluded_order_types, excluded_product_ids: form.excluded_product_ids, excluded_category_ids: form.excluded_category_ids, active: form.active });
  const products = catalog.data?.products ?? [];
  const categories = catalog.data?.categories ?? [];
  const productMatches = productQ.trim() ? products.filter((p) => p.name.toLowerCase().includes(productQ.toLowerCase()) && !form?.excluded_product_ids.includes(p.id)).slice(0, 8) : [];
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const nameOf = (ids: string[], source: { id: string; name: string }[]) => ids.map((id) => source.find((x) => x.id === id)?.name ?? "?");
  if (q.isLoading) return <Loading />;
  return (
    <>
      <PageHeader icon={Percent} title="Regular Discounts" description="Recency tiers: if the customer's last order was within N days, take X off. The till applies the best match on its own." actions={<Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New tier</Button>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div><CardTitle>Tiers</CardTitle><p className="mt-0.5 text-xs text-fg-secondary">Sorted by window. The smallest window wins: a customer who ordered yesterday gets the 1-day reward rather than the 7-day one. Customers who have never ordered get nothing.</p></div>
            <Switch checked={q.data?.enabled === true} onChange={(v) => setting.mutate({ [ENABLED_KEY]: v })} label={q.data?.enabled ? "On" : "Off"} />
          </CardHeader>
          <CardBody className="p-0">
            <Table>
              <THead><tr><TH>Window</TH><TH>Tier</TH><TH right>Discount</TH><TH right>Minimum order</TH><TH>Exclusions</TH><TH>Status</TH><TH right></TH></tr></THead>
              <TBody>
                {tiers.length ? tiers.map((t) => (
                  <TR key={t.id}>
                    <TD className="font-medium">{withinDaysLabel(t.within_days)}</TD>
                    <TD>{t.name}</TD>
                    <TD right className="font-medium">{discountValueLabel(t.kind, t.value)}</TD>
                    <TD right>{t.min_order_minor ? formatMoney(t.min_order_minor) : "-"}</TD>
                    <TD className="text-xs text-fg-secondary">
                      {[t.excluded_order_types.length ? `${t.excluded_order_types.length} order type${t.excluded_order_types.length === 1 ? "" : "s"}` : null, t.excluded_product_ids.length ? `${t.excluded_product_ids.length} product${t.excluded_product_ids.length === 1 ? "" : "s"}` : null, t.excluded_category_ids.length ? `${t.excluded_category_ids.length} categor${t.excluded_category_ids.length === 1 ? "y" : "ies"}` : null].filter(Boolean).join(", ") || "None"}
                    </TD>
                    <TD>{t.active ? <Badge variant="success">active</Badge> : <Badge>inactive</Badge>}</TD>
                    <TD right className="whitespace-nowrap">
                      <Button variant="ghost" size="icon-sm" onClick={() => edit(t)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setRemoving(t)} aria-label="Remove"><Trash2 className="h-4 w-4 text-danger" /></Button>
                    </TD>
                  </TR>
                )) : <EmptyRow colSpan={7}>No tiers yet. Add one, for example 10% within 7 days.</EmptyRow>}
              </TBody>
            </Table>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Blocked customers</CardTitle><p className="mt-0.5 text-xs text-fg-secondary">Never receive a regular discount, whatever tier they qualify for.</p></div></CardHeader>
          <CardBody className="space-y-3">
            <CustomerPicker value={pick} onChange={(c) => { setPick(null); if (c && !blockedIds.includes(c.id)) setBlocked([...blockedIds, c.id]); }} placeholder="Add a customer to block" />
            {blockedIds.length ? (
              <ul className="divide-y rounded-md border text-sm">
                {blockedIds.map((id) => {
                  const c = blocked.data?.find((x) => x.id === id);
                  return (
                    <li key={id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0 truncate">{c ? <>{c.name}{c.khata_no ? <span className="ml-2 font-mono text-xs text-fg-muted">{c.khata_no}</span> : null}</> : <span className="font-mono text-xs text-fg-muted">{blocked.isLoading ? "Loading" : id}</span>}</span>
                      <Button variant="ghost" size="icon-sm" onClick={() => setBlocked(blockedIds.filter((x) => x !== id))} aria-label="Unblock"><X className="h-4 w-4" /></Button>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-sm text-fg-muted">Nobody is blocked.</p>}
          </CardBody>
        </Card>
      </div>
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit tier" : "New tier"} size="lg"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name || !Number(form?.within_days) || !Number(form?.value)} onClick={submit}>Save</Button></>}>
        {form ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Weekly regular" autoFocus /></Field>
            <Field label="Last order within (days)" hint="The window this tier covers"><Input type="number" min={1} className="tabular" value={form.within_days} onChange={(e) => setForm({ ...form, within_days: e.target.value })} /></Field>
            <Field label="Discount">
              <div className="flex gap-2">
                <Select className="w-28" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Form["kind"] })}><option value="percent">Percent</option><option value="fixed">Rs</option></Select>
                <Input type="number" min={0} step="any" className="tabular" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </div>
            </Field>
            <Field label="Minimum order" hint="0 = any order"><MoneyInput value={form.min_order_minor} onChange={(v) => setForm({ ...form, min_order_minor: v })} /></Field>
            <div className="flex items-end"><Checkbox label="Active" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /></div>
            <div className="sm:col-span-2">
              <Label>Excluded order types</Label>
              <div className="flex flex-wrap gap-3">{ORDER_TYPE_OPTIONS.map((o) => <Checkbox key={o.value} label={o.label} checked={form.excluded_order_types.includes(o.value)} onChange={() => setForm({ ...form, excluded_order_types: toggle(form.excluded_order_types, o.value) })} />)}</div>
            </div>
            <div className="sm:col-span-2">
              <Label>Excluded categories</Label>
              {categories.length ? <div className="flex flex-wrap gap-3">{categories.map((c) => <Checkbox key={c.id} label={c.name} checked={form.excluded_category_ids.includes(c.id)} onChange={() => setForm({ ...form, excluded_category_ids: toggle(form.excluded_category_ids, c.id) })} />)}</div> : <p className="text-sm text-fg-muted">{catalog.isLoading ? "Loading catalogue" : "No categories"}</p>}
            </div>
            <div className="sm:col-span-2">
              <Label>Excluded products</Label>
              <div className="relative">
                <Input value={productQ} onChange={(e) => setProductQ(e.target.value)} placeholder="Type a product name to exclude it" />
                {productMatches.length ? (
                  <ul className="absolute left-0 right-0 top-11 z-30 max-h-56 overflow-y-auto rounded-md border bg-high py-1 shadow-[var(--shadow-pop)]">
                    {productMatches.map((p) => <li key={p.id}><button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-fg/8" onClick={() => { setForm({ ...form, excluded_product_ids: [...form.excluded_product_ids, p.id] }); setProductQ(""); }}><span>{p.name}</span><span className="text-xs text-fg-muted">{formatMoney(p.base_price_minor)}</span></button></li>)}
                  </ul>
                ) : null}
              </div>
              {form.excluded_product_ids.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {nameOf(form.excluded_product_ids, products).map((name, i) => (
                    <span key={form.excluded_product_ids[i]} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{name}<button type="button" className="text-fg-muted hover:text-fg" onClick={() => setForm({ ...form, excluded_product_ids: form.excluded_product_ids.filter((x) => x !== form.excluded_product_ids[i]) })} aria-label={`Remove ${name}`}><X className="h-3 w-3" /></button></span>
                  ))}
                </div>
              ) : null}
            </div>
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-fg-secondary sm:col-span-2">Preview: a customer whose last order was within {Number(form.within_days) || 0} day{Number(form.within_days) === 1 ? "" : "s"} gets {discountValueLabel(form.kind, Number(form.value) || 0)} off{form.min_order_minor ? ` on orders of ${formatMoney(form.min_order_minor)} or more` : ""}. Excluded items are left out of the amount the discount is worked on.</p>
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title="Remove this tier?" description={removing ? `${removing.name} (${withinDaysLabel(removing.within_days)}) stops applying at the till. Past orders keep their discount.` : undefined} confirmLabel="Remove" destructive loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id, { onSuccess: () => setRemoving(null) })} />
    </>
  );
}
