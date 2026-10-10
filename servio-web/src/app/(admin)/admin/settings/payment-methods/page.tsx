"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Plus, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import type { PaymentAccount, PaymentMethod } from "@/lib/types";
import { titleCase } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page";
import { useList, useSave } from "@/components/admin/crud";
import { Badge, Button, Checkbox, Dialog, EmptyRow, Field, Input, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

interface Form { id?: string; code: string; name: string; kind: string; payment_account_id: string; active: boolean; works_offline: boolean; needs_reference: boolean; sort_order: number }
const blank: Form = { code: "", name: "", kind: "wallet", payment_account_id: "", active: true, works_offline: false, needs_reference: true, sort_order: 10 };

export default function PaymentMethodsPage() {
  const list = useList<PaymentMethod>("payment_methods", "/payment_methods");
  const accounts = useQuery({ queryKey: ["payment_accounts"], queryFn: () => api<{ data: PaymentAccount[] }>("/payment_accounts"), select: (r) => r.data });
  const save = useSave<Form>(["payment_methods"], (f) => (f.id ? `/payment_methods/${f.id}` : "/payment_methods"), { onSuccess: () => setForm(null) });
  const [form, setForm] = useState<Form | null>(null);
  return (
    <>
      <PageHeader icon={CreditCard} title="Payment methods" description="Cash, cards, EasyPaisa, JazzCash, bank transfer, khata. Wallets usually need a reference." actions={<Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> New method</Button>} />
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Method</TH><TH>Kind</TH><TH>Account</TH><TH>Offline</TH><TH>Reference</TH><TH>Status</TH><TH right></TH></tr></THead>
          <TBody>
            {list.data?.length ? list.data.map((m) => (
              <TR key={m.id}>
                <TD className="font-medium">{m.name} <span className="font-mono text-xs text-fg-muted">{m.code}</span></TD>
                <TD>{titleCase(m.kind)}</TD>
                <TD className="text-fg-secondary">{accounts.data?.find((a) => a.id === m.payment_account_id)?.name ?? "-"}</TD>
                <TD>{m.works_offline ? <Badge variant="success">yes</Badge> : <Badge>no</Badge>}</TD>
                <TD>{m.needs_reference ? <Badge variant="warning">required</Badge> : <Badge>optional</Badge>}</TD>
                <TD>{m.active ? <Badge variant="success">active</Badge> : <Badge>inactive</Badge>}</TD>
                <TD right><Button variant="ghost" size="icon-sm" onClick={() => setForm({ id: m.id, code: m.code, name: m.name, kind: m.kind, payment_account_id: m.payment_account_id ?? "", active: m.active, works_offline: m.works_offline, needs_reference: m.needs_reference, sort_order: m.sort_order })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button></TD>
              </TR>
            )) : <EmptyRow colSpan={7} />}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit method" : "New method"} size="sm"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name || !form?.code} onClick={() => form && save.mutate({ ...form, payment_account_id: form.payment_account_id || (null as unknown as string) })}>Save</Button></>}>
        {form ? (
          <div className="space-y-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            <Field label="Code" hint="Lowercase, no spaces; cannot change later"><Input className="font-mono" value={form.code} disabled={!!form.id} onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} /></Field>
            <Field label="Kind"><Select value={form.kind} disabled={!!form.id} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{["cash", "card", "wallet", "bank", "khata", "qr", "custom"].map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}</Select></Field>
            <Field label="Posts to account"><Select value={form.payment_account_id} onChange={(e) => setForm({ ...form, payment_account_id: e.target.value })}><option value="">None</option>{accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
            <Field label="Sort order"><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></Field>
            <Checkbox label="Active" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            <Checkbox label="Works offline" checked={form.works_offline} onChange={(e) => setForm({ ...form, works_offline: e.target.checked })} />
            <Checkbox label="Needs a reference" checked={form.needs_reference} onChange={(e) => setForm({ ...form, needs_reference: e.target.checked })} />
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
