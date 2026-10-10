"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Package, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Category, ModifierGroup, Product, Station, TaxRate } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { useList, useRemove, useSave } from "@/components/admin/crud";
import { Button, Card, CardBody, CardHeader, CardTitle, Checkbox, ConfirmDialog, Field, Input, Loading, MoneyInput, Select, Textarea } from "@/components/ui";
import { titleCase } from "@/lib/utils";

const ORDER_TYPES = ["dine_in", "takeaway", "delivery", "walk_in"];
interface VariantForm { id?: string; name: string; price_minor: number; sku: string }
interface PriceForm { variant_id: string; order_type: string; price_minor: number }
interface Form {
  id?: string; name: string; name_ur: string; description: string; sku: string; category_id: string; base_price_minor: number; tax_rate_id: string; station_id: string;
  is_favourite: boolean; show_online: boolean; active: boolean; sold_by_weight: boolean; weight_unit: string; variants: VariantForm[]; prices: PriceForm[]; modifier_group_ids: string[];
}
const blank: Form = { name: "", name_ur: "", description: "", sku: "", category_id: "", base_price_minor: 0, tax_rate_id: "", station_id: "", is_favourite: false, show_online: true, active: true, sold_by_weight: false, weight_unit: "kg", variants: [], prices: [], modifier_group_ids: [] };

