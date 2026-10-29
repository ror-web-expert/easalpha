"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarClock, PackageX, Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { FixedAsset, FixedAssetsResponse, PaymentAccount } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, isoDay } from "@/lib/dates";
import { useCan } from "@/store/auth";
import { Cards, FilterBar, PageHeader } from "@/components/admin/page";
import { useAction, useSave } from "@/components/admin/crud";
import { Badge, Button, Dialog, EmptyRow, Field, Input, Loading, MoneyInput, Select, Stat, SummaryCard, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { accountLabel, isFixedAssetAccount, paidFromLabel, straightLineMonthly } from "@/components/admin/finance-helpers";
import { useGlAccounts } from "@/components/admin/finance-widgets";

// SPEC Fixed Assets with straight-line depreciation. Buying an asset posts the cost to its 15xx account and credits
// where the money came from; Depreciate posts the monthly charge up to a date; Dispose clears cost and accumulated
// depreciation and books the proceeds.
interface Form { name: string; gl_account_id: string; cost_minor: number; salvage_minor: number; purchased_on: string; useful_life_months: number; note: string; paid_from: string }
const blank = (): Form => ({ name: "", gl_account_id: "", cost_minor: 0, salvage_minor: 0, purchased_on: isoDay(), useful_life_months: 60, note: "", paid_from: "capital" });

export default function FixedAssetsPage() {
  const can = useCan();
  const manage = can("settings.manage");
  const [status, setStatus] = useState("");
  const q = useQuery({ queryKey: ["fixed_assets", status], queryFn: () => api<FixedAssetsResponse>("/finance/fixed_assets", { query: { status } }) });
  const accounts = useGlAccounts("asset");
  const payAccounts = useQuery({ queryKey: ["payment_accounts"], queryFn: () => api<{ data: PaymentAccount[] }>("/payment_accounts"), select: (r) => r.data.filter((a) => a.active) });
  const [form, setForm] = useState<Form | null>(null);
  const [dep, setDep] = useState<{ asset: FixedAsset; through: string } | null>(null);
  const [dispose, setDispose] = useState<{ asset: FixedAsset; on: string; proceeds_minor: number; proceeds_account_id: string } | null>(null);
  const keys = ["fixed_assets", "gl_accounts", "journal", "payment_accounts"];
  const create = useSave<Form>(keys, () => "/finance/fixed_assets", { onSuccess: () => setForm(null), success: "Asset added" });
  const depM = useAction<{ id: string; through: string }>(keys, ({ id, through }) => api(`/finance/fixed_assets/${id}/depreciate`, { method: "POST", body: { through } }), "Depreciation posted");
  const disposeM = useAction<{ id: string; on: string; proceeds_minor: number; proceeds_account_id: string | null }>(keys, ({ id, ...b }) => api(`/finance/fixed_assets/${id}/dispose`, { method: "POST", body: b }), "Asset disposed");
  const assetAccounts = (accounts.data ?? []).filter(isFixedAssetAccount);
  const rows = q.data?.data ?? [];
  const t = q.data?.totals;
  const monthly = form ? straightLineMonthly(form.cost_minor, form.salvage_minor, form.useful_life_months) : 0;
  return (
    <>
      <PageHeader icon={Building2} title="Fixed Assets" description="Equipment, furniture and vehicles on the books. Straight-line depreciation posts to 1590 Accumulated Depreciation." actions={manage ? <Button onClick={() => setForm(blank())}><Plus className="h-4 w-4" /> Add asset</Button> : null} />
      <Cards>
        <SummaryCard label="Cost" value={formatMoney(t?.cost_minor)} sub={`${rows.length} assets`} tone="primary" />
        <SummaryCard label="Accumulated depreciation" value={formatMoney(t?.accumulated_minor)} tone="warning" />
        <SummaryCard label="Book value" value={formatMoney(t?.book_value_minor)} tone="success" />
      </Cards>
      <FilterBar><Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All</option><option value="active">Active</option><option value="disposed">Disposed</option></Select></FilterBar>
      {q.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Asset</TH><TH>Account</TH><TH>Purchased</TH><TH right>Cost</TH><TH right>Salvage</TH><TH right>Life</TH><TH right>Monthly</TH><TH right>Accumulated</TH><TH right>Book value</TH><TH>Depreciated through</TH><TH>Status</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {rows.length ? rows.map((a) => (
              <TR key={a.id}>
                <TD className="font-medium">{a.name}{a.note ? <span className="block text-xs font-normal text-fg-muted">{a.note}</span> : null}</TD>
                <TD className="text-fg-secondary">{a.account}</TD>
                <TD className="whitespace-nowrap">{formatDate(a.purchased_on)}</TD>
                <TD right>{formatMoney(a.cost_minor)}</TD>
                <TD right>{formatMoney(a.salvage_minor)}</TD>
                <TD right>{a.useful_life_months} mo</TD>
                <TD right>{formatMoney(a.monthly_minor)}</TD>
                <TD right>{formatMoney(a.accumulated_minor)}</TD>
                <TD right className="font-medium">{formatMoney(a.book_value_minor)}</TD>
                <TD className="whitespace-nowrap text-fg-secondary">{a.depreciated_through ? formatDate(a.depreciated_through) : "Not yet"}</TD>
                <TD>{a.status === "active" ? <Badge variant="success">Active</Badge> : <Badge>Disposed{a.disposed_at ? ` ${formatDate(a.disposed_at)}` : ""}</Badge>}</TD>
                <TD right className="whitespace-nowrap">
                  {manage && a.status === "active" ? <>
                    <Button variant="ghost" size="sm" onClick={() => setDep({ asset: a, through: isoDay() })}><CalendarClock className="h-4 w-4" /> Depreciate</Button>
                    <Button variant="ghost" size="sm" onClick={() => setDispose({ asset: a, on: isoDay(), proceeds_minor: 0, proceeds_account_id: payAccounts.data?.[0]?.id ?? "" })}><PackageX className="h-4 w-4" /> Dispose</Button>
                  </> : null}
                </TD>
              </TR>
            )) : <EmptyRow colSpan={12}>No fixed assets yet</EmptyRow>}
          </TBody>
        </Table>
      )}

      <Dialog open={!!form} onClose={() => setForm(null)} title="Add asset" size="md"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={create.isPending} disabled={!form?.name || !form?.gl_account_id || !form?.cost_minor || !form?.useful_life_months || !form?.paid_from} onClick={() => form && create.mutate({ ...form, note: form.note || (null as unknown as string) })}>Add</Button></>}>
        {form ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            <Field label="Asset account" hint="Any account under 1500 Fixed Assets except 1590" className="sm:col-span-2">
              <Select value={form.gl_account_id} onChange={(e) => setForm({ ...form, gl_account_id: e.target.value })}><option value="">Choose account</option>{assetAccounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}</Select>
            </Field>
            <Field label="Cost"><MoneyInput value={form.cost_minor} onChange={(v) => setForm({ ...form, cost_minor: v })} /></Field>
            <Field label="Salvage value" hint="Left on the books after its useful life"><MoneyInput value={form.salvage_minor} onChange={(v) => setForm({ ...form, salvage_minor: v })} /></Field>
            <Field label="Purchased on"><Input type="date" value={form.purchased_on} max={isoDay()} onChange={(e) => setForm({ ...form, purchased_on: e.target.value })} /></Field>
            <Field label="Useful life (months)"><Input type="number" min={1} value={form.useful_life_months} onChange={(e) => setForm({ ...form, useful_life_months: Math.max(0, Number(e.target.value)) })} /></Field>
            <Field label="Paid from" hint="Owner's capital credits 3000 Owner's Capital; Owed to supplier credits 2010 Accounts Payable" className="sm:col-span-2">
              <Select value={form.paid_from} onChange={(e) => setForm({ ...form, paid_from: e.target.value })}>
                <option value="capital">{paidFromLabel("capital")}</option>
                <option value="payable">{paidFromLabel("payable")}</option>
                {payAccounts.data?.length ? <optgroup label="Payment account">{payAccounts.data.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup> : null}
              </Select>
            </Field>
            <Field label="Note" className="sm:col-span-2"><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
            <div className="rounded-xl border bg-card px-4 py-2 sm:col-span-2"><Stat label="Straight-line monthly charge" value={formatMoney(monthly)} /></div>
          </div>
        ) : null}
      </Dialog>

      <Dialog open={!!dep} onClose={() => setDep(null)} title={`Depreciate ${dep?.asset.name}`} description="Posts the monthly charge for every full month up to the chosen date that has not been booked yet." size="sm"
        footer={<><Button variant="secondary" onClick={() => setDep(null)}>Cancel</Button><Button loading={depM.isPending} disabled={!dep?.through} onClick={() => dep && depM.mutate({ id: dep.asset.id, through: dep.through }, { onSuccess: () => setDep(null) })}>Post depreciation</Button></>}>
        {dep ? <div className="space-y-3">
          <Stat label="Monthly charge" value={formatMoney(dep.asset.monthly_minor)} />
          <Stat label="Depreciated through" value={dep.asset.depreciated_through ? formatDate(dep.asset.depreciated_through) : "Not yet"} />
          <Field label="Through"><Input type="date" value={dep.through} max={isoDay()} onChange={(e) => setDep({ ...dep, through: e.target.value })} /></Field>
        </div> : null}
      </Dialog>

      <Dialog open={!!dispose} onClose={() => setDispose(null)} title={`Dispose ${dispose?.asset.name}?`} description="Removes the cost and accumulated depreciation from the books. Proceeds go to the chosen account; the difference is booked as a gain or loss. This cannot be undone." size="sm"
        footer={<><Button variant="secondary" onClick={() => setDispose(null)}>Cancel</Button><Button variant="destructive" loading={disposeM.isPending} disabled={!dispose?.on || (!!dispose?.proceeds_minor && !dispose?.proceeds_account_id)} onClick={() => dispose && disposeM.mutate({ id: dispose.asset.id, on: dispose.on, proceeds_minor: dispose.proceeds_minor, proceeds_account_id: dispose.proceeds_minor ? dispose.proceeds_account_id || null : null }, { onSuccess: () => setDispose(null) })}>Dispose</Button></>}>
        {dispose ? <div className="space-y-3">
          <Stat label="Book value" value={formatMoney(dispose.asset.book_value_minor)} />
          <Field label="Disposed on"><Input type="date" value={dispose.on} max={isoDay()} onChange={(e) => setDispose({ ...dispose, on: e.target.value })} /></Field>
          <Field label="Proceeds" hint="Leave at zero when scrapped"><MoneyInput value={dispose.proceeds_minor} onChange={(v) => setDispose({ ...dispose, proceeds_minor: v })} /></Field>
          <Field label="Proceeds received into"><Select value={dispose.proceeds_account_id} disabled={!dispose.proceeds_minor} onChange={(e) => setDispose({ ...dispose, proceeds_account_id: e.target.value })}><option value="">Choose account</option>{payAccounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        </div> : null}
      </Dialog>
    </>
  );
}
