"use client";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Send, Users } from "lucide-react";
import { api } from "@/lib/api";
import type { Customer, WhatsappMessageRow, WhatsappTemplate } from "@/lib/types";
import { formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { usePagedList } from "@/lib/hooks";
import { toast } from "@/store/toast";
import { FilterBar, LoadMore } from "@/components/admin/page";
import { useAction, useList, useRemove, useSave } from "@/components/admin/crud";
import { CustomerMultiSelect, CustomerPicker } from "@/components/admin/customers-picker";
import { insertVariable, messageStatusVariant, renderTemplate, SAMPLE_VARIABLES, unknownVariables } from "@/components/admin/marketing-helpers";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, ConfirmDialog, Dialog, EmptyRow, Field, Input, Label, Loading, Select, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";

// SPEC "Account notifications over WhatsApp": Templates built from the account variables, Manual Send, Bulk Send and
// Send Logs. Shared templates come from Servio; a business template with the same name overrides the shared one.

export function useWhatsappVariables() {
  return useQuery({ queryKey: ["whatsapp_variables"], queryFn: () => api<{ data: string[]; master_enabled: boolean }>("/whatsapp/variables") });
}

function VariableChips({ names, onPick }: { names: string[]; onPick: (name: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {names.map((v) => <button key={v} type="button" className="rounded-full border border-border-strong px-2.5 py-0.5 font-mono text-xs text-primary hover:bg-primary/8" onClick={() => onPick(v)}>{`{${v}}`}</button>)}
    </div>
  );
}

interface TemplateForm { id?: string; name: string; language: string; category: string; body: string }
const blankTemplate: TemplateForm = { name: "", language: "en", category: "utility", body: "" };

export function TemplatesTab({ disabled }: { disabled?: boolean }) {
  const templates = useList<WhatsappTemplate>("whatsapp_templates", "/whatsapp/templates");
  const vars = useWhatsappVariables();
  const names = vars.data?.data ?? [];
  const [form, setForm] = useState<TemplateForm | null>(null);
  const [removing, setRemoving] = useState<WhatsappTemplate | null>(null);
  const body = useRef<HTMLTextAreaElement>(null);
  const save = useSave<TemplateForm>(["whatsapp_templates"], (f) => (f.id ? `/whatsapp/templates/${f.id}` : "/whatsapp/templates"), { onSuccess: () => setForm(null), success: "Template saved" });
  const remove = useRemove(["whatsapp_templates"], (id) => `/whatsapp/templates/${id}`, "Template removed");
  const insert = (name: string) => {
    if (!form) return;
    const el = body.current;
    const r = insertVariable(form.body, el?.selectionStart ?? form.body.length, name);
    setForm({ ...form, body: r.text });
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(r.caret, r.caret); } });
  };
  const unknown = form ? unknownVariables(form.body, names) : [];
  return (
    <>
      <div className="mb-3 flex items-center justify-end"><Button onClick={() => setForm(blankTemplate)} disabled={disabled}><Plus className="h-4 w-4" /> New template</Button></div>
      {templates.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Template</TH><TH>Category</TH><TH>Body</TH><TH>Owner</TH><TH right></TH></tr></THead>
          <TBody>
            {templates.data?.length ? templates.data.map((t) => (
              <TR key={t.id}>
                <TD className="font-mono text-sm">{t.name}<span className="ml-2 text-xs text-fg-muted">{t.language}</span></TD>
                <TD>{titleCase(t.category)}</TD>
                <TD className="max-w-md whitespace-pre-wrap text-xs text-fg-secondary">{t.body}</TD>
                <TD>{t.shared ? <Badge>shared</Badge> : <Badge variant="primary">yours</Badge>}</TD>
                <TD right className="whitespace-nowrap">
                  {t.shared ? <Button variant="ghost" size="sm" onClick={() => setForm({ name: t.name, language: t.language, category: t.category, body: t.body })} title="Copy this shared template into your own, which then overrides it"><Pencil className="h-4 w-4" /> Override</Button> : <>
                    <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => setForm({ id: t.id, name: t.name, language: t.language, category: t.category, body: t.body })}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setRemoving(t)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                  </>}
                </TD>
              </TR>
            )) : <EmptyRow colSpan={5}>No templates yet.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit template" : "New template"} size="lg"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name || !form?.body} onClick={() => form && save.mutate(form)}>Save</Button></>}>
        {form ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name" hint="Lowercase with underscores; same name as a shared one overrides it"><Input className="font-mono" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} autoFocus /></Field>
            <Field label="Language"><Select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}><option value="en">English</option><option value="ur">Urdu</option></Select></Field>
            <Field label="Category"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="utility">Utility</option><option value="marketing">Marketing</option></Select></Field>
            <div className="sm:col-span-3">
              <Label>Insert a variable</Label>
              <VariableChips names={names} onPick={insert} />
            </div>
            <Field label="Body" className="sm:col-span-3" error={unknown.length ? `Unknown variables: ${unknown.map((u) => `{${u}}`).join(", ")}. They will be sent as written.` : undefined}>
              <Textarea ref={body} className="min-h-32 font-mono text-sm" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} spellCheck={false} />
            </Field>
            <div className="sm:col-span-3">
              <Label>Preview with sample values</Label>
              <p className="whitespace-pre-wrap rounded-md bg-muted px-3 py-2 text-sm">{renderTemplate(form.body, SAMPLE_VARIABLES) || <span className="text-fg-muted">Type a body to preview it</span>}</p>
            </div>
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title="Remove this template?" description={removing ? `${removing.name} goes back to the shared version if there is one.` : undefined} confirmLabel="Remove" destructive loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id, { onSuccess: () => setRemoving(null) })} />
    </>
  );
}

