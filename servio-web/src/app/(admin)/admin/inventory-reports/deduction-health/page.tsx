"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Play, RotateCw, Search } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { DeductionAudit, DeductionHealth, DeductionHealthBucket, DeductionHealthOrder, OrdersPage, SafetyNetRunResult } from "@/lib/types";
import { formatDate, formatDateTime, formatTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { formatSignedQty } from "@/lib/units";
import { titleCase } from "@/lib/utils";
import { usePagedList } from "@/lib/hooks";
import { toast } from "@/store/toast";
import { Cards, FilterBar, LoadMore, PageHeader } from "@/components/admin/page";
import { AUDIT_STATUSES, auditStatusVariant } from "@/components/admin/purchasing";
import { ledgerKindVariant } from "@/components/admin/stock";
import { specStatusVariant } from "@/components/admin/order-helpers";
import { HEALTH_BUCKETS, healthBucketLabel, healthBucketTone, healthProblemCount, parseOrderLookup, safetyNetSentence, safetyNetTriggerLabel } from "@/components/admin/stockreport-helpers";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Dialog, EmptyRow, Input, KeyValue, Loading, Select, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

const HINTS: Record<string, string> = Object.fromEntries(HEALTH_BUCKETS.map((b) => [b.value, b.hint]));
const HEALTH_KEYS = ["deduction_health", "deduction_audits", "stock_levels", "stock_ledger"];

export default function DeductionHealthPage() {
  const qc = useQueryClient();
  const [bucket, setBucket] = useState<DeductionHealthBucket | "">("");
  const [day, setDay] = useState("");
  const [lookup, setLookup] = useState("");
  const [checkedId, setCheckedId] = useState<string | null>(null);
  const health = useQuery({ queryKey: ["deduction_health"], queryFn: () => api<DeductionHealth>("/stock/deduction_health"), refetchInterval: 60_000 });
  const auditStatus = bucket && (AUDIT_STATUSES as string[]).includes(bucket) ? bucket : "";
  const list = usePagedList<DeductionAudit>(["deduction_audits"], "/stock/deduction_audits", { status: auditStatus, business_day: day }, { enabled: bucket !== "never_ran" });
  const invalidate = () => HEALTH_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const run = useMutation({
    mutationFn: () => api<SafetyNetRunResult>("/stock/safety_net/run", { method: "POST", body: {} }),
    onSuccess: (r) => {
      invalidate();
      if (r.detail?.reason) toast.info("Safety net did not run", r.detail.reason);
      else (r.errors ? toast.error : toast.success)("Safety net ran", `${r.checked} checked, ${r.deducted} deducted${r.errors ? `, ${r.errors} errors` : ""}`);
    },
    onError: (e) => toast.error("Could not run the safety net", errorMessage(e)),
  });
  const retry = useMutation({
    mutationFn: (orderId: string) => api<DeductionHealthOrder>(`/stock/deduction_health/${orderId}/retry`, { method: "POST", body: {} }),
    onSuccess: (r) => {
      invalidate();
      qc.setQueryData(["deduction_health_order", r.order.id], r);
      const latest = r.audits[0];
      (latest && (latest.status === "ok" || latest.status === "partial") ? toast.success : toast.info)(`Retried ${r.order.label}`, latest ? `${titleCase(latest.status)}: ${latest.entries} movements. ${HINTS[latest.status] ?? ""}` : "No audit written");
    },
    onError: (e) => toast.error("Retry failed", errorMessage(e)),
  });
  const check = useMutation({
    mutationFn: async (input: string) => {
      const parsed = parseOrderLookup(input);
      if (!parsed) throw new Error("Type an order serial or id");
      if ("id" in parsed) return parsed.id;
      const page = await api<OrdersPage>("/orders", { query: { q: String(parsed.serial), limit: 1 } });
      const found = page.data[0];
      if (!found) throw new Error(`No order with serial ${parsed.serial}`);
      return found.id;
    },
    onSuccess: (id) => setCheckedId(id),
    onError: (e) => toast.error("Order not found", errorMessage(e)),
  });

  const h = health.data;
  const sn = h?.safety_net;
  const problems = healthProblemCount(h?.buckets);
  const pick = (b: DeductionHealthBucket) => setBucket((cur) => (cur === b ? "" : b));
  return (
    <>
      <PageHeader icon={ShieldCheck} title="Deduction Health" description="Whether sales are deducting stock correctly: is the safety net running, which orders never deducted, and every stock movement written for any one order." />
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle>Safety net</CardTitle>
            {sn ? <Badge variant={!sn.enabled ? "neutral" : sn.running ? "success" : "warning"}>{!sn.enabled ? "Deduction off" : sn.running ? "Running" : "Not running"}</Badge> : null}
            {sn?.pending ? <Badge variant="warning">{sn.pending} pending</Badge> : null}
          </div>
          <Button size="sm" onClick={() => run.mutate()} loading={run.isPending} disabled={!sn?.enabled}><Play className="h-4 w-4" /> Run now</Button>
        </CardHeader>
        <CardBody className="grid gap-4 text-sm md:grid-cols-2">
          <div>
            <div className="font-medium">{safetyNetSentence(sn)}</div>
            <p className="mt-1 text-fg-secondary">The till deducts once, at completion. If that call is lost, this job sweeps every {sn?.interval_minutes ?? 10} minutes, finds completed orders from the last {sn?.lookback_days ?? 14} days whose stock never moved and deducts them dated to the day the order was sold, never twice.</p>
          </div>
          <KeyValue items={[
            { label: "Last run", value: sn?.last_run_at ? `${formatDateTime(sn.last_run_at)}${sn.last_trigger ? ` · ${safetyNetTriggerLabel(sn.last_trigger)}` : ""}` : "Never" },
            { label: "Checked / deducted / errors", value: sn?.last_run_at ? `${sn.last_checked ?? 0} / ${sn.last_deducted ?? 0} / ${sn.last_errors ?? 0}` : "-" },
            { label: "Next run", value: sn?.next_run_at ? formatTime(sn.next_run_at) : sn?.enabled ? "On the next sweep" : "Deduction on sale is off" },
            { label: "Pending orders", value: sn?.pending ?? 0 },
          ]} />
        </CardBody>
      </Card>

      <Cards className="lg:grid-cols-4 xl:grid-cols-8">
        {HEALTH_BUCKETS.map((b) => {
          const n = h?.buckets[b.value] ?? 0;
          const active = bucket === b.value;
          return (
            <button key={b.value} type="button" onClick={() => pick(b.value)} aria-pressed={active} title={b.hint} className={`rounded-xl text-left ${active ? "ring-2 ring-primary" : ""}`}>
              <SummaryCard label={b.label} value={n} sub={b.sub} tone={n ? healthBucketTone(b.value) : "neutral"} className="h-full" />
            </button>
          );
        })}
      </Cards>

      <Card className="mb-6">
        <CardHeader><CardTitle>Check an order</CardTitle><span className="text-sm text-fg-secondary">{problems ? `${problems} of the audited orders need a look` : "Serial or order id"}</span></CardHeader>
        <CardBody>
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); check.mutate(lookup); }}>
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-secondary" />
              <Input className="pl-10 font-mono" value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="Serial, #1234, or order id" aria-label="Order serial or id" />
            </div>
            <Button type="submit" variant="secondary" loading={check.isPending} disabled={!lookup.trim()}>Check</Button>
          </form>
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Problem orders</CardTitle><span className="text-sm text-fg-secondary">Completed orders whose deduction never ran, newest first</span></CardHeader>
        <Table>
          <THead><tr><TH>Order</TH><TH>Day</TH><TH>Type</TH><TH>Status</TH><TH right>Total</TH><TH>Completed</TH><TH right>Action</TH></tr></THead>
          <TBody>
            {health.isLoading ? <EmptyRow colSpan={7}>Loading…</EmptyRow> : h?.problem_orders.length ? h.problem_orders.map((o) => (
              <TR key={o.id}>
                <TD><button type="button" className="font-mono font-medium text-primary hover:underline" onClick={() => setCheckedId(o.id)}>{o.label}</button></TD>
                <TD className="text-fg-secondary">{formatDate(o.business_day)}</TD>
                <TD className="text-fg-secondary">{titleCase(o.order_type)}</TD>
                <TD><Badge variant={specStatusVariant(o.spec_status)}>{titleCase(o.spec_status)}</Badge></TD>
                <TD right>{formatMoney(o.total_minor)}</TD>
                <TD className="whitespace-nowrap text-fg-secondary">{formatDateTime(o.closed_at ?? o.paid_at)}</TD>
                <TD right><Button size="sm" variant="secondary" onClick={() => retry.mutate(o.id)} loading={retry.isPending && retry.variables === o.id}><RotateCw className="h-4 w-4" /> Retry</Button></TD>
              </TR>
            )) : <EmptyRow colSpan={7}>Every completed order has moved stock. Nothing to retry.</EmptyRow>}
          </TBody>
        </Table>
      </Card>

      <h2 className="mb-2 text-base font-medium">Audits{bucket ? <span className="ml-2 text-sm font-normal text-fg-secondary">filtered to {healthBucketLabel(bucket)}</span> : null}</h2>
      <FilterBar>
        <Select className="w-auto" value={auditStatus} onChange={(e) => setBucket(e.target.value as DeductionHealthBucket | "")} aria-label="Status"><option value="">Any status</option>{AUDIT_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
        <Input type="date" className="w-auto" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Business day" />
        {day || bucket ? <Button variant="ghost" size="sm" onClick={() => { setDay(""); setBucket(""); }}>Clear</Button> : null}
      </FilterBar>
      {bucket === "never_ran" ? (
        <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-fg-secondary">Orders that never ran have no audit yet. They are the problem orders above; Retry or Run now writes one.</p>
      ) : list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Order</TH><TH>Day</TH><TH>Status</TH><TH right>Entries</TH><TH>Detail</TH><TH>Checked</TH><TH right>Action</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((a) => {
              const missing = a.detail?.missing ?? [];
              return (
                <TR key={a.id}>
                  <TD><button type="button" className="font-mono font-medium text-primary hover:underline" onClick={() => setCheckedId(a.order_id)}>{a.order_label}</button></TD>
                  <TD className="text-fg-secondary">{formatDate(a.business_day)}</TD>
                  <TD><Badge variant={auditStatusVariant(a.status)} title={HINTS[a.status]}>{titleCase(a.status)}</Badge></TD>
                  <TD right>{a.entries}</TD>
                  <TD className="text-sm text-fg-secondary">
                    {missing.length ? <span>No recipe: <span className="text-fg">{missing.join(", ")}</span></span> : a.detail?.error ? <span className="text-danger">{String(a.detail.error)}</span> : HINTS[a.status] ?? ""}
                    {missing.length ? <Link href="/admin/inventory/recipes" className="ml-2 text-xs text-primary hover:underline">Add recipes</Link> : null}
                  </TD>
                  <TD className="whitespace-nowrap text-fg-secondary">{formatDateTime(a.checked_at)}</TD>
                  <TD right>{a.status === "missing" || a.status === "partial" || a.status === "error" || a.status === "skipped" ? <Button size="sm" variant="ghost" onClick={() => retry.mutate(a.order_id)} loading={retry.isPending && retry.variables === a.order_id}><RotateCw className="h-4 w-4" /> Retry</Button> : null}</TD>
                </TR>
              );
            }) : <EmptyRow colSpan={7}>No audits match.</EmptyRow>}
          </TBody>
        </Table>
      )}
      {bucket !== "never_ran" ? <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} /> : null}

      <OrderCheckDialog orderId={checkedId} onClose={() => setCheckedId(null)} onRetry={(id) => retry.mutate(id)} retrying={retry.isPending} />
    </>
  );
}

