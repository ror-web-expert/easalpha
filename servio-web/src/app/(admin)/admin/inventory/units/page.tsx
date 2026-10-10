"use client";
import { useState } from "react";
import { Ruler, Plus, Pencil, Archive } from "lucide-react";
import type { Unit, UnitKind } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { useRemove, useSave } from "@/components/admin/crud";
import { useUnits } from "@/components/admin/stock";
import { Badge, Button, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

interface Form { id?: string; code: string; name: string; kind: UnitKind; factor_to_base: string }
const blank: Form = { code: "", name: "", kind: "count", factor_to_base: "1" };
const BASE: Record<UnitKind, string> = { weight: "g", volume: "ml", count: "pcs" };

export default function UnitsPage() {
  const units = useUnits();
  const [form, setForm] = useState<Form | null>(null);
  const [archiving, setArchiving] = useState<Unit | null>(null);
  const save = useSave<Record<string, unknown>, Unit>(["units"], (f) => (f.id ? `/units/${f.id}` : "/units"), { onSuccess: () => setForm(null) });
  const remove = useRemove(["units"], (id) => `/units/${id}`, "Unit archived");
  const submit = () => { if (!form) return; save.mutate(form.id ? { id: form.id, name: form.name, factor_to_base: form.factor_to_base } : { code: form.code.trim().toLowerCase(), name: form.name, kind: form.kind, factor_to_base: form.factor_to_base }); };
  return (
    <>
      <PageHeader icon={Ruler} title="Units" description="Stock is kept in base units (g, ml, pcs). Add purchase units like box, bag or crate with their factor to the base unit." actions={<Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New unit</Button>} />
      {units.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Code</TH><TH>Name</TH><TH>Kind</TH><TH right>Factor to base</TH><TH /></tr></THead>
          <TBody>
            {units.data?.length ? units.data.map((u) => (
              <TR key={u.id}>
                <TD className="font-mono font-medium">{u.code}{u.is_base ? <Badge className="ml-2" variant="primary">base</Badge> : null}</TD>
                <TD>{u.name}</TD>
                <TD className="capitalize text-fg-secondary">{u.kind}</TD>
                <TD right className="text-fg-secondary">1 {u.code} = {Number(u.factor_to_base).toLocaleString("en-US", { maximumFractionDigits: 4 })} {BASE[u.kind]}</TD>
                <TD className="whitespace-nowrap text-right">
                  <Button variant="ghost" size="icon-sm" onClick={() => setForm({ id: u.id, code: u.code, name: u.name, kind: u.kind, factor_to_base: String(Number(u.factor_to_base)) })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  {!u.is_base ? <Button variant="ghost" size="icon-sm" onClick={() => setArchiving(u)} aria-label="Archive"><Archive className="h-4 w-4 text-danger" /></Button> : null}
                </TD>
              </TR>
            )) : <EmptyRow colSpan={5}>No units.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit unit" : "New unit"} size="sm" description={form?.id ? "Code and kind cannot change once created." : undefined}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name || !form?.code || !(Number(form?.factor_to_base) > 0)} onClick={submit}>Save</Button></>}>
        {form ? (
          <div className="space-y-3">
            <Field label="Code" hint="Short, lowercase: box, bag, crate"><Input className="font-mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!!form.id} autoFocus={!form.id} /></Field>
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus={!!form.id} /></Field>
            <Field label="Kind"><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as UnitKind })} disabled={!!form.id}><option value="weight">Weight (base g)</option><option value="volume">Volume (base ml)</option><option value="count">Count (base pcs)</option></Select></Field>
            <Field label={`Factor to base (${BASE[form.kind]})`} hint={`1 ${form.code || "unit"} = ${form.factor_to_base || "?"} ${BASE[form.kind]}`}><Input type="number" inputMode="decimal" min={0} step="any" className="tabular" value={form.factor_to_base} onChange={(e) => setForm({ ...form, factor_to_base: e.target.value })} /></Field>
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!archiving} onClose={() => setArchiving(null)} onConfirm={() => archiving && remove.mutate(archiving.id, { onSuccess: () => setArchiving(null) })} title={`Archive ${archiving?.code ?? "unit"}?`} description="Refused while any stock item uses it." confirmLabel="Archive" destructive loading={remove.isPending} />
    </>
  );
}