export function ManualSendTab({ disabled }: { disabled?: boolean }) {
  const templates = useList<WhatsappTemplate>("whatsapp_templates", "/whatsapp/templates");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [template, setTemplate] = useState("");
  const [orderId, setOrderId] = useState("");
  const [result, setResult] = useState<{ status: string; to: string; text: string } | null>(null);
  const send = useAction<{ customer_id: string; template: string; order_id?: string }, { id: string; status: string; to: string; text: string }>(["whatsapp_messages", "whatsapp_usage"], (body) => api("/whatsapp/send", { method: "POST", body }));
  const tpl = templates.data?.find((t) => t.name === template);
  const preview = tpl ? renderTemplate(tpl.body, { ...SAMPLE_VARIABLES, customer_name: customer?.name ?? SAMPLE_VARIABLES.customer_name, khata_no: customer?.khata_no ?? SAMPLE_VARIABLES.khata_no, new_balance: customer ? String(Math.round(customer.balance_minor / 100)) : SAMPLE_VARIABLES.new_balance, order_number: orderId ? "(from the order)" : SAMPLE_VARIABLES.order_number }) : "";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Send one message</CardTitle></CardHeader>
        <CardBody className="space-y-3">
          <Field label="Customer"><CustomerPicker value={customer} onChange={setCustomer} /></Field>
          <Field label="Template"><Select value={template} onChange={(e) => setTemplate(e.target.value)}><option value="">Choose a template</option>{templates.data?.map((t) => <option key={t.id} value={t.name}>{t.name}{t.shared ? "" : " (yours)"}</option>)}</Select></Field>
          <Field label="Order id (optional)" hint="Fills the order number, total and items from that order"><Input className="font-mono" value={orderId} onChange={(e) => setOrderId(e.target.value.trim())} placeholder="Paste an order id" /></Field>
          <Button disabled={disabled || !customer || !template || !customer.phone} loading={send.isPending} title={customer && !customer.phone ? "No phone number on file" : undefined}
            onClick={() => customer && send.mutate({ customer_id: customer.id, template, order_id: orderId || undefined }, { onSuccess: (r) => { setResult(r); toast.success("Message queued", `To ${r.to}`); } })}><Send className="h-4 w-4" /> Send</Button>
        </CardBody>
      </Card>
      <Card>
        <CardHeader><CardTitle>Preview</CardTitle>{result ? <Badge variant={messageStatusVariant(result.status)}>{result.status} to {result.to}</Badge> : null}</CardHeader>
        <CardBody>
          {tpl ? <p className="whitespace-pre-wrap rounded-md bg-muted px-3 py-2 text-sm">{result?.text ?? preview}</p> : <p className="text-sm text-fg-muted">Pick a template to see the text. Sample values stand in for anything the order will fill.</p>}
          {result?.text ? <p className="mt-2 text-xs text-fg-muted">This is the text that was sent.</p> : null}
        </CardBody>
      </Card>
    </div>
  );
}