export default function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const router = useRouter();
  const q = useQuery({ queryKey: ["product", id], queryFn: () => api<Product>(`/products/${id}`), enabled: !isNew });
  const cats = useList<Category>("categories", "/categories");
  const taxes = useList<TaxRate>("tax_rates", "/tax_rates");
  const stations = useList<Station>("stations", "/stations");
  const groups = useList<ModifierGroup>("modifier_groups", "/modifier_groups");
  const [form, setForm] = useState<Form>(blank);
  const [del, setDel] = useState(false);
  useEffect(() => {
    const p = q.data;
    if (!p) return;
    setForm({
      id: p.id, name: p.name, name_ur: p.name_ur ?? "", description: p.description ?? "", sku: p.sku ?? "", category_id: p.category_id, base_price_minor: p.base_price_minor,
      tax_rate_id: p.tax_rate_id ?? "", station_id: p.station_id ?? "", is_favourite: p.is_favourite, show_online: p.show_online, active: p.active, sold_by_weight: p.sold_by_weight,
      weight_unit: p.weight_unit ?? "kg", variants: (p.variants ?? []).map((v) => ({ id: v.id, name: v.name, price_minor: v.price_minor, sku: v.sku ?? "" })),
      prices: (p.prices ?? []).map((pr) => ({ variant_id: pr.variant_id ?? "", order_type: pr.order_type, price_minor: pr.price_minor })), modifier_group_ids: p.modifier_group_ids ?? [],
    });
  }, [q.data]);
  useEffect(() => { if (isNew && !form.category_id && cats.data?.[0]) setForm((f) => ({ ...f, category_id: cats.data![0].id })); }, [cats.data, isNew, form.category_id]);
  const save = useSave<Form, Product>(["products", "product"], (f) => (f.id ? `/products/${f.id}` : "/products"), { onSuccess: (p) => { if (isNew) router.replace(`/admin/products/catalog/${p.id}`); } });
  const remove = useRemove(["products"], (pid) => `/products/${pid}`, "Product archived");
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const submit = () => save.mutate({
    ...form, tax_rate_id: form.tax_rate_id || (null as unknown as string), station_id: form.station_id || (null as unknown as string),
    variants: form.variants.map((v) => ({ ...v, sku: v.sku || (null as unknown as string) })),
    prices: form.prices.filter((p) => p.price_minor > 0).map((p) => ({ ...p, variant_id: p.variant_id || (null as unknown as string) })),
  });
  if (!isNew && q.isLoading) return <Loading />;
  return (
    <>
      <PageHeader icon={Package} title={isNew ? "New product" : form.name || "Product"} description="Prices are in rupees; the till picks the order-type price when set." actions={<>
        {!isNew ? <Button variant="destructive" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" /> Archive</Button> : null}
        <Button onClick={submit} loading={save.isPending} disabled={!form.name || !form.category_id}>Save</Button>
      </>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus /></Field>
            <Field label="Name (Urdu)"><Input dir="rtl" value={form.name_ur} onChange={(e) => set("name_ur", e.target.value)} /></Field>
            <Field label="Category"><Select value={form.category_id} onChange={(e) => set("category_id", e.target.value)}><option value="">Choose…</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="SKU"><Input value={form.sku} onChange={(e) => set("sku", e.target.value)} className="font-mono" /></Field>
            <Field label="Base price"><MoneyInput value={form.base_price_minor} onChange={(v) => set("base_price_minor", v)} /></Field>
            <Field label="Tax rate"><Select value={form.tax_rate_id} onChange={(e) => set("tax_rate_id", e.target.value)}><option value="">Default</option>{taxes.data?.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.rate}%{t.inclusive ? " incl." : ""})</option>)}</Select></Field>
            <Field label="Kitchen station"><Select value={form.station_id} onChange={(e) => set("station_id", e.target.value)}><option value="">From category</option>{stations.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Weight unit" hint="Only when sold by weight"><Input value={form.weight_unit} onChange={(e) => set("weight_unit", e.target.value)} disabled={!form.sold_by_weight} /></Field>
            <Field label="Description" className="sm:col-span-2"><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
            <div className="flex flex-wrap gap-4 sm:col-span-2">
              <Checkbox label="Active" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
              <Checkbox label="Show online" checked={form.show_online} onChange={(e) => set("show_online", e.target.checked)} />
              <Checkbox label="Favourite" checked={form.is_favourite} onChange={(e) => set("is_favourite", e.target.checked)} />
              <Checkbox label="Sold by weight" checked={form.sold_by_weight} onChange={(e) => set("sold_by_weight", e.target.checked)} />
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Modifier groups</CardTitle></CardHeader>
          <CardBody className="space-y-2">
            {groups.data?.length ? groups.data.map((g) => (
              <Checkbox key={g.id} label={`${g.name} (${g.modifiers.length})`} checked={form.modifier_group_ids.includes(g.id)} onChange={(e) => set("modifier_group_ids", e.target.checked ? [...form.modifier_group_ids, g.id] : form.modifier_group_ids.filter((x) => x !== g.id))} />
            )) : <p className="text-sm text-fg-muted">No modifier groups yet.</p>}
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Variants</CardTitle><Button size="sm" variant="secondary" onClick={() => set("variants", [...form.variants, { name: "", price_minor: form.base_price_minor, sku: "" }])}><Plus className="h-4 w-4" /> Add variant</Button></CardHeader>
          <CardBody className="space-y-2">
            {form.variants.length ? form.variants.map((v, i) => (
              <div key={i} className="grid grid-cols-[1fr_140px_120px_40px] items-end gap-2">
                <Field label={i === 0 ? "Name" : undefined}><Input value={v.name} placeholder="Small, Large…" onChange={(e) => set("variants", form.variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></Field>
                <Field label={i === 0 ? "Price" : undefined}><MoneyInput value={v.price_minor} onChange={(val) => set("variants", form.variants.map((x, j) => (j === i ? { ...x, price_minor: val } : x)))} /></Field>
                <Field label={i === 0 ? "SKU" : undefined}><Input value={v.sku} onChange={(e) => set("variants", form.variants.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))} /></Field>
                <Button variant="ghost" size="icon" onClick={() => set("variants", form.variants.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-4 w-4 text-danger" /></Button>
              </div>
            )) : <p className="text-sm text-fg-muted">No variants: the base price is used.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Order-type prices</CardTitle><Button size="sm" variant="secondary" onClick={() => set("prices", [...form.prices, { variant_id: "", order_type: "delivery", price_minor: form.base_price_minor }])}><Plus className="h-4 w-4" /> Add</Button></CardHeader>
          <CardBody className="space-y-2">
            {form.prices.length ? form.prices.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_40px] gap-2">
                <Select value={p.order_type} onChange={(e) => set("prices", form.prices.map((x, j) => (j === i ? { ...x, order_type: e.target.value } : x)))}>{ORDER_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select>
                {form.variants.some((v) => v.id) ? <Select value={p.variant_id} onChange={(e) => set("prices", form.prices.map((x, j) => (j === i ? { ...x, variant_id: e.target.value } : x)))}><option value="">All variants</option>{form.variants.filter((v) => v.id).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select> : <span />}
                <Button variant="ghost" size="icon" onClick={() => set("prices", form.prices.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-4 w-4 text-danger" /></Button>
                <div className="col-span-3"><MoneyInput value={p.price_minor} onChange={(val) => set("prices", form.prices.map((x, j) => (j === i ? { ...x, price_minor: val } : x)))} /></div>
              </div>
            )) : <p className="text-sm text-fg-muted">Same price for every order type.</p>}
          </CardBody>
        </Card>
      </div>
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={() => remove.mutate(id, { onSuccess: () => router.replace("/admin/products/catalog") })} title={`Archive ${form.name}?`} description="It leaves the till on the next sync; past orders keep it." confirmLabel="Archive" destructive loading={remove.isPending} />
    </>
  );
}
