"use client";
// SPEC Orders Management: order rows with serial, code, type, status, customer, rider, time, payment method and status,
// and total; filters by type, status (incl. Open), payment method, payment status, source, rider and date range; sorts;
// totals for orders, revenue, average order value and completed count; bulk Mark All Completed, Export CSV, Sync Complimentary.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { CheckCheck, Clock, Download, ReceiptText, RefreshCw } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { OrderSummary, OrdersPage, OrdersSummary, PaymentMethod, Rider } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { isoDay } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { usePagedList, useDebounced } from "@/lib/hooks";
import { Cards, DateRangePicker, FilterBar, LoadMore, PageHeader, SearchInput, type DateRange } from "@/components/admin/page";
import { useList } from "@/components/admin/crud";
import { Button, ConfirmDialog, ErrorState, Loading, Select, SummaryCard } from "@/components/ui";
import { useCan } from "@/store/auth";
import { toast } from "@/store/toast";
import { downloadFile } from "@/components/admin/phase3";
import { OrderDrawer } from "@/components/admin/order-drawer";
import { OrderTable } from "@/components/admin/order-table";
import { ORDER_SORTS, ORDER_SOURCES, ORDER_TYPES, SPEC_PAYMENT_STATUSES, SPEC_STATUSES, type OrderSort } from "@/components/admin/order-helpers";

