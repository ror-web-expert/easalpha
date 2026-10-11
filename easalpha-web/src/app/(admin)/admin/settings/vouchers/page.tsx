"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ticket, Plus, Copy, Send, Trash2, Power } from "lucide-react";
import { api } from "@/lib/api";
import type { Customer, VoucherBatch, VoucherBatchDetail, VoucherKind } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { toast } from "@/store/toast";
import { PageHeader } from "@/components/admin/page";
import { useAction, useList, useRemove, useSave } from "@/components/admin/crud";
import { CustomerMultiSelect } from "@/components/admin/customers-picker";
import { CASHIER_LIMIT_NOTE, voucherBatchState, voucherExpiryLabel, voucherStatusLabel, voucherStatusVariant, voucherTerms } from "@/components/admin/marketing-helpers";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, MoneyInput, Select, Sheet, Switch, Table, TBody, TD, TH, THead, TR, Tabs } from "@/components/ui";

// SPEC Vouchers: code batches with a value, a minimum spend and an expiry. Personal codes are generated per customer
// and sent from the POS campaign screen, redeemable only by that customer. A public code is a single code posted on
// social media, usable on any order until it expires or hits its usage limit.

interface Form { name: string; kind: VoucherKind; value_kind: "percent" | "fixed"; value: string; min_spend_minor: number; expires_on: string; usage_limit: string; public_code: string }
const blank: Form = { name: "", kind: "personal", value_kind: "fixed", value: "500", min_spend_minor: 0, expires_on: "", usage_limit: "", public_code: "" };

function copy(code: string) {
  navigator.clipboard?.writeText(code).then(() => toast.success("Code copied", code)).catch(() => toast.error("Could not copy", "Select the code and copy it by hand"));
}

