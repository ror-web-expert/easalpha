"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Package, Plus, Sparkles, Trash2 } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { Category, DiscountType, ModifierGroup, Product, Station, TaxRate } from "@/lib/types";
import { FORMAT_LABELS, barcodeFormat, looksLikeBadEan } from "@/lib/barcode";
import { loadSymbol, svgDataUrl, symbolSvg } from "@/components/admin/barcode-labels";
import { toast } from "@/store/toast";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/admin/page";
import { useList, useRemove, useSave } from "@/components/admin/crud";
import { ImageUpload } from "@/components/admin/image-upload";
import { ConsumablesTab } from "@/components/admin/catalog-consumables";
import { IngredientsTab } from "@/components/admin/catalog-ingredients";
import { discountLabel, discountPayload, discountProblem, discountedPriceMinor } from "@/components/admin/catalog-helpers";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Checkbox, ConfirmDialog, Field, Input, Loading, MoneyInput, Select, Tabs, Textarea } from "@/components/ui";
import { titleCase, uuid } from "@/lib/utils";

const ORDER_TYPES = ["dine_in", "takeaway", "delivery", "walk_in"];
type Tab = "basic" | "ingredients" | "inventory";
/** cid: a client id (the saved id, or a new one) so a barcode row can point at a size that is not saved yet. */
interface VariantForm { id?: string; cid: string; name: string; price_minor: number; sku: string }
/** size: a variant cid, "" for any size. quantity: pack size as typed. */
interface BarcodeForm { key: string; code: string; size: string; quantity: string }
interface PriceForm { variant_id: string; order_type: string; price_minor: number }
interface Form {
  id?: string; name: string; name_ur: string; description: string; sku: string; image_key: string; category_id: string; base_price_minor: number; tax_rate_id: string; station_id: string;
  discount_value: string; discount_type: DiscountType; pct_code: string;
  is_favourite: boolean; show_online: boolean; active: boolean; sold_by_weight: boolean; weight_unit: string; variants: VariantForm[]; prices: PriceForm[]; modifier_group_ids: string[];
  barcodes: BarcodeForm[];
}
const blank: Form = {
  name: "", name_ur: "", description: "", sku: "", image_key: "", category_id: "", base_price_minor: 0, tax_rate_id: "", station_id: "", discount_value: "", discount_type: "percent", pct_code: "",
  is_favourite: false, show_online: true, active: true, sold_by_weight: false, weight_unit: "kg", variants: [], prices: [], modifier_group_ids: [], barcodes: [],
};

/** Row problems that block saving: a code listed twice, too long, or a pack quantity that is not above 0. Blank rows are dropped on save. */
function barcodeProblems(rows: BarcodeForm[]): Record<string, string> {
  const counts = new Map<string, number>();
  rows.forEach((b) => { const c = b.code.trim(); if (c) counts.set(c, (counts.get(c) ?? 0) + 1); });
  const out: Record<string, string> = {};
  for (const b of rows) {
    const c = b.code.trim();
    if (!c) continue;
    if ((counts.get(c) ?? 0) > 1) out[b.key] = "This code is listed twice.";
    else if (c.length > 128) out[b.key] = "Too long: 128 characters at most.";
    else if (!(Number(b.quantity) > 0)) out[b.key] = "Pack quantity must be more than 0.";
  }
  return out;
}

/** PUT barcodes: saved sizes by id, sizes added in this save by name (the API creates them first). */
function barcodePayload(f: Form) {
  return f.barcodes.filter((b) => b.code.trim()).map((b) => {
    const v = f.variants.find((x) => x.cid === b.size && x.name.trim());
    const size = !v ? {} : v.id ? { variant_id: v.id } : { variant_name: v.name.trim() };
    return { code: b.code.trim(), ...size, quantity: Number(b.quantity) > 0 ? Number(b.quantity) : 1 };
  });
}

