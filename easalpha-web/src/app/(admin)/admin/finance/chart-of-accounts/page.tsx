"use client";
import { useState } from "react";
import { Archive, ListTree, Pencil, Plus } from "lucide-react";
import { api, errorCode, errorMessage } from "@/lib/api";
import type { GlAccount, GlAccountKind } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { isoDay } from "@/lib/dates";
import { useCan } from "@/store/auth";
import { toast } from "@/store/toast";
import { FilterBar, PageHeader } from "@/components/admin/page";
import { useAction, useSave } from "@/components/admin/crud";
import { Badge, Button, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, MoneyInput, Select, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { GL_KINDS, accountLabel, defaultNormalSide, glKindLabel, indentFor, treeByKind } from "@/components/admin/finance-helpers";
import { AccountCode, AccountLedgerPanel, AsOfPicker, KindBadge, useGlAccounts } from "@/components/admin/finance-widgets";

// SPEC Chart of Accounts: a pre-numbered system chart users can extend but not break. System rows allow only name,
// description and opening balance edits and cannot be archived; rows with journal lines cannot be archived either.
interface Form { id?: string; code: string; name: string; kind: GlAccountKind; normal_side: "debit" | "credit"; parent_id: string; opening_balance_minor: number; description: string; is_system: boolean }
const blank: Form = { code: "", name: "", kind: "asset", normal_side: "debit", parent_id: "", opening_balance_minor: 0, description: "", is_system: false };

export default function ChartOfAccountsPage() {
  const can = useCan();
  const manage = can("settings.manage");
  const [asOf, setAsOf] = useState(isoDay());
  const [kind, setKind] = useState("");
  const q = useGlAccounts(kind || undefined, asOf);
  const all = useGlAccounts();
  const [form, setForm] = useState<Form | null>(null);
  const [archive, setArchive] = useState<GlAccount | null>(null);
  const [ledgerFor, setLedgerFor] = useState<string | null>(null);
  const save = useSave<Form>(["gl_accounts"], (f) => (f.id ? `/finance/accounts/${f.id}` : "/finance/accounts"), { onSuccess: () => setForm(null) });
  const archiveM = useAction<string>(["gl_accounts"], (id) => api(`/finance/accounts/${id}`, { method: "DELETE" }));
  const groups = treeByKind(q.data ?? []);
  const edit = (a: GlAccount) => setForm({ id: a.id, code: a.code, name: a.name, kind: a.kind, normal_side: a.normal_side, parent_id: a.parent_id ?? "", opening_balance_minor: a.opening_balance_minor, description: a.description ?? "", is_system: a.is_system });
  const submit = () => {
    if (!form) return;
    const body = form.is_system
      ? { id: form.id, name: form.name, description: form.description || null, opening_balance_minor: form.opening_balance_minor }
      : { id: form.id, code: form.code, name: form.name, kind: form.kind, normal_side: form.normal_side, parent_id: form.parent_id || null, opening_balance_minor: form.opening_balance_minor, description: form.description || null };
    save.mutate(body as unknown as Form);
  };
  const doArchive = () => {
    if (!archive) return;
    archiveM.mutate(archive.id, {
      onSuccess: () => { toast.success(`${archive.code} archived`); setArchive(null); },
      onError: (e) => {
        const code = errorCode(e);
        toast.error(code === "gl_account.system" ? "System account" : code === "gl_account.in_use" ? "Account has postings" : "Could not archive", errorMessage(e));
        setArchive(null);
      },
    });
  };
  const parents = (all.data ?? []).filter((a) => a.kind === form?.kind && a.id !== form?.id);
  return (
    <>
      <PageHeader icon={ListTree} title="Chart of accounts" description="Pre-numbered system accounts with a code, type, normal side and opening balance. Add your own under any header; system rows stay protected."
        actions={manage ? <Button onClick={() => setForm(blank)}><Plus className="h-4 w-4" /> Add account</Button> : null} />
      <FilterBar>
        <Select className="w-auto" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind"><option value="">All types</option>{GL_KINDS.map((k) => <option key={k} value={k}>{glKindLabel(k)}</option>)}</Select>
        <AsOfPicker value={asOf} onChange={setAsOf} />
      </FilterBar>
      {q.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Code</TH><TH>Account</TH><TH>Type</TH><TH>Normal side</TH><TH right>Balance</TH><TH right>Rollup</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {groups.length ? groups.map((g) => [
              <tr key={g.kind} className="border-t bg-muted/40"><td colSpan={7} className="h-10 px-4 text-xs font-medium uppercase tracking-[0.5px] text-fg-secondary">{glKindLabel(g.kind)}</td></tr>,
              ...g.rows.map(({ account: a, depth }) => (
                <TR key={a.id} className={a.is_header ? "font-semibold" : ""}>
                  <TD><div style={{ paddingLeft: indentFor(depth) }}>{a.is_header ? <span className="font-mono text-xs">{a.code}</span> : <AccountCode account={a} onOpen={setLedgerFor} />}</div></TD>
                  <TD>
                    <div style={{ paddingLeft: indentFor(depth) }} className="flex flex-wrap items-center gap-2">
                      <span>{a.name}</span>
                      {a.is_system ? <Badge variant="outline">System</Badge> : null}
                      {a.is_header ? <Badge>Header</Badge> : null}
                      {a.payment_account_id ? <Badge variant="info">Payment account</Badge> : null}
                    </div>
                    {a.description ? <div className="text-xs font-normal text-fg-muted" style={{ paddingLeft: indentFor(depth) }}>{a.description}</div> : null}
                  </TD>
                  <TD><KindBadge kind={a.kind} /></TD>
                  <TD className="capitalize text-fg-secondary">{a.normal_side}</TD>
                  <TD right className={a.is_header ? "text-fg-muted" : ""}>{a.is_header ? "" : formatMoney(a.balance_minor)}</TD>
                  <TD right>{formatMoney(a.rollup_minor)}</TD>
                  <TD right>
                    {manage ? <>
                      <Button variant="ghost" size="icon-sm" onClick={() => edit(a)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                      {!a.is_system ? <Button variant="ghost" size="icon-sm" onClick={() => setArchive(a)} aria-label="Archive"><Archive className="h-4 w-4 text-danger" /></Button> : null}
                    </> : null}
                  </TD>
                </TR>
              )),
            ]) : <EmptyRow colSpan={7}>No accounts of this type</EmptyRow>}
          </TBody>
        </Table>
      )}

      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? `Edit ${form.code}` : "Add account"} description={form?.is_system ? "System account: only the name, description and opening balance can change." : undefined} size="sm"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name || !form?.code} onClick={submit}>Save</Button></>}>
        {form ? (
          <div className="space-y-3">
            <Field label="Code" hint="Four digits in the range of its type, for example 1040"><Input className="font-mono" value={form.code} disabled={form.is_system} onChange={(e) => setForm({ ...form, code: e.target.value.replace(/[^0-9A-Za-z.-]/g, "") })} autoFocus={!form.id} /></Field>
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus={!!form.id} /></Field>
            <Field label="Type"><Select value={form.kind} disabled={form.is_system} onChange={(e) => { const k = e.target.value as GlAccountKind; setForm({ ...form, kind: k, normal_side: defaultNormalSide(k), parent_id: "" }); }}>{GL_KINDS.map((k) => <option key={k} value={k}>{glKindLabel(k)}</option>)}</Select></Field>
            <Field label="Normal side" hint="Contra accounts (for example Accumulated Depreciation) sit on the opposite side of their type"><Select value={form.normal_side} disabled={form.is_system} onChange={(e) => setForm({ ...form, normal_side: e.target.value as "debit" | "credit" })}><option value="debit">Debit</option><option value="credit">Credit</option></Select></Field>
            <Field label="Parent"><Select value={form.parent_id} disabled={form.is_system} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}><option value="">None (top level)</option>{parents.map((p) => <option key={p.id} value={p.id}>{accountLabel(p)}</option>)}</Select></Field>
            <Field label="Opening balance" hint="On the account's normal side"><MoneyInput value={form.opening_balance_minor} onChange={(v) => setForm({ ...form, opening_balance_minor: v })} /></Field>
            <Field label="Description"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!archive} onClose={() => setArchive(null)} onConfirm={doArchive} title={`Archive ${archive?.code} ${archive?.name}?`} description="Archived accounts leave the chart and the selects. An account with journal lines cannot be archived." confirmLabel="Archive" destructive loading={archiveM.isPending} />
      <AccountLedgerPanel accountId={ledgerFor} onClose={() => setLedgerFor(null)} />
    </>
  );
}