export default function VouchersPage() {
  const [kind, setKind] = useState<VoucherKind>("personal");
  const list = useList<VoucherBatch>("voucher_batches", "/voucher_batches", { kind });
  const [form, setForm] = useState<Form | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<VoucherBatch | null>(null);
  const detail = useQuery({ queryKey: ["voucher_batch", openId], queryFn: () => api<VoucherBatchDetail>(`/voucher_batches/${openId}`), enabled: !!openId });
  const save = useSave<Record<string, unknown>>(["voucher_batches"], () => "/voucher_batches", { onSuccess: () => setForm(null), success: "Batch created" });
  const toggleActive = useAction<{ id: string; active: boolean }>(["voucher_batches", "voucher_batch"], ({ id, active }) => api(`/voucher_batches/${id}`, { method: "PATCH", body: { active } }), "Batch updated");
  const remove = useRemove(["voucher_batches"], (id) => `/voucher_batches/${id}`, "Batch removed");
  const [issueTo, setIssueTo] = useState<Customer[]>([]);
  const [sendNow, setSendNow] = useState(true);
  const issue = useAction<{ id: string; customer_ids: string[]; send: boolean }, { issued: number }>(["voucher_batches", "voucher_batch"], ({ id, ...body }) => api(`/voucher_batches/${id}/issue`, { method: "POST", body }));
  const submit = () => form && save.mutate({ name: form.name, kind: form.kind, value_kind: form.value_kind, value: Number(form.value), min_spend_minor: form.min_spend_minor, expires_on: form.expires_on || null, usage_limit: form.kind === "public" && form.usage_limit ? Number(form.usage_limit) : null, public_code: form.kind === "public" ? form.public_code : null });
  const b = detail.data;
  return (
    <>
      <PageHeader icon={Ticket} title="Vouchers" description="Code batches with a value, a minimum spend and an expiry. Personal codes go to named customers; a public code is one code anyone can use until it expires or hits its limit." actions={<Button onClick={() => setForm({ ...blank, kind })}><Plus className="h-4 w-4" /> New batch</Button>} />
      <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm text-fg-secondary">{CASHIER_LIMIT_NOTE}</p>
      <Tabs value={kind} onChange={setKind} className="mb-4" items={[{ value: "personal", label: "Personal" }, { value: "public", label: "Public" }]} />
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Batch</TH><TH>Terms</TH>{kind === "public" ? <TH>Code</TH> : null}<TH>Expiry</TH><TH right>{kind === "public" ? "Used / limit" : "Issued / redeemed"}</TH><TH>State</TH><TH right></TH></tr></THead>
          <TBody>
            {list.data?.length ? list.data.map((x) => {
              const st = voucherBatchState(x);
              return (
                <TR key={x.id} onClick={() => setOpenId(x.id)}>
                  <TD className="font-medium">{x.name}</TD>
                  <TD className="text-fg-secondary">{voucherTerms(x)}</TD>
                  {kind === "public" ? <TD><span className="font-mono text-sm">{x.public_code}</span> {x.public_code ? <Button variant="ghost" size="icon-sm" aria-label="Copy code" onClick={(e) => { e.stopPropagation(); copy(x.public_code!); }}><Copy className="h-4 w-4" /></Button> : null}</TD> : null}
                  <TD className="text-fg-secondary">{voucherExpiryLabel(x.expires_on)}</TD>
                  <TD right>{kind === "public" ? `${x.redeemed_count} / ${x.usage_limit ?? "no limit"}` : `${x.issued_count} / ${x.redeemed_count}`}</TD>
                  <TD><Badge variant={st.variant}>{st.label}</Badge></TD>
                  <TD right className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon-sm" aria-label={x.active ? "Deactivate" : "Activate"} title={x.active ? "Deactivate" : "Activate"} onClick={() => toggleActive.mutate({ id: x.id, active: !x.active })}><Power className={`h-4 w-4 ${x.active ? "text-success" : ""}`} /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setRemoving(x)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                  </TD>
                </TR>
              );
            }) : <EmptyRow colSpan={kind === "public" ? 7 : 6}>No {kind} batches yet.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title="New voucher batch" size="md"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name || !Number(form?.value) || (form?.kind === "public" && !form.public_code)} onClick={submit}>Create</Button></>}>
        {form ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Eid 2026" autoFocus /></Field>
            <Field label="Kind" hint={form.kind === "personal" ? "One code per customer, redeemable only by them" : "One shared code for social media"}><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as VoucherKind })}><option value="personal">Personal</option><option value="public">Public</option></Select></Field>
            <Field label="Value">
              <div className="flex gap-2">
                <Select className="w-28" value={form.value_kind} onChange={(e) => setForm({ ...form, value_kind: e.target.value as Form["value_kind"] })}><option value="fixed">Rs</option><option value="percent">Percent</option></Select>
                <Input type="number" min={0} step="any" className="tabular" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </div>
            </Field>
            <Field label="Minimum spend" hint="0 = any order"><MoneyInput value={form.min_spend_minor} onChange={(v) => setForm({ ...form, min_spend_minor: v })} /></Field>
            <Field label="Expires on" hint="Blank = no expiry"><Input type="date" value={form.expires_on} onChange={(e) => setForm({ ...form, expires_on: e.target.value })} /></Field>
            {form.kind === "public" ? <>
              <Field label="Public code" hint="Letters and digits; stored upper-case"><Input className="font-mono uppercase" value={form.public_code} onChange={(e) => setForm({ ...form, public_code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") })} placeholder="EID500" /></Field>
              <Field label="Usage limit" hint="Blank = unlimited"><Input type="number" min={1} className="tabular" value={form.usage_limit} onChange={(e) => setForm({ ...form, usage_limit: e.target.value })} /></Field>
            </> : null}
          </div>
        ) : null}
      </Dialog>
      <Sheet open={!!openId} onClose={() => { setOpenId(null); setIssueTo([]); }} title={b?.name ?? "Batch"} description={b ? <>{voucherTerms(b)} · {voucherExpiryLabel(b.expires_on)} · <Badge variant={voucherBatchState(b).variant}>{voucherBatchState(b).label}</Badge></> : undefined} className="max-w-2xl">
        {detail.isLoading || !b ? <Loading /> : (
          <div className="space-y-4">
            {b.kind === "public" ? (
              <Card><CardBody className="flex flex-wrap items-center justify-between gap-3">
                <div><div className="text-xs text-fg-secondary">Public code</div><div className="font-mono text-2xl">{b.public_code}</div></div>
                <div className="text-right text-sm text-fg-secondary">Redeemed {b.redeemed_count} of {b.usage_limit ?? "unlimited"}</div>
                <Button variant="secondary" onClick={() => copy(b.public_code!)}><Copy className="h-4 w-4" /> Copy code</Button>
              </CardBody></Card>
            ) : (
              <Card>
                <CardHeader><CardTitle>Issue to customers</CardTitle><span className="text-xs text-fg-secondary">{b.issued_count} issued · {b.redeemed_count} redeemed</span></CardHeader>
                <CardBody className="space-y-3">
                  <CustomerMultiSelect value={issueTo} onChange={setIssueTo} placeholder="Search customers to add" />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Switch checked={sendNow} onChange={setSendNow} label="Send the code over WhatsApp now" />
                    <Button disabled={!issueTo.length || !b.active} loading={issue.isPending} onClick={() => issue.mutate({ id: b.id, customer_ids: issueTo.map((c) => c.id), send: sendNow }, { onSuccess: (r) => { toast.success(`${r.issued} voucher${r.issued === 1 ? "" : "s"} issued`); setIssueTo([]); } })}><Send className="h-4 w-4" /> Issue {issueTo.length ? `to ${issueTo.length}` : ""}</Button>
                  </div>
                  <p className="text-xs text-fg-muted">A customer who already holds an unused code from this batch keeps that code. Sending needs the WhatsApp master toggle on and a phone number on file.</p>
                </CardBody>
              </Card>
            )}
            <Table>
              <THead><tr><TH>Code</TH><TH>Customer</TH><TH>Status</TH><TH>Sent</TH><TH>Redeemed</TH><TH right></TH></tr></THead>
              <TBody>
                {b.vouchers.length ? b.vouchers.map((v) => (
                  <TR key={v.id}>
                    <TD className="font-mono text-sm">{v.code}</TD>
                    <TD>{v.customer_name ?? <span className="text-fg-muted">Anyone</span>}</TD>
                    <TD><Badge variant={voucherStatusVariant(v.status)}>{voucherStatusLabel(v.status)}</Badge></TD>
                    <TD className="text-fg-secondary">{v.sent_at ? formatDateTime(v.sent_at) : "-"}</TD>
                    <TD className="text-fg-secondary">{v.redeemed_at ? formatDateTime(v.redeemed_at) : "-"}</TD>
                    <TD right><Button variant="ghost" size="icon-sm" aria-label="Copy code" onClick={() => copy(v.code)}><Copy className="h-4 w-4" /></Button></TD>
                  </TR>
                )) : <EmptyRow colSpan={6}>{b.kind === "public" ? "Redemptions appear here as the code is used." : "No codes issued yet."}</EmptyRow>}
              </TBody>
            </Table>
            {b.min_spend_minor ? <p className="text-xs text-fg-muted">Minimum spend {formatMoney(b.min_spend_minor)}. Created {formatDate(b.created_at)}.</p> : <p className="text-xs text-fg-muted">Created {formatDate(b.created_at)}.</p>}
          </div>
        )}
      </Sheet>
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title="Remove this batch?" description={removing ? `${removing.name} is archived and its codes stop working. Redeemed vouchers stay on their orders.` : undefined} confirmLabel="Remove" destructive loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id, { onSuccess: () => { setRemoving(null); if (openId === removing.id) setOpenId(null); } })} />
    </>
  );
}
