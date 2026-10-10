"use client";
// SPEC "Purchasing, suppliers and expenses" > Expenses: category and subcategory, payment method and source (till or
// admin) filters with a date range; total, average, count and category count; PDF and CSV export; categories managed
// from the same screen (Categories tab). Overheads and cost per order are kept as extras from the earlier build.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Plus, Ban, Gauge, Download, FileText } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Expense, ExpenseSummary, PaymentMethod } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, isoDay } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { usePagedList, useDebounced } from "@/lib/hooks";
import { exportTablePdf } from "@/lib/pdf";
import { Cards, DateRangePicker, FilterBar, LoadMore, PageHeader, SearchInput, type DateRange } from "@/components/admin/page";
import { useList, useSave } from "@/components/admin/crud";
import { CategoryOptions, useExpenseCategories } from "@/components/admin/delivery";
import { downloadFile } from "@/components/admin/phase3";
import { ExpenseCategoriesManager } from "@/components/admin/expenses-categories";
import { EXPENSE_SOURCES, pdfRow, sourceLabel, splitCategory, subcategoriesOf, totalsFooter } from "@/components/admin/expenses-helpers";
import { useApproval } from "@/components/approval";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Checkbox, Dialog, EmptyRow, Field, Input, Loading, MoneyInput, Select, SummaryCard, Table, Tabs, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { toast } from "@/store/toast";

interface Form { category_id: string; amount_minor: number; method_code: string; spent_on: string; paid_to: string; note: string }
type Tab = "expenses" | "categories";
const monthStart = () => { const d = new Date(); return isoDay(new Date(d.getFullYear(), d.getMonth(), 1)); };
const PDF_COLUMNS = [
  { header: "Expense", key: "label" }, { header: "Date", key: "spent_on" }, { header: "Category", key: "category" }, { header: "Sub-category", key: "subcategory" },
  { header: "Method", key: "method" }, { header: "Source", key: "source" }, { header: "Paid to", key: "paid_to" }, { header: "Note", key: "note" },
  { header: "Amount", key: "amount", align: "right" as const }, { header: "Status", key: "status" },
];