export function BulkSendTab({ disabled }: { disabled?: boolean }) {
  const templates = useList<WhatsappTemplate>("whatsapp_templates", "/whatsapp/templates");
  const [mode, setMode] = useState<"segment" | "customers">("segment");
  const [segment, setSegment] = useState<"with_balance" | "opted_in">("with_balance");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [template, setTemplate] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [last, setLast] = useState<{ sent: number; skipped: number } | null>(null);
  const bulk = useAction<{ template: string; segment?: string; customer_ids?: string[] }, { sent: number; skipped: number }>(["whatsapp_messages", "whatsapp_usage"], (body) => api("/whatsapp/bulk", { method: "POST", body }));
  const ready = !!template && (mode === "segment" || customers.length > 0);
  const target = mode === "segment" ? (segment === "with_balance" ? "every customer with a balance to receive" : "every customer who opted in to WhatsApp") : `${customers.length} selected customer${customers.length === 1 ? "" : "s"}`;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Who</CardTitle></CardHeader>
        <CardBody className="space-y-3">
          <Field label="Send to"><Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="segment">A segment</option><option value="customers">Chosen customers</option></Select></Field>
          {mode === "segment" ? (
            <Field label="Segment"><Select value={segment} onChange={(e) => setSegment(e.target.value as typeof segment)}><option value="with_balance">Customers with a balance (To Receive)</option><option value="opted_in">Customers opted in to WhatsApp</option></Select></Field>
          ) : (
            <Field label="Customers"><CustomerMultiSelect value={customers} onChange={setCustomers} /></Field>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader><CardTitle>What</CardTitle>{last ? <Badge variant="success">{last.sent} sent, {last.skipped} skipped</Badge> : null}</CardHeader>
        <CardBody className="space-y-3">
          <Field label="Template"><Select value={template} onChange={(e) => setTemplate(e.target.value)}><option value="">Choose a template</option>{templates.data?.map((t) => <option key={t.id} value={t.name}>{t.name}{t.shared ? "" : " (yours)"}</option>)}</Select></Field>
          {template ? <p className="whitespace-pre-wrap rounded-md bg-muted px-3 py-2 text-sm">{renderTemplate(templates.data?.find((t) => t.name === template)?.body, SAMPLE_VARIABLES)}</p> : null}
          <Button disabled={disabled || !ready} onClick={() => setConfirm(true)}><Users className="h-4 w-4" /> Send to {target}</Button>
          <p className="text-xs text-fg-muted">Customers without a phone number, or who opted out, are skipped and counted.</p>
        </CardBody>
      </Card>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title="Send this bulk message?" description={`Template ${template} goes to ${target}. Each message counts against the plan's WhatsApp allowance.`} confirmLabel="Send now" loading={bulk.isPending}
        onConfirm={() => bulk.mutate(mode === "segment" ? { template, segment } : { template, customer_ids: customers.map((c) => c.id) }, { onSuccess: (r) => { setLast(r); setConfirm(false); toast.success(`${r.sent} sent`, r.skipped ? `${r.skipped} skipped` : undefined); } })} />
    </div>
  );
}

export function SendLogsTab() {
  const [status, setStatus] = useState("");
  const list = usePagedList<WhatsappMessageRow>(["whatsapp_messages"], "/whatsapp/messages", { status });
  return (
    <>
      <FilterBar>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option>{["queued", "sent", "delivered", "read", "failed", "skipped"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>When</TH><TH>To</TH><TH>Template</TH><TH>Kind</TH><TH>Status</TH><TH>Sent</TH><TH>Error</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((m) => (
              <TR key={m.id}>
                <TD className="text-fg-secondary">{formatDateTime(m.created_at)}</TD>
                <TD className="font-mono text-sm">{m.to_phone}</TD>
                <TD className="font-mono text-xs">{m.template_name ?? "-"}</TD>
                <TD>{m.kind ? titleCase(m.kind) : "-"}</TD>
                <TD><Badge variant={messageStatusVariant(m.status)}>{m.status}</Badge></TD>
                <TD className="text-fg-secondary">{m.sent_at ? formatDateTime(m.sent_at) : "-"}</TD>
                <TD className="max-w-xs truncate text-xs text-danger" title={m.error ?? undefined}>{m.error ?? ""}</TD>
              </TR>
            )) : <EmptyRow colSpan={7}>Nothing sent yet.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
    </>
  );
}