export default function OrdersPage() {
  const qc = useQueryClient();
  const can = useCan();
  const [range, setRange] = useState<DateRange>({ from: isoDay(), to: isoDay() });
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [source, setSource] = useState("");
  const [pay, setPay] = useState("");
  const [method, setMethod] = useState("");
  const [rider, setRider] = useState("");
  const [sort, setSort] = useState<OrderSort>("newest");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const riders = useList<Rider>("riders", "/riders");
  const methods = useList<PaymentMethod>("payment_methods", "/payment_methods");
  const filters = { from: range.from, to: range.to, status, order_type: type, source, payment_status: pay, payment_method: method, rider_id: rider, q: dq };
  const set = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };
  // Newest uses the cursor; every other SPEC sort is page-based on the API.
  const paged = sort === "newest";
  const list = usePagedList<OrderSummary>(["orders"], "/orders", { ...filters, sort }, { enabled: paged });
  const pages = useQuery({ queryKey: ["orders", "paged", { ...filters, sort, page }], queryFn: () => api<OrdersPage>("/orders", { query: { ...filters, sort, page, limit: 50 } }), enabled: !paged });
  const oneDay = range.from === range.to;
  const summary = useQuery({ queryKey: ["orders_summary", range.from], queryFn: () => api<OrdersSummary>("/orders/summary", { query: { business_day: range.from } }), enabled: oneDay });
  const s = summary.data;
  const refreshAll = () => { qc.invalidateQueries({ queryKey: ["orders"] }); qc.invalidateQueries({ queryKey: ["orders_summary"] }); qc.invalidateQueries({ queryKey: ["pills"] }); };

  const bulk = useMutation({
    mutationFn: () => api<{ completed: number; skipped_unpaid: number }>("/orders/bulk_complete", { method: "POST", body: oneDay ? { business_day: range.from } : {} }),
    onSuccess: (r) => { toast.success(`${r.completed} ${r.completed === 1 ? "order" : "orders"} completed`, r.skipped_unpaid ? `${r.skipped_unpaid} unpaid left open; they complete through payment.` : undefined); setConfirmBulk(false); refreshAll(); },
    onError: (e) => toast.error("Could not complete orders", errorMessage(e)),
  });
  const sync = useMutation({
    mutationFn: () => api<{ synced: number }>("/orders/sync_complimentary", { method: "POST" }),
    onSuccess: (r) => { toast.success(r.synced ? `${r.synced} complimentary ${r.synced === 1 ? "order" : "orders"} settled at zero` : "Complimentary orders already in sync"); refreshAll(); },
    onError: (e) => toast.error("Could not sync", errorMessage(e)),
  });
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try { await downloadFile("/exports/orders.csv", { from: range.from, to: range.to }, `orders-${range.from}-${range.to}.csv`); }
    catch (e) { toast.error("Export failed", errorMessage(e)); }
    finally { setExporting(false); }
  };

  const rows = paged ? list.rows : pages.data?.data ?? [];
  const loading = paged ? list.isLoading : pages.isLoading;
  const error = paged ? list.error : pages.error;
  const retry = () => (paged ? list.refetch() : pages.refetch());

  // Open orders that are fully paid: what "complete all" changes.
  const bulkCandidates = rows.filter((o) => o.spec_status !== "completed" && !["voided", "refunded", "cancelled"].includes(o.status) && o.payment_status === "paid").length;
  return (
    <>
      <PageHeader icon={ReceiptText} title="Orders" description="Every order with its order status, payment and history. Dates are business days." actions={<>
        <Button variant="ghost" size="icon" onClick={refreshAll} aria-label="Refresh" title="Refresh"><RefreshCw className="h-5 w-5" /></Button>
        <Link href="/admin/orders/pending"><Button variant="secondary"><Clock className="h-4 w-4" /> Pending Orders</Button></Link>
        {can("settings.manage", "reports.view_all", "billing.manage") ? <Button variant="secondary" onClick={exportCsv} loading={exporting}><Download className="h-4 w-4" /> Export CSV</Button> : null}
        {can("COMPLIMENTARY_ORDER", "orders.staff_meal") ? <Button variant="secondary" onClick={() => sync.mutate()} loading={sync.isPending}>Sync Complimentary</Button> : null}
      </>} />
      <Cards>
        <SummaryCard label="Orders" value={oneDay ? s?.orders ?? 0 : rows.length} sub={oneDay ? `${s?.open_orders ?? 0} open · ${s?.voided_orders ?? 0} cancelled` : "Loaded rows; pick one day for day totals"} tone="info" />
        <SummaryCard label="Revenue" value={formatMoney(oneDay ? s?.revenue_minor : rows.filter((o) => o.spec_status === "completed").reduce((a, o) => a + o.total_minor, 0))} sub={oneDay ? `${formatMoney(s?.open_minor)} still open` : "Completed rows loaded"} tone="success" />
        <SummaryCard label="Average order value" value={formatMoney(oneDay ? s?.average_order_minor : avg(rows))} sub={oneDay && s?.discount_minor ? `Discounts ${formatMoney(s.discount_minor)}` : "Completed orders"} tone="neutral" />
        <SummaryCard label="Completed" value={oneDay ? s?.paid_orders ?? 0 : rows.filter((o) => o.spec_status === "completed").length} sub={oneDay ? `${s?.staff_meals ?? 0} complimentary` : "Rows loaded"} tone="primary" />
      </Cards>
      <FilterBar>
        <SearchInput value={q} onChange={set(setQ)} placeholder="Serial, code, customer, notes" />
        <DateRangePicker value={range} onChange={set(setRange)} />
        <Select className="w-auto" value={type} onChange={(e) => set(setType)(e.target.value)} aria-label="Order type"><option value="">All types</option>{ORDER_TYPES.map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}</Select>
        <Select className="w-auto" value={status} onChange={(e) => set(setStatus)(e.target.value)} aria-label="Status"><option value="">All statuses</option><option value="open">Open</option>{SPEC_STATUSES.map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}</Select>
        <Select className="w-auto" value={method} onChange={(e) => set(setMethod)(e.target.value)} aria-label="Payment method"><option value="">Any method</option>{(methods.data ?? []).map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</Select>
        <Select className="w-auto" value={pay} onChange={(e) => set(setPay)(e.target.value)} aria-label="Payment status"><option value="">Any payment status</option>{SPEC_PAYMENT_STATUSES.map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}</Select>
        <Select className="w-auto" value={source} onChange={(e) => set(setSource)(e.target.value)} aria-label="Source"><option value="">All sources</option>{ORDER_SOURCES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</Select>
        <Select className="w-auto" value={rider} onChange={(e) => set(setRider)(e.target.value)} aria-label="Rider"><option value="">Any rider</option>{(riders.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
        <Select className="w-auto" value={sort} onChange={(e) => set(setSort)(e.target.value as OrderSort)} aria-label="Sort">{ORDER_SORTS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</Select>
      </FilterBar>
      {/* Review 4.2: completing every paid order is a bulk step that cannot be undone, so it sits apart from the page
          actions, as a quiet button by the table, and asks first with the number of orders it will change. */}
      {can("COMPLETE_ORDER", "orders.create") && bulkCandidates > 0 ? (
        <div className="mb-2 flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setConfirmBulk(true)}><CheckCheck className="h-4 w-4" /> Complete {bulkCandidates} paid order{bulkCandidates === 1 ? "" : "s"}</Button>
        </div>
      ) : null}
      {loading ? <Loading /> : error ? <ErrorState message={errorMessage(error)} onRetry={retry} /> : <OrderTable rows={rows} onSelect={setSelected} riders={riders.data} />}
      {paged ? <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} /> : (
        <div className="mt-3 flex items-center justify-center gap-3 text-sm">
          <Button variant="secondary" size="sm" disabled={page <= 1 || pages.isFetching} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
          <span className="text-fg-secondary tabular">Page {page}</span>
          <Button variant="secondary" size="sm" disabled={!pages.data?.next_page || pages.isFetching} onClick={() => setPage(pages.data?.next_page ?? page)}>Next</Button>
        </div>
      )}
      <OrderDrawer id={selected} onClose={() => setSelected(null)} />
      <ConfirmDialog open={confirmBulk} onClose={() => setConfirmBulk(false)} onConfirm={() => bulk.mutate()} title={`Complete ${bulkCandidates} paid order${bulkCandidates === 1 ? "" : "s"}?`}
        description={`${bulkCandidates} open order${bulkCandidates === 1 ? " that is" : "s that are"} fully paid ${oneDay ? `on ${range.from}` : "today"} will be marked completed${paged && list.nextCursor ? ", plus any further paid open orders not loaded yet" : ""}. This cannot be undone. Unpaid orders stay open.`} confirmLabel={`Complete ${bulkCandidates}`} loading={bulk.isPending} />
    </>
  );
}

function avg(rows: OrderSummary[]): number {
  const done = rows.filter((o) => o.spec_status === "completed");
  return done.length ? Math.round(done.reduce((a, o) => a + o.total_minor, 0) / done.length) : 0;
}