export default function ExpensesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("expenses");
  const [range, setRange] = useState<DateRange>({ from: monthStart(), to: isoDay() });
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [method, setMethod] = useState("");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [voided, setVoided] = useState(false);
  const cats = useExpenseCategories();
  const methods = useList<PaymentMethod>("payment_methods", "/payment_methods");
  const subcategories = useMemo(() => subcategoriesOf(cats.data, category), [cats.data, category]);
  // The subcategory filter only lists children of the chosen category; changing the category clears it.
  useEffect(() => { setSubcategory(""); }, [category]);
  const filters = { from: range.from, to: range.to, category_id: category, subcategory_id: subcategory, method_code: method, source, q: dq, include_voided: voided ? "true" : "" };
  const list = usePagedList<Expense>(["expenses"], "/expenses", filters, { enabled: tab === "expenses" });
  const summary = useQuery({ queryKey: ["expenses_summary", range], queryFn: () => api<ExpenseSummary>("/expenses/summary", { query: { from: range.from, to: range.to } }) });
  const [form, setForm] = useState<Form | null>(null);
  const [voidTarget, setVoidTarget] = useState<Expense | null>(null);
  const [reason, setReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { run, dialog } = useApproval();
  const save = useSave<Form>(["expenses", "expenses_summary", "accounts"], () => "/expenses", { onSuccess: () => setForm(null), success: "Expense recorded" });
  const payMethods = useMemo(() => methods.data?.filter((m) => m.active && m.kind !== "khata") ?? [], [methods.data]);
  const filterMethods = useMemo(() => (methods.data ?? []).filter((m) => m.kind !== "khata").sort((a, b) => a.sort_order - b.sort_order), [methods.data]);
  useEffect(() => { if (form && !form.method_code && payMethods.length) setForm({ ...form, method_code: payMethods.find((m) => m.kind === "cash")?.code ?? payMethods[0].code }); }, [form, payMethods]);
  const doVoid = async () => {
    if (!voidTarget) return;
    setVoiding(true);
    try {
      await run((pin) => api(`/expenses/${voidTarget.id}/void`, { method: "POST", body: { reason, approver_pin: pin } }), `Void ${voidTarget.label} (${formatMoney(voidTarget.amount_minor)})`);
      toast.success("Expense voided", "The amount was reversed on the account");
      setVoidTarget(null); setReason("");
      qc.invalidateQueries({ queryKey: ["expenses"] }); qc.invalidateQueries({ queryKey: ["expenses_summary"] });
    } catch (e) { if (!(e instanceof Error && e.message === "Approval cancelled")) toast.error("Could not void", e instanceof Error ? e.message : undefined); }
    finally { setVoiding(false); }
  };
  // SPEC: CSV from the API with the same filters; PDF built in the browser from the rows on screen plus a totals footer.
  const exportCsv = async () => {
    setExporting(true);
    try { await downloadFile("/expenses/export", filters, `expenses-${range.from}-${range.to}.csv`); }
    catch (e) { toast.error("Export failed", errorMessage(e)); }
    finally { setExporting(false); }
  };
  const exportPdf = () => {
    const parts = [`${formatDate(range.from)} to ${formatDate(range.to)}`];
    if (category) parts.push(`Category: ${cats.data?.find((c) => c.id === category)?.name ?? ""}${subcategory ? ` / ${subcategories.find((c) => c.id === subcategory)?.name ?? ""}` : ""}`);
    if (method) parts.push(`Method: ${filterMethods.find((m) => m.code === method)?.name ?? titleCase(method)}`);
    if (source) parts.push(`Source: ${sourceLabel(source)}`);
    parts.push(`${list.rows.length} rows${list.nextCursor ? " loaded so far (load more to include the rest)" : ""}`);
    exportTablePdf({ title: "Expenses", subtitle: parts.join("  |  "), columns: PDF_COLUMNS, rows: list.rows.map((e) => pdfRow(e)), footer: totalsFooter(list.rows), filename: `expenses-${range.from}-${range.to}.pdf`, landscape: true });
  };
  const s = summary.data;
  return (
    <>
      <PageHeader icon={Banknote} title="Expenses" description="Cash and bank spending by category and sub-category, entered at the till or here. Voiding reverses the amount on the payment account." actions={<>
        <Link href="/admin/expenses/overheads"><Button variant="secondary"><Gauge className="h-4 w-4" /> Overheads</Button></Link>
        <Button onClick={() => setForm({ category_id: "", amount_minor: 0, method_code: "", spent_on: isoDay(), paid_to: "", note: "" })}><Plus className="h-4 w-4" /> Record expense</Button>
      </>} />
      <Tabs value={tab} onChange={setTab} items={[{ value: "expenses", label: "Expenses" }, { value: "categories", label: "Categories", count: cats.data?.length }]} className="mb-4" />
      {tab === "categories" ? <ExpenseCategoriesManager /> : (
        <>
          <Cards>
            <SummaryCard label="Total spent" value={formatMoney(s?.total_minor)} sub={`${formatDate(range.from)} to ${formatDate(range.to)} · ${s?.days ?? 0} days`} tone="danger" />
            <SummaryCard label="Average" value={formatMoney(s?.average_minor ?? (s && s.count ? Math.round(s.total_minor / s.count) : 0))} sub="per expense" tone="info" />
            <SummaryCard label="Count" value={s?.count ?? 0} sub="expenses in the period" tone="neutral" />
            <SummaryCard label="Categories" value={s?.category_count ?? s?.by_category.length ?? 0} sub={`${s?.subcategory_count ?? s?.by_subcategory.length ?? 0} sub-categories used`} tone="primary" />
          </Cards>
          <Cards className="lg:grid-cols-3 xl:grid-cols-3">
            <SummaryCard label="Overheads allocated" value={formatMoney(s?.overheads_minor)} sub={`${s?.overheads.length ?? 0} overheads for this period`} tone="warning" />
            <SummaryCard label="Paid orders" value={s?.paid_orders ?? 0} tone="neutral" />
            <SummaryCard label="Cost per order" value={s?.cost_per_order_minor != null ? formatMoney(s.cost_per_order_minor) : "-"} sub="(expenses + overheads) / paid orders" tone="info" />
          </Cards>
          <FilterBar>
            <DateRangePicker value={range} onChange={setRange} />
            <Select className="w-auto" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category"><option value="">All categories</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            <Select className="w-auto" value={subcategory} onChange={(e) => setSubcategory(e.target.value)} disabled={!subcategories.length} aria-label="Sub-category"><option value="">{category ? (subcategories.length ? "All sub-categories" : "No sub-categories") : "Sub-category"}</option>{subcategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            <Select className="w-auto" value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payment method"><option value="">Any method</option>{filterMethods.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</Select>
            <Select className="w-auto" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source"><option value="">Any source</option>{EXPENSE_SOURCES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
            <SearchInput value={q} onChange={setQ} placeholder="Note or paid to" />
            <Checkbox label="Include voided" checked={voided} onChange={(e) => setVoided(e.target.checked)} />
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={exportCsv} loading={exporting}><Download className="h-4 w-4" /> Export CSV</Button>
              <Button variant="secondary" onClick={exportPdf} disabled={!list.rows.length}><FileText className="h-4 w-4" /> Export PDF</Button>
            </div>
          </FilterBar>
          {list.isLoading ? <Loading /> : (
            <Table>
              <THead><tr><TH>Expense</TH><TH>Date</TH><TH>Category</TH><TH>Sub-category</TH><TH>Method</TH><TH>Source</TH><TH>Paid to</TH><TH>Note</TH><TH right>Amount</TH><TH right>Actions</TH></tr></THead>
              <TBody>
                {list.rows.length ? list.rows.map((e) => {
                  const c = splitCategory(e.category);
                  return (
                    <TR key={e.id} className={e.voided_at ? "opacity-60" : ""}>
                      <TD><span className="font-mono text-xs">{e.label}</span>{e.voided_at ? <Badge variant="danger" className="ml-2">voided</Badge> : null}</TD>
                      <TD className="text-fg-secondary">{formatDate(e.spent_on)}</TD>
                      <TD>{c.category}</TD>
                      <TD className="text-fg-secondary">{c.subcategory ?? "-"}</TD>
                      <TD className="text-fg-secondary">{e.method_code ? titleCase(e.method_code) : "-"}</TD>
                      <TD><Badge variant={e.source === "till" ? "info" : "neutral"}>{sourceLabel(e.source)}</Badge></TD>
                      <TD className="text-fg-secondary">{e.paid_to ?? "-"}</TD>
                      <TD className="max-w-xs truncate text-xs text-fg-muted" title={e.note ?? undefined}>{e.note ?? "-"}</TD>
                      <TD right className={e.voided_at ? "line-through" : "font-medium"}>{formatMoney(e.amount_minor)}</TD>
                      <TD right>{!e.voided_at ? <Button variant="ghost" size="icon-sm" onClick={() => { setVoidTarget(e); setReason(""); }} aria-label="Void"><Ban className="h-4 w-4 text-danger" /></Button> : <span className="text-xs text-fg-muted">{e.void_reason}</span>}</TD>
                    </TR>
                  );
                }) : <EmptyRow colSpan={10}>No expenses match these filters.</EmptyRow>}
              </TBody>
            </Table>
          )}
          <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>By category</CardTitle><span className="text-xs text-fg-muted">{formatDate(range.from)} to {formatDate(range.to)}</span></CardHeader>
              <CardBody className="p-0">
                <table className="w-full text-sm">
                  <THead><tr><TH>Category</TH><TH right>Count</TH><TH right>Amount</TH></tr></THead>
                  <TBody>
                    {s?.by_subcategory.length ? s.by_subcategory.map((r) => <TR key={r.category}><TD>{r.category}</TD><TD right>{r.count}</TD><TD right className="font-medium">{formatMoney(r.amount_minor)}</TD></TR>) : <EmptyRow colSpan={3}>Nothing spent yet.</EmptyRow>}
                    {s?.overheads.length ? s.overheads.map((o) => <TR key={o.id} className="text-fg-secondary"><TD>{o.name} <Badge className="ml-1">overhead · {o.basis.replace("_", " ")}</Badge></TD><TD right>-</TD><TD right>{formatMoney(o.allocated_minor)}</TD></TR>) : null}
                  </TBody>
                </table>
              </CardBody>
            </Card>
            <Card>
              <CardHeader><CardTitle>By method and source</CardTitle></CardHeader>
              <CardBody className="p-0">
                <table className="w-full text-sm">
                  <THead><tr><TH>Method</TH><TH right>Count</TH><TH right>Amount</TH></tr></THead>
                  <TBody>
                    {s?.by_method.length ? s.by_method.map((r) => <TR key={r.method}><TD>{r.method === "none" ? "No account (rider float)" : titleCase(r.method)}</TD><TD right>{r.count}</TD><TD right className="font-medium">{formatMoney(r.amount_minor)}</TD></TR>) : <EmptyRow colSpan={3}>Nothing spent yet.</EmptyRow>}
                    {s && Object.keys(s.by_source).length ? <TR className="text-fg-secondary"><TD colSpan={3} className="text-xs">By source: {Object.entries(s.by_source).map(([k, v]) => `${sourceLabel(k)} ${formatMoney(v)}`).join(" · ")}</TD></TR> : null}
                  </TBody>
                </table>
              </CardBody>
            </Card>
          </div>
        </>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title="Record expense" description="Posts to the payment account of the chosen method on the same day. Source: Admin."
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.category_id || !form?.amount_minor || !form?.method_code} onClick={() => form && save.mutate({ ...form, paid_to: form.paid_to || (null as unknown as string), note: form.note || (null as unknown as string) })}>Save</Button></>}>
        {form ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category / sub-category" className="sm:col-span-2"><Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} autoFocus><option value="">Choose…</option><CategoryOptions categories={cats.data} /></Select></Field>
            <Field label="Amount"><MoneyInput value={form.amount_minor} onChange={(v) => setForm({ ...form, amount_minor: v })} /></Field>
            <Field label="Paid from"><Select value={form.method_code} onChange={(e) => setForm({ ...form, method_code: e.target.value })}>{payMethods.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</Select></Field>
            <Field label="Spent on"><Input type="date" value={form.spent_on} onChange={(e) => setForm({ ...form, spent_on: e.target.value })} /></Field>
            <Field label="Paid to"><Input value={form.paid_to} onChange={(e) => setForm({ ...form, paid_to: e.target.value })} placeholder="Supplier, SSGC, staff name" /></Field>
            <Field label="Note" className="sm:col-span-2"><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          </div>
        ) : null}
      </Dialog>
      <Dialog open={!!voidTarget} onClose={() => setVoidTarget(null)} title={`Void ${voidTarget?.label}?`} description={voidTarget ? `${voidTarget.category} · ${formatMoney(voidTarget.amount_minor)}. The amount is reversed on the account; a manager PIN may be needed.` : undefined} size="sm"
        footer={<><Button variant="secondary" onClick={() => setVoidTarget(null)}>Cancel</Button><Button variant="destructive" loading={voiding} disabled={!reason.trim()} onClick={doVoid}>Void expense</Button></>}>
        <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Duplicate, wrong amount…" autoFocus /></Field>
      </Dialog>
      {dialog}
    </>
  );
}
