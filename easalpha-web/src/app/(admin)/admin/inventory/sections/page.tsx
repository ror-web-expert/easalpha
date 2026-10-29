"use client";
import { useState } from "react";
import { Warehouse, Plus, Pencil, Archive, Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { StockSection, StockValuationRow } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/admin/page";
import { useRemove, useSave } from "@/components/admin/crud";
import { useSections } from "@/components/admin/stock";
import { Badge, Button, Checkbox, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

interface Form { id?: string; name: string; slug: string; sort_order: number; is_default: boolean; cogs_primary: boolean }
const blank: Form = { name: "", slug: "", sort_order: 0, is_default: false, cogs_primary: false };

/** What the API will store when the slug is left blank: the name, lowercased, with dashes. */
function slugPreview(f: Form): string {
  const s = (f.slug || f.name).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "section";
}

export default function StockSectionsPage() {
  const sections = useSections();
  const valuation = useQuery({ queryKey: ["stock_valuation"], queryFn: () => api<{ data: StockValuationRow[] }>("/stock/valuation"), select: (r) => r.data });
  const [form, setForm] = useState<Form | null>(null);
  const [archiving, setArchiving] = useState<StockSection | null>(null);
  const [primaryTarget, setPrimaryTarget] = useState<StockSection | null>(null);
  const save = useSave<Record<string, unknown>, StockSection>(["stock_sections", "stock_valuation"], (f) => (f.id ? `/stock_sections/${f.id}` : "/stock_sections"), { onSuccess: () => setForm(null) });
  const makePrimary = useSave<{ id: string; cogs_primary: boolean }, StockSection>(["stock_sections", "stock_valuation"], (f) => `/stock_sections/${f.id}`, { success: "COGS Primary section changed", onSuccess: () => setPrimaryTarget(null) });
  const remove = useRemove(["stock_sections", "stock_valuation"], (id) => `/stock_sections/${id}`, "Section removed");
  const val = (id: string) => valuation.data?.find((v) => v.section.id === id);
  const current = sections.data?.find((s) => s.cogs_primary);
  const submit = () => {
    if (!form) return;
    save.mutate({ id: form.id, name: form.name, slug: form.slug.trim() || undefined, sort_order: form.sort_order, is_default: form.is_default, cogs_primary: form.cogs_primary });
  };
  return (
    <>
      <PageHeader icon={Warehouse} title="Sections" description="Kitchen and Warehouse are system sections that cannot be removed; Warehouse is the COGS Primary section by default. Add custom areas such as BBQ, Bar or a station. Each carries a slug; a new section appears in the Inventory sidebar and in the catalog's source picker, and items assigned to it must have their location set to that slug." actions={<Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New section</Button>} />
      {sections.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Name</TH><TH>Slug</TH><TH right>Order</TH><TH right>Items with stock</TH><TH right>Value</TH><TH /></tr></THead>
          <TBody>
            {sections.data?.length ? sections.data.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">
                  {s.name}
                  {s.is_system ? <Badge className="ml-2" variant="outline">System</Badge> : null}
                  {s.cogs_primary ? <Badge className="ml-2" variant="primary">COGS Primary</Badge> : null}
                  {s.is_default ? <Badge className="ml-2" variant="info">Sales deduct here</Badge> : null}
                </TD>
                <TD className="font-mono text-xs text-fg-secondary">{s.slug}</TD>
                <TD right className="text-fg-secondary">{s.sort_order}</TD>
                <TD right>{val(s.id)?.items ?? "-"}</TD>
                <TD right>{formatMoney(val(s.id)?.value_minor)}</TD>
                <TD className="whitespace-nowrap text-right">
                  {!s.cogs_primary ? <Button variant="ghost" size="sm" onClick={() => setPrimaryTarget(s)}><Star className="h-4 w-4" /> Make COGS Primary</Button> : null}
                  <Button variant="ghost" size="icon-sm" onClick={() => setForm({ id: s.id, name: s.name, slug: s.slug, sort_order: s.sort_order, is_default: s.is_default, cogs_primary: s.cogs_primary })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  {!s.is_system ? <Button variant="ghost" size="icon-sm" onClick={() => setArchiving(s)} aria-label="Remove"><Archive className="h-4 w-4 text-danger" /></Button> : null}
                </TD>
              </TR>
            )) : <EmptyRow colSpan={6}>No sections yet.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit section" : "New section"} size="sm" description="A new section shows up in the Inventory sidebar and the catalog's source picker as soon as it is saved."
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name} onClick={submit}>Save</Button></>}>
        {form ? (
          <div className="space-y-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus placeholder="BBQ, Bar, Grill station" /></Field>
            <Field label="Slug" hint={`Lowercase letters, digits and dashes. Items assigned here use it as their location. Will be stored as ${slugPreview(form)}.`}><Input className="font-mono" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder={slugPreview(form)} /></Field>
            <Field label="Sort order"><Input type="number" className="tabular" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })} /></Field>
            <Checkbox label="Default section (sales deduct from here)" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
            <Checkbox label="COGS Primary (only one per branch; the current one is unset)" checked={form.cogs_primary} onChange={(e) => setForm({ ...form, cogs_primary: e.target.checked })} />
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!primaryTarget} onClose={() => setPrimaryTarget(null)} onConfirm={() => primaryTarget && makePrimary.mutate({ id: primaryTarget.id, cogs_primary: true })} title={`Make ${primaryTarget?.name ?? "this section"} the COGS Primary section?`} description={`Only one section per branch carries the flag${current ? `; ${current.name} loses it` : ""}. Cost of goods reports value stock from this section.`} confirmLabel="Make COGS Primary" loading={makePrimary.isPending} />
      <ConfirmDialog open={!!archiving} onClose={() => setArchiving(null)} onConfirm={() => archiving && remove.mutate(archiving.id, { onSuccess: () => setArchiving(null) })} title={`Remove ${archiving?.name ?? "section"}?`} description="Move or count its stock to zero first. System sections (Kitchen, Warehouse) cannot be removed." confirmLabel="Remove" destructive loading={remove.isPending} />
    </>
  );
}