function OrderCheckDialog({ orderId, onClose, onRetry, retrying }: { orderId: string | null; onClose: () => void; onRetry: (id: string) => void; retrying: boolean }) {
  const q = useQuery({ queryKey: ["deduction_health_order", orderId], queryFn: () => api<DeductionHealthOrder>(`/stock/deduction_health/${orderId}`), enabled: !!orderId });
  const d = q.data;
  const o = d?.order;
  const canRetry = o?.spec_status === "completed";
  return (
    <Dialog open={!!orderId} onClose={onClose} size="xl" title={o ? `Order ${o.label}` : "Checking order"} description={o ? `${formatDate(o.business_day)} · ${titleCase(o.order_type)} · ${formatMoney(o.total_minor)}` : undefined}
      footer={<>
        {o ? <Link href={`/admin/orders?q=${encodeURIComponent(o.label)}`}><Button variant="secondary">Open in Orders</Button></Link> : null}
        <Button onClick={() => o && onRetry(o.id)} loading={retrying} disabled={!canRetry} title={canRetry ? "Run the deduction again; it can never double-deduct" : "Only a completed order deducts stock"}><RotateCw className="h-4 w-4" /> Retry deduction</Button>
      </>}>
      {q.isLoading ? <Loading /> : q.isError ? <p className="py-6 text-center text-sm text-danger">{errorMessage(q.error)}</p> : d && o ? (
        <div className="space-y-5 pb-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={specStatusVariant(o.spec_status)}>{titleCase(o.spec_status)}</Badge>
            <Badge variant={d.stock_deducted_at ? "success" : "danger"}>{d.stock_deducted_at ? `Stock deducted ${formatDateTime(d.stock_deducted_at)}` : "Stock not deducted"}</Badge>
            <span className="text-fg-secondary">{o.item_count} items · completed {formatDateTime(o.closed_at ?? o.paid_at) || "-"}</span>
          </div>
          <section>
            <h3 className="mb-2 text-sm font-medium">Audits</h3>
            <Table>
              <THead><tr><TH>Status</TH><TH right>Entries</TH><TH>Detail</TH><TH>Checked</TH></tr></THead>
              <TBody>
                {d.audits.length ? d.audits.map((a) => (
                  <TR key={a.id}>
                    <TD><Badge variant={auditStatusVariant(a.status)}>{titleCase(a.status)}</Badge></TD>
                    <TD right>{a.entries}</TD>
                    <TD className="text-sm text-fg-secondary">{a.detail?.missing?.length ? `No recipe: ${a.detail.missing.join(", ")}` : a.detail?.error ? <span className="text-danger">{String(a.detail.error)}</span> : HINTS[a.status] ?? ""}</TD>
                    <TD className="whitespace-nowrap text-fg-secondary">{formatDateTime(a.checked_at)}</TD>
                  </TR>
                )) : <EmptyRow colSpan={4}>The deduction never ran for this order.</EmptyRow>}
              </TBody>
            </Table>
          </section>
          <section>
            <h3 className="mb-2 text-sm font-medium">Stock movements</h3>
            <Table>
              <THead><tr><TH>When</TH><TH>Kind</TH><TH>Item</TH><TH>Section</TH><TH right>Change</TH><TH right>Before → after</TH><TH right>Value</TH></tr></THead>
              <TBody>
                {d.movements.length ? d.movements.map((e) => (
                  <TR key={e.id}>
                    <TD className="whitespace-nowrap text-fg-secondary">{formatDateTime(e.occurred_at)}</TD>
                    <TD><Badge variant={ledgerKindVariant(e.kind)}>{titleCase(e.kind)}</Badge></TD>
                    <TD className="font-medium">{e.item_name}</TD>
                    <TD className="text-fg-secondary">{e.section_name ?? "-"}</TD>
                    <TD right className={Number(e.quantity) < 0 ? "text-danger" : "text-success"}>{formatSignedQty(e.quantity, e.unit_code)}</TD>
                    <TD right className="whitespace-nowrap text-fg-secondary">{formatSignedQty(e.before_qty, e.unit_code).replace(/^\+/, "")} → {formatSignedQty(e.after_qty, e.unit_code).replace(/^\+/, "")}</TD>
                    <TD right>{formatMoney(e.value_minor)}</TD>
                  </TR>
                )) : <EmptyRow colSpan={7}>No stock movement was written for this order.</EmptyRow>}
              </TBody>
            </Table>
          </section>
        </div>
      ) : null}
    </Dialog>
  );
}
