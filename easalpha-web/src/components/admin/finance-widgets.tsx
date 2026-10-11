"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AccountLedger, GlAccount } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, isoDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { DateRangePicker, type DateRange } from "@/components/admin/page";
import { Badge, EmptyRow, Input, Loading, Sheet, Stat, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { drCr, glKindLabel, glKindVariant, journalKindLabel, journalKindVariant } from "./finance-helpers";

// Shared pieces for the SPEC finance screens: the chart of accounts query, the "as of" day picker, the Balanced badge
// and the account ledger panel every statement links into (the Combined Ledger drill-down).

export function useGlAccounts(kind?: string, asOf?: string) {
  return useQuery({ queryKey: ["gl_accounts", kind ?? "", asOf ?? ""], queryFn: () => api<{ as_of: string; data: GlAccount[] }>("/finance/accounts", { query: { kind, as_of: asOf } }), select: (r) => r.data });
}

export function AsOfPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-fg-secondary">
      As of
      <Input type="date" className="w-auto" value={value} max={isoDay()} onChange={(e) => onChange(e.target.value || isoDay())} aria-label="As of" />
    </label>
  );
}

export function BalancedBadge({ balanced }: { balanced: boolean | undefined }) {
  if (balanced === undefined) return null;
  return balanced ? <Badge variant="success">Balanced</Badge> : <Badge variant="danger">Out of balance</Badge>;
}

export function KindBadge({ kind }: { kind: string }) {
  return <Badge variant={glKindVariant(kind)}>{glKindLabel(kind)}</Badge>;
}

/** Account code shown as a link that opens the ledger panel. */
export function AccountCode({ account, onOpen, className }: { account: Pick<GlAccount, "id" | "code" | "name">; onOpen: (id: string) => void; className?: string }) {
  return (
    <button type="button" onClick={() => onOpen(account.id)} className={cn("font-mono text-xs text-primary underline-offset-2 hover:underline", className)} title={`Open ledger for ${account.code} ${account.name}`}>
      {account.code}
    </button>
  );
}

/** One account's postings between two days with opening and closing balances. */
export function AccountLedgerPanel({ accountId, onClose, range: initial }: { accountId: string | null; onClose: () => void; range?: DateRange }) {
  const [range, setRange] = useState<DateRange>(initial ?? { from: isoDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), to: isoDay() });
  useEffect(() => { if (initial) setRange(initial); }, [initial?.from, initial?.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = useQuery({ queryKey: ["gl_ledger", accountId, range], queryFn: () => api<AccountLedger>(`/finance/accounts/${accountId}/ledger`, { query: { from: range.from, to: range.to } }), enabled: !!accountId });
  const d = q.data;
  return (
    <Sheet open={!!accountId} onClose={onClose} title={d ? `${d.account.code} ${d.account.name}` : "Account ledger"} description={d ? <span className="flex flex-wrap items-center gap-2"><KindBadge kind={d.account.kind} /><span>Normal side {d.account.normal_side}</span>{d.account.is_system ? <Badge variant="outline">System</Badge> : null}</span> : undefined}>
      <div className="mb-3"><DateRangePicker value={range} onChange={setRange} /></div>
      {q.isLoading || !d ? <Loading /> : (
        <>
          <div className="mb-3 rounded-xl border bg-card px-4 py-2">
            <Stat label={`Opening balance on ${formatDate(range.from)}`} value={drCr(d.opening_minor, d.account.normal_side)} />
            <Stat label={`Closing balance on ${formatDate(range.to)}`} value={drCr(d.closing_minor, d.account.normal_side)} className="font-medium" />
          </div>
          <Table>
            <THead><tr><TH>Day</TH><TH>Voucher</TH><TH>Description</TH><TH right>Debit</TH><TH right>Credit</TH><TH right>Balance</TH></tr></THead>
            <TBody>
              {d.rows.length ? d.rows.map((r, i) => (
                <TR key={r.id ?? i}>
                  <TD className="whitespace-nowrap text-fg-secondary">{formatDate(r.business_day)}</TD>
                  <TD><span className="font-mono text-xs">{r.voucher}</span> <Badge variant={journalKindVariant(r.kind)} className="ml-1">{journalKindLabel(r.kind)}</Badge></TD>
                  <TD className="max-w-[16rem] truncate" title={r.description ?? ""}>{r.description ?? "-"}</TD>
                  <TD right>{r.debit_minor ? formatMoney(r.debit_minor) : ""}</TD>
                  <TD right>{r.credit_minor ? formatMoney(r.credit_minor) : ""}</TD>
                  <TD right className="whitespace-nowrap">{drCr(r.balance_minor, d.account.normal_side)}</TD>
                </TR>
              )) : <EmptyRow colSpan={6}>No postings in this range</EmptyRow>}
            </TBody>
          </Table>
        </>
      )}
    </Sheet>
  );
}
