"use client";
import { useEffect, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, FileDown } from "lucide-react";
import type { JournalEntry } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, isoDay } from "@/lib/dates";
import { useDebounced, usePagedList } from "@/lib/hooks";
import { exportTablePdf } from "@/lib/pdf";
import { DateRangePicker, FilterBar, LoadMore, PageHeader, SearchInput, type DateRange } from "@/components/admin/page";
import { Badge, Button, EmptyRow, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { accountLabel, accountOptionGroups, journalKindLabel, journalKindVariant } from "@/components/admin/finance-helpers";
import { AccountCode, AccountLedgerPanel, useGlAccounts } from "@/components/admin/finance-widgets";

// SPEC Combined Ledger: every journal posting (automatic from orders, expenses, purchases and payments, manual
// vouchers and reversals) in one register, with each account's own ledger one click away.
const monthStart = () => { const d = new Date(); return isoDay(new Date(d.getFullYear(), d.getMonth(), 1)); };

export default function CombinedLedgerPage() {
  const [range, setRange] = useState<DateRange>({ from: monthStart(), to: isoDay() });
  const [kind, setKind] = useState("");
  const [accountId, setAccountId] = useState("");
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [ledgerFor, setLedgerFor] = useState<string | null>(null);
  const accounts = useGlAccounts();
  const list = usePagedList<JournalEntry>(["journal"], "/finance/journal", { from: range.from, to: range.to, kind, account_id: accountId, q });
  // Other finance screens link here with ?account=<id> to open that account's ledger panel.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("account");
    if (id) setLedgerFor(id);
  }, []);
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const exportPdf = () => exportTablePdf({
    title: "Combined Ledger", subtitle: `${formatDate(range.from)} to ${formatDate(range.to)}${kind ? ` · ${journalKindLabel(kind)}` : ""}`, landscape: true,
    columns: [{ header: "Day", key: "day" }, { header: "Voucher", key: "voucher" }, { header: "Kind", key: "kind" }, { header: "Account", key: "account" }, { header: "Description", key: "description" }, { header: "Debit", key: "debit", align: "right" }, { header: "Credit", key: "credit", align: "right" }],
    rows: list.rows.flatMap((e) => e.lines.map((l) => ({ day: formatDate(e.business_day), voucher: e.label, kind: journalKindLabel(e.kind), account: `${l.code} ${l.account}`, description: l.description ?? e.description ?? "", debit: l.debit_minor ? formatMoney(l.debit_minor) : "", credit: l.credit_minor ? formatMoney(l.credit_minor) : "" }))),
    footer: [`${list.rows.length} vouchers · total debits ${formatMoney(list.rows.reduce((s, e) => s + e.debit_minor, 0))}`],
    filename: `combined-ledger-${range.from}-${range.to}.pdf`,
  });
  return (
    <>
      <PageHeader icon={BookOpen} title="Combined ledger" description="Every posting in the books: automatic entries from sales, purchases and payments, manual vouchers and reversals." actions={<Button variant="secondary" onClick={exportPdf} disabled={!list.rows.length}><FileDown className="h-4 w-4" /> Export PDF</Button>} />
      <FilterBar>
        <DateRangePicker value={range} onChange={setRange} />
        <Select className="w-auto" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind"><option value="">All kinds</option><option value="auto">Auto</option><option value="manual">Manual</option><option value="reversal">Reversal</option></Select>
        <Select className="w-auto max-w-xs" value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Account">
          <option value="">All accounts</option>
          {accountOptionGroups(accounts.data ?? []).map((g) => <optgroup key={g.kind} label={g.label}>{g.accounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}</optgroup>)}
        </Select>
        <SearchInput value={search} onChange={setSearch} placeholder="Search description" />
      </FilterBar>
      <Table>
        <THead><tr><TH className="w-8"></TH><TH>Day</TH><TH>Voucher</TH><TH>Kind</TH><TH>Description</TH><TH>Source</TH><TH right>Amount</TH></tr></THead>
        <TBody>
          {list.rows.length ? list.rows.map((e) => {
            const isOpen = !!open[e.id];
            return [
              <TR key={e.id} onClick={() => toggle(e.id)} aria-expanded={isOpen}>
                <TD className="pr-0 text-fg-muted">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TD>
                <TD className="whitespace-nowrap text-fg-secondary">{formatDate(e.business_day)}</TD>
                <TD><span className="font-mono text-xs">{e.label}</span></TD>
                <TD><Badge variant={journalKindVariant(e.kind)}>{journalKindLabel(e.kind)}</Badge>{e.reversed_by_id ? <Badge variant="danger" className="ml-1">Reversed</Badge> : null}</TD>
                <TD className="max-w-[20rem] truncate" title={e.description ?? ""}>{e.description ?? "-"}</TD>
                <TD className="text-fg-secondary">{e.ref_table ? e.ref_table.replace(/_/g, " ") : "-"}</TD>
                <TD right className="font-medium">{formatMoney(e.debit_minor)}</TD>
              </TR>,
              isOpen ? (
                <tr key={`${e.id}-lines`} className="border-t bg-muted/40">
                  <td colSpan={7} className="px-4 py-2">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-fg-secondary"><tr><th className="py-1 text-left font-medium">Account</th><th className="py-1 text-left font-medium">Line description</th><th className="py-1 text-right font-medium">Debit</th><th className="py-1 text-right font-medium">Credit</th></tr></thead>
                      <tbody>
                        {e.lines.map((l, i) => (
                          <tr key={l.id ?? i}>
                            <td className="py-1"><AccountCode account={{ id: l.gl_account_id, code: l.code, name: l.account }} onOpen={setLedgerFor} /> <span className={l.credit_minor ? "pl-4" : ""}>{l.account}</span></td>
                            <td className="py-1 text-fg-secondary">{l.description ?? ""}</td>
                            <td className="py-1 text-right tabular">{l.debit_minor ? formatMoney(l.debit_minor) : ""}</td>
                            <td className="py-1 text-right tabular">{l.credit_minor ? formatMoney(l.credit_minor) : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              ) : null,
            ];
          }) : <EmptyRow colSpan={7}>{list.isLoading ? "Loading…" : "No postings match"}</EmptyRow>}
        </TBody>
      </Table>
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
      <AccountLedgerPanel accountId={ledgerFor} onClose={() => setLedgerFor(null)} range={range} />
    </>
  );
}
