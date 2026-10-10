"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Landmark, Plus, ArrowLeftRight, SlidersHorizontal } from "lucide-react";
import { api } from "@/lib/api";
import type { AccountEntry, PaymentAccount } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { usePagedList } from "@/lib/hooks";
import { Cards, LoadMore, PageHeader } from "@/components/admin/page";
import { useAction, useSave } from "@/components/admin/crud";
import { Badge, Button, Card, CardBody, Dialog, EmptyRow, Field, Input, Loading, MoneyInput, Select, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function AccountsPage() {
  const q = useQuery({ queryKey: ["payment_accounts"], queryFn: () => api<{ data: PaymentAccount[]; total_balance_minor: number }>("/payment_accounts") });
  const [sel, setSel] = useState<string | null>(null);
  const entries = usePagedList<AccountEntry>(["account_entries", sel], `/payment_accounts/${sel}/entries`, {}, { enabled: !!sel });
  const [create, setCreate] = useState<{ name: string; kind: string; bank_name: string; account_no: string; opening_balance_minor: number } | null>(null);
  const [transfer, setTransfer] = useState<{ to_account_id: string; amount_minor: number; note: string } | null>(null);
  const [adjust, setAdjust] = useState<{ kind: string; amount_minor: number; note: string } | null>(null);
  const createM = useSave<NonNullable<typeof create>>(["payment_accounts"], () => "/payment_accounts", { onSuccess: () => setCreate(null), success: "Account created" });
  const transferM = useAction<NonNullable<typeof transfer>>(["payment_accounts", "account_entries"], (b) => api(`/payment_accounts/${sel}/transfer`, { method: "POST", body: b }), "Transferred");
  const adjustM = useAction<NonNullable<typeof adjust>>(["payment_accounts", "account_entries"], (b) => api(`/payment_accounts/${sel}/adjust`, { method: "POST", body: b }), "Adjusted");
  const accounts = q.data?.data ?? [];
  const cur = accounts.find((a) => a.id === sel);
  return (
    <>
      <PageHeader icon={Landmark} title="Payment accounts" description="Cash drawers, bank and wallet accounts. Every payment posts an entry." actions={<Button onClick={() => setCreate({ name: "", kind: "bank", bank_name: "", account_no: "", opening_balance_minor: 0 })}><Plus className="h-4 w-4" /> New account</Button>} />
      <Cards>
        <SummaryCard label="Company balance" value={formatMoney(q.data?.total_balance_minor)} sub={`${accounts.length} accounts`} tone="success" />
      </Cards>
      {q.isLoading ? <Loading /> : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card>
            <CardBody className="space-y-1 p-2">
              {accounts.map((a) => (
                <button key={a.id} onClick={() => setSel(a.id)} className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted ${sel === a.id ? "bg-primary-soft" : ""}`}>
                  <span><span className="font-medium">{a.name}</span><span className="block text-xs text-fg-muted">{titleCase(a.kind)}{a.bank_name ? ` · ${a.bank_name}` : ""}{!a.active ? " · inactive" : ""}</span></span>
                  <span className="font-medium tabular">{formatMoney(a.current_balance_minor)}</span>
                </button>
              ))}
              {!accounts.length ? <p className="p-3 text-sm text-fg-muted">No accounts yet.</p> : null}
            </CardBody>
          </Card>
          <div>
            {cur ? (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div><span className="text-lg font-semibold">{cur.name}</span> <Badge>{titleCase(cur.kind)}</Badge> {cur.is_default ? <Badge variant="primary">default</Badge> : null}</div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setTransfer({ to_account_id: accounts.find((a) => a.id !== sel)?.id ?? "", amount_minor: 0, note: "" })}><ArrowLeftRight className="h-4 w-4" /> Transfer</Button>
                    <Button variant="secondary" size="sm" onClick={() => setAdjust({ kind: "deposit", amount_minor: 0, note: "" })}><SlidersHorizontal className="h-4 w-4" /> Adjust</Button>
                  </div>
                </div>
                <Table>
                  <THead><tr><TH>When</TH><TH>Kind</TH><TH>Description</TH><TH right>Amount</TH></tr></THead>
                  <TBody>
                    {entries.rows.length ? entries.rows.map((e) => (
                      <TR key={e.id}><TD className="text-fg-secondary">{formatDateTime(e.occurred_at)}</TD><TD><Badge>{titleCase(e.kind)}</Badge></TD><TD>{e.description}</TD><TD right className={e.amount_minor < 0 ? "text-danger" : "text-success"}>{formatMoney(e.amount_minor)}</TD></TR>
                    )) : <EmptyRow colSpan={4}>{entries.isLoading ? "Loading…" : "No entries"}</EmptyRow>}
                  </TBody>
                </Table>
                <LoadMore cursor={entries.nextCursor} onLoad={() => entries.fetchNextPage()} loading={entries.isFetchingNextPage} />
              </>
            ) : <p className="py-10 text-center text-sm text-fg-muted">Pick an account to see its entries.</p>}
          </div>
        </div>
      )}
      <Dialog open={!!create} onClose={() => setCreate(null)} title="New account" size="sm" footer={<><Button variant="secondary" onClick={() => setCreate(null)}>Cancel</Button><Button loading={createM.isPending} disabled={!create?.name} onClick={() => create && createM.mutate(create)}>Create</Button></>}>
        {create ? <div className="space-y-3">
          <Field label="Name"><Input value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} autoFocus /></Field>
          <Field label="Kind"><Select value={create.kind} onChange={(e) => setCreate({ ...create, kind: e.target.value })}>{["bank", "wallet", "cash", "safe", "other"].map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}</Select></Field>
          <Field label="Bank"><Input value={create.bank_name} onChange={(e) => setCreate({ ...create, bank_name: e.target.value })} /></Field>
          <Field label="Account no"><Input value={create.account_no} onChange={(e) => setCreate({ ...create, account_no: e.target.value })} /></Field>
          <Field label="Opening balance"><MoneyInput value={create.opening_balance_minor} onChange={(v) => setCreate({ ...create, opening_balance_minor: v })} /></Field>
        </div> : null}
      </Dialog>
      <Dialog open={!!transfer} onClose={() => setTransfer(null)} title={`Transfer from ${cur?.name}`} size="sm" footer={<><Button variant="secondary" onClick={() => setTransfer(null)}>Cancel</Button><Button loading={transferM.isPending} disabled={!transfer?.to_account_id || !transfer?.amount_minor} onClick={() => transfer && transferM.mutate(transfer, { onSuccess: () => setTransfer(null) })}>Transfer</Button></>}>
        {transfer ? <div className="space-y-3">
          <Field label="To account"><Select value={transfer.to_account_id} onChange={(e) => setTransfer({ ...transfer, to_account_id: e.target.value })}>{accounts.filter((a) => a.id !== sel && a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          <Field label="Amount"><MoneyInput value={transfer.amount_minor} onChange={(v) => setTransfer({ ...transfer, amount_minor: v })} /></Field>
          <Field label="Note"><Input value={transfer.note} onChange={(e) => setTransfer({ ...transfer, note: e.target.value })} /></Field>
        </div> : null}
      </Dialog>
      <Dialog open={!!adjust} onClose={() => setAdjust(null)} title={`Adjust ${cur?.name}`} size="sm" footer={<><Button variant="secondary" onClick={() => setAdjust(null)}>Cancel</Button><Button loading={adjustM.isPending} disabled={!adjust?.note || !adjust?.amount_minor} onClick={() => adjust && adjustM.mutate(adjust, { onSuccess: () => setAdjust(null) })}>Post</Button></>}>
        {adjust ? <div className="space-y-3">
          <Field label="Kind"><Select value={adjust.kind} onChange={(e) => setAdjust({ ...adjust, kind: e.target.value })}><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option><option value="adjustment">Adjustment (signed)</option></Select></Field>
          <Field label="Amount"><MoneyInput value={adjust.amount_minor} onChange={(v) => setAdjust({ ...adjust, amount_minor: v })} /></Field>
          <Field label="Note (required)"><Input value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} /></Field>
        </div> : null}
      </Dialog>
    </>
  );
}