/** A small picture of the code as it prints (jsbarcode / qrcode load on first use), with its format. */
function CodePreview({ code }: { code: string }) {
  const c = code.trim();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    setSrc(null);
    if (!c || c.length > 128) return;
    let live = true;
    const t = setTimeout(() => { loadSymbol(c).then((sym) => { if (live) setSrc(svgDataUrl(symbolSvg(sym))); }).catch(() => undefined); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [c]);
  if (!c) return <span className="text-xs text-fg-muted">Type or scan a code</span>;
  return (
    <div className="flex min-w-0 items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt={`Barcode ${c}`} className="h-10 w-auto max-w-32 rounded-sm border" /> : <span className="h-10 w-20 rounded-sm border" aria-hidden />}
      <Badge variant="outline">{FORMAT_LABELS[barcodeFormat(c)]}</Badge>
    </div>
  );
}

export default function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const router = useRouter();
  const q = useQuery({ queryKey: ["product", id], queryFn: () => api<Product>(`/products/${id}`), enabled: !isNew });
  const cats = useList<Category>("categories", "/categories");
  const taxes = useList<TaxRate>("tax_rates", "/tax_rates");
  const stations = useList<Station>("stations", "/stations");
  const groups = useList<ModifierGroup>("modifier_groups", "/modifier_groups");
  const [tab, setTab] = useState<Tab>("basic");
  const [form, setForm] = useState<Form>(blank);
  const [del, setDel] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  useEffect(() => {
    const p = q.data;
    if (!p) return;
    setForm({
      id: p.id, name: p.name, name_ur: p.name_ur ?? "", description: p.description ?? "", sku: p.sku ?? "", image_key: p.image_key ?? "", category_id: p.category_id, base_price_minor: p.base_price_minor,
      tax_rate_id: p.tax_rate_id ?? "", station_id: p.station_id ?? "", discount_value: p.discount_value && Number(p.discount_value) > 0 ? String(Number(p.discount_value)) : "", discount_type: p.discount_type ?? "percent", pct_code: p.pct_code ?? "",
      is_favourite: p.is_favourite, show_online: p.show_online, active: p.active, sold_by_weight: p.sold_by_weight,
      weight_unit: p.weight_unit ?? "kg", variants: (p.variants ?? []).map((v) => ({ id: v.id, cid: v.id, name: v.name, price_minor: v.price_minor, sku: v.sku ?? "" })),
      prices: (p.prices ?? []).map((pr) => ({ variant_id: pr.variant_id ?? "", order_type: pr.order_type, price_minor: pr.price_minor })), modifier_group_ids: p.modifier_group_ids ?? [],
      barcodes: (p.barcodes ?? []).map((b) => ({ key: b.id ?? uuid(), code: b.code, size: b.variant_id && (p.variants ?? []).some((v) => v.id === b.variant_id) ? b.variant_id : "", quantity: String(Number(b.quantity) > 0 ? Number(b.quantity) : 1) })),
    });
  }, [q.data]);
  useEffect(() => { if (isNew && !form.category_id && cats.data?.[0]) setForm((f) => ({ ...f, category_id: cats.data![0].id })); }, [cats.data, isNew, form.category_id]);
  const save = useSave<Record<string, unknown>, Product>(["products", "product"], (f) => (f.id ? `/products/${f.id}` : "/products"), { onSuccess: (p) => { if (isNew) router.replace(`/admin/products/catalog/${p.id}`); } });
  const remove = useRemove(["products"], (pid) => `/products/${pid}`, "Product archived");
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const discountError = discountProblem(form.discount_value, form.discount_type, form.base_price_minor);
  const codeProblems = useMemo(() => barcodeProblems(form.barcodes), [form.barcodes]);
  const canSave = !!form.name && !!form.category_id && form.base_price_minor >= 0 && !discountError && !Object.keys(codeProblems).length;
  const submit = () => {
    setBarcodeError(null);
    save.mutate({
      ...form, image_key: form.image_key || null, sku: form.sku || null, pct_code: form.pct_code.trim() || null, tax_rate_id: form.tax_rate_id || null, station_id: form.station_id || null,
      ...discountPayload(form.discount_value, form.discount_type),
      variants: form.variants.map((v) => ({ id: v.id, name: v.name, price_minor: v.price_minor, sku: v.sku || null })),
      prices: form.prices.filter((p) => p.price_minor > 0).map((p) => ({ ...p, variant_id: p.variant_id || null })),
      barcodes: barcodePayload(form),
    }, { onError: (e) => { if (e instanceof ApiError && e.code.startsWith("barcode.")) setBarcodeError(e.message); } });
  };
  // Barcodes: every change clears the last save error about them.
  const setBarcodes = (fn: (rows: BarcodeForm[]) => BarcodeForm[]) => { setBarcodeError(null); setForm((f) => ({ ...f, barcodes: fn(f.barcodes) })); };
  const editBarcode = (key: string, patch: Partial<BarcodeForm>) => setBarcodes((rows) => rows.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const generateCode = async () => {
    setGenerating(true);
    try {
      const r = await api<{ codes: string[] }>("/products/barcodes/generate", { method: "POST", body: { count: 1 } });
      const code = r.codes[0];
      if (code) setBarcodes((rows) => [...rows, { key: uuid(), code, size: "", quantity: "1" }]);
    } catch (e) { toast.error("Could not generate a code", errorMessage(e)); }
    finally { setGenerating(false); }
  };
  if (!isNew && q.isLoading) return <Loading />;
  const product = q.data;
  const savedVariants = product?.variants ?? [];
  const label = discountLabel(form.discount_value, form.discount_type);
  return (
    <>
      <PageHeader icon={Package} title={isNew ? "New product" : form.name || "Product"} description="Basic Info holds price, discount and variants; Ingredients the recipe per variant; Order Inventory the supplies deducted by order type." actions={<>
        <Link href="/admin/products/catalog"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /> Catalog</Button></Link>
        {!isNew ? <Button variant="destructive" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" /> Archive</Button> : null}
        {tab === "basic" ? <Button onClick={submit} loading={save.isPending} disabled={!canSave}>Save</Button> : null}
      </>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs<Tab> value={tab} onChange={setTab} items={[{ value: "basic", label: "Basic Info" }, { value: "ingredients", label: "Ingredients" }, { value: "inventory", label: "Order Inventory" }]} />
        {isNew && tab !== "basic" ? <span className="text-sm text-fg-muted">Save the product first; recipes and order inventory attach to a saved product.</span> : null}
      </div>

      {tab === "basic" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardBody className="grid gap-3 sm:grid-cols-2">
              <ImageUpload label="Product image" value={form.image_key} onChange={(k) => set("image_key", k ?? "")} className="sm:col-span-2" />
              <Field label="Product name"><Input value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus required /></Field>
              <Field label="Name (Urdu)"><Input dir="rtl" value={form.name_ur} onChange={(e) => set("name_ur", e.target.value)} /></Field>
              <Field label="Description" className="sm:col-span-2"><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
              <Field label="Category"><Select value={form.category_id} onChange={(e) => set("category_id", e.target.value)}><option value="">Choose…</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field label="Base price" hint={label ? `${label} off: sells at ${formatMoney(discountedPriceMinor(form.base_price_minor, form.discount_value, form.discount_type))}` : undefined}><MoneyInput value={form.base_price_minor} onChange={(v) => set("base_price_minor", v)} required /></Field>
              <Field label="Discount" error={discountError ?? undefined} hint={discountError ? undefined : "Blank for none. Switch between a percentage and a rupee amount."}>
                <div className="flex items-center gap-2">
                  <Tabs<DiscountType> value={form.discount_type} onChange={(t) => set("discount_type", t)} items={[{ value: "percent", label: "%" }, { value: "amount", label: "Rs" }]} className="shrink-0" />
                  <Input type="number" inputMode="decimal" min={0} step="any" className="tabular" value={form.discount_value} onChange={(e) => set("discount_value", e.target.value)} placeholder={form.discount_type === "percent" ? "10" : "50"} />
                </div>
              </Field>
              <Field label="PCT code" hint="Pakistan Customs Tariff code for PRA e-IMS tax reporting"><Input value={form.pct_code} onChange={(e) => set("pct_code", e.target.value)} className="font-mono" placeholder="2106.9090" /></Field>
              <Field label="SKU"><Input value={form.sku} onChange={(e) => set("sku", e.target.value)} className="font-mono" /></Field>
              <Field label="Tax rate"><Select value={form.tax_rate_id} onChange={(e) => set("tax_rate_id", e.target.value)}><option value="">Default</option>{taxes.data?.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.rate}%{t.inclusive ? " incl." : ""})</option>)}</Select></Field>
              <Field label="Kitchen station"><Select value={form.station_id} onChange={(e) => set("station_id", e.target.value)}><option value="">From category</option>{stations.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Field label="Weight unit" hint="Only when sold by weight"><Input value={form.weight_unit} onChange={(e) => set("weight_unit", e.target.value)} disabled={!form.sold_by_weight} /></Field>
              <div className="flex flex-wrap gap-4 sm:col-span-2">
                <Checkbox label="Active" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
                <Checkbox label="Favourite" checked={form.is_favourite} onChange={(e) => set("is_favourite", e.target.checked)} />
                <Checkbox label="Show online" checked={form.show_online} onChange={(e) => set("show_online", e.target.checked)} />
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
            <CardHeader><CardTitle>Variants</CardTitle><Button size="sm" variant="secondary" onClick={() => set("variants", [...form.variants, { cid: uuid(), name: "", price_minor: form.base_price_minor, sku: "" }])}><Plus className="h-4 w-4" /> Add variant</Button></CardHeader>
            <CardBody className="space-y-2">
              {form.variants.length ? form.variants.map((v, i) => (
                <div key={v.cid} className="grid grid-cols-[1fr_140px_120px_40px] items-end gap-2">
                  <Field label={i === 0 ? "Variant name" : undefined}><Input value={v.name} placeholder="Small, Medium, Large…" onChange={(e) => set("variants", form.variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></Field>
                  <Field label={i === 0 ? "Price" : undefined}><MoneyInput value={v.price_minor} onChange={(val) => set("variants", form.variants.map((x, j) => (j === i ? { ...x, price_minor: val } : x)))} /></Field>
                  <Field label={i === 0 ? "SKU" : undefined}><Input value={v.sku} className="font-mono" onChange={(e) => set("variants", form.variants.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))} /></Field>
                  {/* A barcode for a removed size falls back to any size. */}
                  <Button variant="ghost" size="icon" onClick={() => setForm((f) => ({ ...f, variants: f.variants.filter((_, j) => j !== i), barcodes: f.barcodes.map((b) => (b.size === v.cid ? { ...b, size: "" } : b)) }))} aria-label="Remove variant"><Trash2 className="h-4 w-4 text-danger" /></Button>
                </div>
              )) : <p className="text-sm text-fg-muted">No variants: the base price is used. Each variant gets its own recipe on the Ingredients tab.</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader><CardTitle>Order-type prices</CardTitle><Button size="sm" variant="secondary" onClick={() => set("prices", [...form.prices, { variant_id: "", order_type: "delivery", price_minor: form.base_price_minor }])}><Plus className="h-4 w-4" /> Add</Button></CardHeader>
            <CardBody className="space-y-2">
              {form.prices.length ? form.prices.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_40px] gap-2">
                  <Select value={p.order_type} onChange={(e) => set("prices", form.prices.map((x, j) => (j === i ? { ...x, order_type: e.target.value } : x)))}>{ORDER_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select>
                  {form.variants.some((v) => v.id) ? <Select value={p.variant_id} onChange={(e) => set("prices", form.prices.map((x, j) => (j === i ? { ...x, variant_id: e.target.value } : x)))}><option value="">All variants</option>{form.variants.filter((v) => v.id).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select> : <span />}
                  <Button variant="ghost" size="icon" onClick={() => set("prices", form.prices.filter((_, j) => j !== i))} aria-label="Remove price"><Trash2 className="h-4 w-4 text-danger" /></Button>
                  <div className="col-span-3"><MoneyInput value={p.price_minor} onChange={(val) => set("prices", form.prices.map((x, j) => (j === i ? { ...x, price_minor: val } : x)))} /></div>
                </div>
              )) : <p className="text-sm text-fg-muted">Same price for every order type.</p>}
            </CardBody>
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader className="flex-wrap">
              <div>
                <CardTitle>Barcodes</CardTitle>
                <p className="mt-0.5 text-xs text-fg-muted">Scanning one of these codes on the POS adds this product. Pack quantity is how many one scan adds (6 for a carton of six).</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={generateCode} loading={generating}><Sparkles className="h-4 w-4" /> Generate in-store code</Button>
                <Button size="sm" variant="secondary" onClick={() => setBarcodes((rows) => [...rows, { key: uuid(), code: "", size: "", quantity: "1" }])}><Plus className="h-4 w-4" /> Add barcode</Button>
              </div>
            </CardHeader>
            <CardBody className="space-y-3">
              {barcodeError ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink" role="alert">{barcodeError}</p> : null}
              {form.barcodes.length ? form.barcodes.map((b, i) => {
                const problem = codeProblems[b.key] ?? (barcodeError && b.code.trim() && barcodeError.startsWith(`${b.code.trim()} `) ? barcodeError : undefined);
                const sizes = form.variants.filter((v) => v.name.trim());
                return (
                  <div key={b.key} className="grid items-start gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_110px_minmax(0,1.2fr)_40px]">
                    <Field label={i === 0 ? "Code" : undefined} error={problem} hint={!problem && looksLikeBadEan(b.code.trim()) ? "The last digit is not a valid check digit; check for a typing mistake." : undefined}>
                      <Input value={b.code} onChange={(e) => editBarcode(b.key, { code: e.target.value })} className="font-mono" placeholder="Scan or type the code" aria-label="Barcode" maxLength={160} />
                    </Field>
                    <Field label={i === 0 ? "Size" : undefined}>
                      <Select value={sizes.some((v) => v.cid === b.size) ? b.size : ""} onChange={(e) => editBarcode(b.key, { size: e.target.value })} disabled={!sizes.length} aria-label="Size">
                        <option value="">Any size</option>
                        {sizes.map((v) => <option key={v.cid} value={v.cid}>{v.name}{v.id ? "" : " (new)"}</option>)}
                      </Select>
                    </Field>
                    <Field label={i === 0 ? "Pack quantity" : undefined}>
                      <Input type="number" inputMode="decimal" min={0} step="any" value={b.quantity} onChange={(e) => editBarcode(b.key, { quantity: e.target.value })} className="tabular" aria-label="Pack quantity" />
                    </Field>
                    <div className={i === 0 ? "sm:pt-5" : undefined}><CodePreview code={b.code} /></div>
                    <Button variant="ghost" size="icon" className={i === 0 ? "sm:mt-5" : undefined} onClick={() => setBarcodes((rows) => rows.filter((x) => x.key !== b.key))} aria-label="Remove barcode"><Trash2 className="h-4 w-4 text-danger" /></Button>
                  </div>
                );
              }) : <p className="text-sm text-fg-muted">No barcodes. Add the code printed on the pack, or generate an in-store code and print labels from Barcode Labels.</p>}
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === "ingredients" ? (
        isNew || !product ? <Card><CardBody className="text-sm text-fg-muted">Save the product on Basic Info first, then come back to set the recipe for each variant.</CardBody></Card>
          : <IngredientsTab product={product} />
      ) : null}

      {tab === "inventory" ? (
        isNew || !product ? <Card><CardBody className="text-sm text-fg-muted">Save the product on Basic Info first, then come back to map the consumables deducted by order type.</CardBody></Card>
          : <ConsumablesTab productId={product.id} variants={savedVariants} />
      ) : null}

      {!isNew && product && tab !== "basic" && form.variants.length !== savedVariants.length ? <p className="mt-3 text-xs text-fg-muted"><Badge variant="warning">Unsaved variants</Badge> Variants added on Basic Info appear here once saved.</p> : null}
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={() => remove.mutate(id, { onSuccess: () => router.replace("/admin/products/catalog") })} title={`Archive ${form.name}?`} description="It leaves the till on the next sync; past orders keep it." confirmLabel="Archive" destructive loading={remove.isPending} />
    </>
  );
}
