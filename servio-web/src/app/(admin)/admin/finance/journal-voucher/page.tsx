"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Plus, Scroll, Trash2, Undo2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { JournalEntry } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, isoDay } from "@/lib/dates";
import { usePagedList } from "@/lib/hooks";
import { useCan } from "@/store/auth";
import { toast } from "@/store/toast";
import { LoadMore, PageHeader } from "@/components/admin/page";
import { useAction } from "@/components/admin/crud";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Dialog, EmptyRow, Field, Input, MoneyInput, Select, Stat, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { accountLabel, accountOptionGroups, blankLine, canPostVoucher, filledLines, journalKindLabel, journalKindVariant, unbalancedMessage, voucherTotals, type VoucherLine } from "@/components/admin/finance-helpers";
import { useGlAccounts } from "@/components/admin/finance-widgets";

// SPEC Journal Voucher: manual double-entry postings. Post stays disabled until debits equal credits and there are at
// least two lines; the API's own 400 messages (unbalanced, lines, header account) are shown as they come.
interface Header { business_day: string; description: string }
const freshLines = () => [blankLine(), blankLine()];

export default function JournalVoucherPage() {
  const can = useCan();
  const canPost = can("settings.manage");
  const qc = useQueryClient();
  const accounts = useGlAccounts();
  const [header, setHeader] = useState<Header>({ business_day: isoDay(), description: "" });
  const [lines, setLines] = useState<VoucherLine[]>(freshLines);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [reverse, setReverse] = useState<{ entry: JournalEntry; reason: string } | null>(null);
  // The API filters one kind at a time, so manual and reversal vouchers are fetched side by side and merged newest first.
  const manual = usePagedList<JournalEntry>(["journal", "vouchers"], "/finance/journal", { kind: "manual" });
  const reversals = usePagedList<JournalEntry>(["journal", "vouchers"], "/finance/journal", { kind: "reversal" });
  const vouchers = [...manual.rows, ...reversals.rows].sort((a, b) => (a.business_day === b.business_day ? b.number - a.number : a.business_day < b.business_day ? 1 : -1));
  const listLoading = manual.isLoading || reversals.isLoading;
  const moreCursor = manual.nextCursor || reversals.nextCursor;
  const loadMore = () => { if (manual.hasNextPage) manual.fetchNextPage(); if (reversals.hasNextPage) reversals.fetchNextPage(); };
  const totals = voucherTotals(lines);
  const warning = unbalancedMessage(lines);
  const ready = canPostVoucher(lines) && !!header.description.trim();
  const post = useAction<void, JournalEntry>(["journal", "gl_accounts", "gl_ledger"], () => api<JournalEntry>("/finance/journal", { method: "POST", body: { business_day: header.business_day, description: header.description.trim(), lines: filledLines(lines).map((l) => ({ gl_account_id: l.gl_account_id, debit_minor: l.debit_minor, credit_minor: l.credit_minor, description: l.description || null })) } }));
  const reverseM = useAction<{ id: string; reason: string }, JournalEntry>(["journal", "gl_accounts", "gl_ledger"], ({ id, reason }) => api<JournalEntry>(`/finance/journal/${id}/reverse`, { method: "POST", body: { reason } }));
  const update = (key: string, patch: Partial<VoucherLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const submit = () => {
    setError(null);
    post.mutate(undefined, {
      onSuccess: (e) => { toast.success(`${e.label} posted`, formatMoney(e.debit_minor)); setHeader({ business_day: isoDay(), description: "" }); setLines(freshLines()); qc.invalidateQueries({ queryKey: ["journal"] }); },
      onError: (err) => setError(errorMessage(err)),
    });
  };
  return (
    <>
      <PageHeader icon={Scroll} title="Journal voucher" description="Manual double-entry postings. Debits must equal credits before a voucher can be posted; posted vouchers are never edited, only reversed." />
      <Card className="mb-6">
        <CardHeader><CardTitle>New voucher</CardTitle>{!canPost ? <Badge variant="outline">Read only: needs settings.manage</Badge> : null}</CardHeader>
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <Field label="Business day"><Input type="date" value={header.business_day} max={isoDay()} onChange={(e) => setHeader({ ...header, business_day: e.target.value })} disabled={!canPost} /></Field>
            <Field label="Description"><Input value={header.description} placeholder="Why this entry exists" onChange={(e) => setHeader({ ...header, description: e.target.value })} disabled={!canPost} /></Field>
          </div>
          <Table>
            <THead><tr><TH>Account</TH><TH>Line description</TH><TH right className="w-40">Debit</TH><TH right className="w-40">Credit</TH><TH right className="w-12"></TH></tr></THead>
            <TBody>
              {lines.map((l) => (
                <TR key={l.key}>
                  <TD className="min-w-[16rem]">
                    <Select value={l.gl_account_id} onChange={(e) => update(l.key, { gl_account_id: e.target.value })} disabled={!canPost} aria-label="Account">
                      <option value="">Choose account</option>
                      {accountOptionGroups(accounts.data ?? []).map((g) => <optgroup key={g.kind} label={g.label}>{g.accounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}</optgroup>)}
                    </Select>
                  </TD>
                  <TD><Input value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} placeholder="Optional" disabled={!canPost} /></TD>
                  <TD right><MoneyInput value={l.debit_minor} onChange={(v) => update(l.key, { debit_minor: v, credit_minor: v > 0 ? 0 : l.credit_minor })} disabled={!canPost} aria-label="Debit" /></TD>
                  <TD right><MoneyInput value={l.credit_minor} onChange={(v) => update(l.key, { credit_minor: v, debit_minor: v > 0 ? 0 : l.debit_minor })} disabled={!canPost} aria-label="Credit" /></TD>
                  <TD right><Button variant="ghost" size="icon-sm" onClick={() => setLines((ls) => (ls.length > 2 ? ls.filter((x) => x.key !== l.key) : ls))} disabled={!canPost || lines.length <= 2} aria-label="Remove line"><Trash2 className="h-4 w-4" /></Button></TD>
                </TR>
              ))}
              <tr className="border-t bg-muted/40 font-medium">
                <td className="h-12 px-4" colSpan={2}><Button variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])} disabled={!canPost}><Plus className="h-4 w-4" /> Add line</Button></td>
                <td className="h-12 px-4 text-right tabular">{formatMoney(totals.debit_minor)}</td>
                <td className="h-12 px-4 text-right tabular">{formatMoney(totals.credit_minor)}</td>
                <td />
              </tr>
            </TBody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              {warning ? <span className="text-warning-ink">{warning}</span> : totals.debit_minor > 0 ? <Badge variant="success">Balanced</Badge> : <span className="text-fg-muted">Enter at least two lines: one debit and one credit.</span>}
              {error ? <p className="mt-1 text-danger">{error}</p> : null}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { setLines(freshLines()); setHeader({ business_day: isoDay(), description: "" }); setError(null); }} disabled={!canPost}>Clear</Button>
              <Button onClick={submit} loading={post.isPending} disabled={!canPost || !ready}>Post voucher</Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <h2 className="mb-3 text-base font-medium">Manual vouchers and reversals</h2>
      <Table>
        <THead><tr><TH className="w-8"></TH><TH>Day</TH><TH>Voucher</TH><TH>Kind</TH><TH>Description</TH><TH right>Amount</TH><TH right>Actions</TH></tr></THead>
        <TBody>
          {vouchers.length ? vouchers.map((e) => {
            const isOpen = !!open[e.id];
            return [
              <TR key={e.id} onClick={() => setOpen((o) => ({ ...o, [e.id]: !o[e.id] }))}>
                <TD className="pr-0 text-fg-muted">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TD>
                <TD className="whitespace-nowrap text-fg-secondary">{formatDate(e.business_day)}</TD>
                <TD><span className="font-mono text-xs">{e.label}</span></TD>
                <TD><Badge variant={journalKindVariant(e.kind)}>{journalKindLabel(e.kind)}</Badge>{e.reversed_by_id ? <Badge variant="danger" className="ml-1">Reversed</Badge> : null}</TD>
                <TD className="max-w-[20rem] truncate" title={e.description ?? ""}>{e.description ?? "-"}</TD>
                <TD right className="font-medium">{formatMoney(e.debit_minor)}</TD>
                <TD right>{canPost && !e.reversed_by_id && e.kind !== "reversal" ? <Button variant="ghost" size="sm" onClick={(ev) => { ev.stopPropagation(); setReverse({ entry: e, reason: "" }); }}><Undo2 className="h-4 w-4" /> Reverse</Button> : null}</TD>
              </TR>,
              isOpen ? (
                <tr key={`${e.id}-lines`} className="border-t bg-muted/40">
                  <td colSpan={7} className="px-4 py-2">
                    <table className="w-full text-sm">
                      <tbody>
                        {e.lines.map((l, i) => (
                          <tr key={l.id ?? i}>
                            <td className="py-1"><span className="font-mono text-xs text-fg-secondary">{l.code}</span> <span className={l.credit_minor ? "pl-4" : ""}>{l.account}</span></td>
                            <td className="py-1 text-fg-secondary">{l.description ?? ""}</td>
                            <td className="w-32 py-1 text-right tabular">{l.debit_minor ? formatMoney(l.debit_minor) : ""}</td>
                            <td className="w-32 py-1 text-right tabular">{l.credit_minor ? formatMoney(l.credit_minor) : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              ) : null,
            ];
          }) : <EmptyRow colSpan={7}>{listLoading ? "Loading…" : "No manual vouchers yet"}</EmptyRow>}
        </TBody>
      </Table>
      <LoadMore cursor={moreCursor} onLoad={loadMore} loading={manual.isFetchingNextPage || reversals.isFetchingNextPage} />

      <Dialog open={!!reverse} onClose={() => setReverse(null)} title={`Reverse ${reverse?.entry.label}?`} description="A new reversal voucher is posted with every debit and credit swapped. The original stays in the books." size="sm"
        footer={<><Button variant="secondary" onClick={() => setReverse(null)}>Cancel</Button><Button variant="destructive" loading={reverseM.isPending} disabled={!reverse?.reason.trim()} onClick={() => reverse && reverseM.mutate({ id: reverse.entry.id, reason: reverse.reason.trim() }, { onSuccess: (r) => { toast.success(`${r.label} posted`, `Reverses ${reverse.entry.label}`); setReverse(null); } })}>Reverse</Button></>}>
        {reverse ? <div className="space-y-3">
          <Stat label="Amount" value={formatMoney(reverse.entry.debit_minor)} />
          <Field label="Reason (required)"><Input value={reverse.reason} autoFocus onChange={(e) => setReverse({ ...reverse, reason: e.target.value })} /></Field>
        </div> : null}
      </Dialog>
    </>
  );
}
