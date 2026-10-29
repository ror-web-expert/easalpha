"use client";
// Meal Sessions: the windows a worker may take one meal in (Breakfast 07:00 to 10:00, Lunch, Dinner), per branch.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Timer } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { MealSession } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { useList, useRemove, useSave } from "@/components/admin/crud";
import { Badge, Button, Dialog, EmptyRow, Field, Input, Loading, Switch, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { toast } from "@/store/toast";

interface Form { id?: string; name: string; starts_at: string; ends_at: string; max_claims: number; active: boolean; sort_order: number }

export default function MealSessionsPage() {
  const qc = useQueryClient();
  const list = useList<MealSession>("canteen_sessions_all", "/canteen/sessions");
  const [form, setForm] = useState<Form | null>(null);
  const save = useSave<Form, MealSession>(["canteen_sessions_all", "canteen_sessions"], (f) => (f.id ? `/canteen/sessions/${f.id}` : "/canteen/sessions"), { onSuccess: () => setForm(null) });
  const remove = useRemove(["canteen_sessions_all", "canteen_sessions"], (id) => `/canteen/sessions/${id}`, "Session removed");
  const seed = async () => {
    try { await api("/canteen/sessions", { query: { seed: 1 } }); void qc.invalidateQueries({ queryKey: ["canteen_sessions_all"] }); void qc.invalidateQueries({ queryKey: ["canteen_sessions"] }); toast.success("Breakfast, Lunch and Dinner added"); }
    catch (e) { toast.error("Could not add", errorMessage(e)); }
  };
  return (
    <>
      <PageHeader icon={Timer} title="Meal Sessions" description="A worker takes one meal per session. Times are the branch's clock; a window past midnight (22:00 to 02:00) is fine."
        actions={<><Button variant="secondary" onClick={seed}>Add Breakfast, Lunch, Dinner</Button><Button onClick={() => setForm({ name: "", starts_at: "12:00", ends_at: "15:00", max_claims: 1, active: true, sort_order: (list.data?.length ?? 0) })}><Plus className="h-4 w-4" /> New session</Button></>} />
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Session</TH><TH>From</TH><TH>To</TH><TH right>Meals per worker</TH><TH>Status</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {list.data?.length ? list.data.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{s.name}</TD><TD className="tabular">{s.starts_at}</TD><TD className="tabular">{s.ends_at}</TD><TD right>{s.max_claims}</TD>
                <TD>{s.active ? <Badge variant="success">on</Badge> : <Badge>off</Badge>}</TD>
                <TD right><Button variant="ghost" size="sm" onClick={() => setForm({ ...s })}>Edit</Button><Button variant="ghost" size="sm" onClick={() => { if (confirm(`Remove ${s.name}?`)) remove.mutate(s.id); }}>Remove</Button></TD>
              </TR>
            )) : <EmptyRow colSpan={6}>No sessions yet. Add the three usual ones, or your own.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit session" : "New session"} size="sm"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name} onClick={() => form && save.mutate(form)}>Save</Button></>}>
        {form ? (
          <div className="space-y-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Lunch" autoFocus /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From"><Input type="time" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></Field>
              <Field label="To"><Input type="time" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></Field>
            </div>
            <Field label="Meals per worker in this session"><Input type="number" min={1} value={form.max_claims} onChange={(e) => setForm({ ...form, max_claims: Number(e.target.value) || 1 })} /></Field>
            <Field label="Order on the kiosk"><Input type="number" min={0} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })} /></Field>
            <label className="flex items-center justify-between text-sm"><span>Switched on</span><Switch checked={form.active} onChange={(v) => setForm({ ...form, active: v })} /></label>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
