"use client";
import { useState } from "react";
import { Ruler, Plus, Pencil, Archive, ArrowLeftRight } from "lucide-react";
import { api } from "@/lib/api";
import type { Unit, UnitConversion, UnitKind } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { useAction, useList, useRemove, useSave } from "@/components/admin/crud";
import { useUnits } from "@/components/admin/stock";
import { conversionPair, conversionProblem, conversionSentence, formatFactor } from "@/components/admin/inventory-helpers";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

interface Form { id?: string; code: string; name: string; kind: UnitKind; factor_to_base: string }
const blank: Form = { code: "", name: "", kind: "count", factor_to_base: "1" };
const BASE: Record<UnitKind, string> = { weight: "g", volume: "ml", count: "pcs" };

export default function UnitsPage() {
  const units = useUnits();
  const conversions = useList<UnitConversion>("unit_conversions", "/unit_conversions");
  const [form, setForm] = useState<Form | null>(null);
  const [archiving, setArchiving] = useState<Unit | null>(null);
  const [conv, setConv] = useState({ from: "", to: "", factor: "" });
  const save = useSave<Record<string, unknown>, Unit>(["units", "unit_conversions"], (f) => (f.id ? `/units/${f.id}` : "/units"), { onSuccess: () => setForm(null) });
  const remove = useRemove(["units", "unit_conversions"], (id) => `/units/${id}`, "Unit archived");
  const saveConversion = useAction<{ from_unit_id: string; to_unit_id: string; factor: string }, { data: UnitConversion[] }>(["unit_conversions", "units"], (body) => api("/unit_conversions", { method: "POST", body }), "Conversion saved in both directions");
  const submit = () => { if (!form) return; save.mutate(form.id ? { id: form.id, name: form.name, factor_to_base: form.factor_to_base } : { code: form.code.trim().toLowerCase(), name: form.name, kind: form.kind, factor_to_base: form.factor_to_base }); };
  const unitById = (id: string) => units.data?.find((u) => u.id === id);
  const fromUnit = unitById(conv.from);
  const toUnit = unitById(conv.to);
  const convProblem = conversionProblem(conv.from, conv.to, conv.factor);
  const pair = fromUnit && toUnit && !convProblem ? conversionPair(fromUnit.code, toUnit.code, conv.factor) : null;
  const submitConversion = () => saveConversion.mutate({ from_unit_id: conv.from, to_unit_id: conv.to, factor: conv.factor.trim() }, { onSuccess: () => setConv({ from: "", to: "", factor: "" }) });
  return (
    <>
      <PageHeader icon={Ruler} title="Units" description="Stock is kept in base units (g, ml, pcs). Add purchase and pack units such as box, bottle, packet or custom ones like Pet12 and Pet6 with their factor to the base unit. Conversion factors are stored in each direction; recipes convert automatically and the ingredient picker only offers compatible units." actions={<Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New unit</Button>} />
      {units.isLoading ? <Loading /> : (
        <Table className="mb-5">
          <THead><tr><TH>Code</TH><TH>Name</TH><TH>Kind</TH><TH right>Factor to base</TH><TH /></tr></THead>
          <TBody>
            {units.data?.length ? units.data.map((u) => (
              <TR key={u.id}>
                <TD className="font-mono font-medium">{u.code}{u.is_base ? <Badge className="ml-2" variant="primary">base</Badge> : null}</TD>
                <TD>{u.name}</TD>
                <TD className="capitalize text-fg-secondary">{u.kind}</TD>
                <TD right className="text-fg-secondary">{conversionSentence(u.code, BASE[u.kind], u.factor_to_base)}</TD>
                <TD className="whitespace-nowrap text-right">
                  <Button variant="ghost" size="icon-sm" onClick={() => setForm({ id: u.id, code: u.code, name: u.name, kind: u.kind, factor_to_base: String(Number(u.factor_to_base)) })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  {!u.is_base ? <Button variant="ghost" size="icon-sm" onClick={() => setArchiving(u)} aria-label="Archive"><Archive className="h-4 w-4 text-danger" /></Button> : null}
                </TD>
              </TR>
            )) : <EmptyRow colSpan={5}>No units.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ArrowLeftRight className="h-4 w-4" /> Conversions</CardTitle><span className="text-xs text-fg-muted">{conversions.data?.length ?? 0} stored factors</span></CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-fg-secondary">Each factor is stored in both directions as its own row: saving 1 kg = 1000 g also stores 1 g = 0.001 kg. Pair custom units with the unit they contain, for example 1 pet12 = 12 btl.</p>
          <div className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_140px_auto]">
            <Field label="From unit"><Select value={conv.from} onChange={(e) => setConv({ ...conv, from: e.target.value })}><option value="">Choose…</option>{units.data?.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}</Select></Field>
            <Field label="To unit"><Select value={conv.to} onChange={(e) => setConv({ ...conv, to: e.target.value })}><option value="">Choose…</option>{units.data?.filter((u) => u.id !== conv.from).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}</Select></Field>
            <Field label={`1 ${fromUnit?.code ?? "unit"} =`}><Input type="number" inputMode="decimal" min={0} step="any" className="tabular" value={conv.factor} onChange={(e) => setConv({ ...conv, factor: e.target.value })} placeholder={toUnit ? toUnit.code : "factor"} /></Field>
            <Button onClick={submitConversion} loading={saveConversion.isPending} disabled={!!convProblem}>Save both directions</Button>
          </div>
          <p className="text-xs text-fg-muted">{pair ? `Stores ${pair[0]} and ${pair[1]}.` : convProblem && (conv.from || conv.to || conv.factor) ? convProblem : "Choose two units and the factor."}</p>
        </CardBody>
        {conversions.isLoading ? <Loading /> : (
          <Table>
            <THead><tr><TH>From</TH><TH>To</TH><TH right>Factor</TH><TH>Reads as</TH></tr></THead>
            <TBody>
              {conversions.data?.length ? conversions.data.map((c) => (
                <TR key={c.id}>
                  <TD className="font-mono font-medium">{c.from_code}</TD>
                  <TD className="font-mono">{c.to_code}</TD>
                  <TD right className="tabular">{formatFactor(c.factor)}</TD>
                  <TD className="text-fg-secondary">{conversionSentence(c.from_code, c.to_code, c.factor)}</TD>
                </TR>
              )) : <EmptyRow colSpan={4}>No conversions stored yet. The defaults appear once units exist.</EmptyRow>}
            </TBody>
          </Table>
        )}
      </Card>
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit unit" : "New unit"} size="sm" description={form?.id ? "Code and kind cannot change once created." : "Custom units such as Pet12 (a 12-bottle pack) or Pet6 are count units; set how many base pieces one holds, then add a conversion to the bottle unit below."}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name || !form?.code || !(Number(form?.factor_to_base) > 0)} onClick={submit}>Save</Button></>}>
        {form ? (
          <div className="space-y-3">
            <Field label="Code" hint="Short, lowercase: box, bag, crate, pet12"><Input className="font-mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!!form.id} autoFocus={!form.id} /></Field>
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
