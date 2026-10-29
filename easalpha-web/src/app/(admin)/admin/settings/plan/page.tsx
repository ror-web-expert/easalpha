"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeDollarSign, CreditCard } from "lucide-react";
import { api } from "@/lib/api";
import type { Billing, BillingInvoice } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { Cards, PageHeader } from "@/components/admin/page";
import { useAction } from "@/components/admin/crud";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Dialog, EmptyRow, Field, Input, Loading, Select, SummaryCard, Table, TBody, TD, TH, THead, TR, type BadgeVariant } from "@/components/ui";
import { EXTRA_TILL_MINOR, billingCurrency, includedTills, planEstimate } from "@/lib/plan-price";

// SPEC Plan: the subscription tier (Business in the reviewed account), trial or subscription state, invoices, and
// how to pay. Choosing a plan issues an invoice; the owner reports the payment and EasAlpha confirms it.

function invoiceVariant(status: string): BadgeVariant {
  switch (status) {
    case "paid": case "confirmed": return "success";
    case "reported": return "info";
    case "overdue": return "danger";
    case "void": case "cancelled": return "neutral";
    default: return "warning";
  }
}
function subscriptionVariant(status: string | undefined): BadgeVariant {
  switch (status) {
    case "active": return "success";
    case "trialing": return "info";
    case "past_due": case "grace": return "warning";
    case "cancelled": case "suspended": case "expired": return "danger";
    default: return "neutral";
  }
}

export default function PlanPage() {
  const q = useQuery({ queryKey: ["billing"], queryFn: () => api<Billing>("/billing") });
  const [choose, setChoose] = useState<{ plan_code: string; cycle: "monthly" | "yearly"; tills: string } | null>(null);
  const [report, setReport] = useState<{ invoice: BillingInvoice; method: string; reference: string } | null>(null);
  const chooseM = useAction<{ plan_code: string; cycle: string; tills: number }>(["billing", "business"], (body) => api("/billing/choose_plan", { method: "POST", body: { ...body, period: body.cycle } }), "Plan chosen and invoice issued");
  const reportM = useAction<{ id: string; method: string; reference: string }>(["billing"], ({ id, ...body }) => api(`/billing/invoices/${id}/report_payment`, { method: "POST", body }), "Payment reported; EasAlpha will confirm it");
  if (q.isLoading || !q.data) return <Loading />;
  const b = q.data;
  const sub = b.subscription;
  const biz = b.business;
  // A cancelled or expired subscription row must not outrank the plan the business is actually on.
  const liveSub = sub && ["active", "trialing", "past_due"].includes(String(sub.status)) ? sub : null;
  const current = b.plans.find((p) => p.code === (liveSub?.plan_code ?? biz.plan?.code));
  const unpaid = b.invoices.filter((i) => ["unpaid", "pending", "overdue", "issued"].includes(i.status));
  const pi = b.payment_instructions;
  return (
    <>
      <PageHeader icon={BadgeDollarSign} title="Plan" description="Your subscription tier, what it allows, and the invoices behind it." actions={<Button onClick={() => setChoose({ plan_code: current?.code ?? b.plans[0]?.code ?? "", cycle: (sub?.billing_cycle as "monthly" | "yearly") ?? "monthly", tills: String(sub?.tills ?? 1) })}><CreditCard className="h-4 w-4" /> Choose plan</Button>} />
      <Cards>
        <SummaryCard label="Current plan" value={current?.name ?? biz.plan?.name ?? "None"} sub={sub ? `${titleCase(sub.billing_cycle)} · ${tillsLabel(current ? includedTills(current) : 1, sub.tills)}` : biz.status === "trial" ? "On trial" : ""} />
        <SummaryCard label="State" value={<Badge variant={subscriptionVariant(sub?.status ?? biz.status)} className="text-sm">{titleCase(sub?.status ?? biz.status)}</Badge>}
          sub={biz.trial_ends_on && (sub?.status === "trialing" || biz.status === "trial") ? `Trial ends ${formatDate(biz.trial_ends_on)} (${biz.trial_days_left} days left)` : sub?.current_period_end ? `Period ends ${formatDate(sub.current_period_end)}` : ""} tone="info" />
        <SummaryCard label="Open invoices" value={unpaid.length} sub={unpaid.length ? formatMoney(unpaid.reduce((a, i) => a + i.amount_minor, 0)) + " due" : "Nothing due"} tone={unpaid.length ? "warning" : "success"} />
        <SummaryCard label="Grace period" value={sub?.grace_ends_on ? formatDate(sub.grace_ends_on) : "-"} sub={sub?.grace_ends_on ? "Pay before this date to keep selling" : "Not in grace"} tone={sub?.grace_ends_on ? "danger" : "neutral"} />
      </Cards>
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Plans</CardTitle></CardHeader>
          <CardBody className="grid gap-3 sm:grid-cols-3">
            {b.plans.map((p) => (
              <div key={p.code} className={`rounded-md border p-3 ${p.code === current?.code ? "border-primary bg-primary-soft/40" : ""}`}>
                <div className="flex items-center justify-between"><span className="font-medium">{p.name}</span>{p.code === current?.code ? <Badge variant="primary">current</Badge> : null}</div>
                <div className="mt-1 text-2xl tabular">{formatMoney(p.price_pkr_minor)}<span className="text-xs text-fg-muted"> / month</span></div>
                <ul className="mt-2 space-y-0.5 text-xs text-fg-secondary">
                  {Object.entries(p.limits ?? {}).map(([k, v]) => <li key={k}>{titleCase(k)}: {v ?? "unlimited"}</li>)}
                </ul>
              </div>
            ))}
            {!b.plans.length ? <p className="text-sm text-fg-muted sm:col-span-3">No plans are published yet.</p> : null}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Usage</CardTitle></CardHeader>
          <CardBody className="space-y-2 text-sm">
            {Object.entries(b.usage ?? {}).map(([k, u]) => (
              <div key={k} className="flex items-center justify-between"><span className="text-fg-secondary">{titleCase(k)}</span><span className={`font-medium tabular ${u.limit != null && u.used >= u.limit ? "text-danger" : ""}`}>{u.used}{u.limit != null ? ` / ${u.limit}` : ""}</span></div>
            ))}
            {pi.provider === "paddle" ? <p className="pt-2 text-xs text-fg-muted">Card payments are handled by Paddle.</p> : (
              <div className="pt-2 text-xs text-fg-muted">
                <p className="font-medium text-fg">How to pay</p>
                {pi.jazzcash ? <p>JazzCash: <span className="font-mono">{pi.jazzcash}</span></p> : null}
                {pi.easypaisa ? <p>Easypaisa: <span className="font-mono">{pi.easypaisa}</span></p> : null}
                {pi.bank ? <p>Bank: <span className="font-mono">{pi.bank}</span></p> : null}
                {!pi.jazzcash && !pi.easypaisa && !pi.bank ? <p>Payment details are shared on the invoice.</p> : null}
                <p className="mt-1">After paying, report the payment on the invoice and EasAlpha confirms it.</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
      <Table>
        <THead><tr><TH>Invoice</TH><TH>Period</TH><TH>Issued</TH><TH>Due</TH><TH right>Amount</TH><TH>Status</TH><TH>Payment</TH><TH right></TH></tr></THead>
        <TBody>
          {b.invoices.length ? b.invoices.map((i) => (
            <TR key={i.id}>
              <TD className="font-mono text-sm">{i.number}</TD>
              <TD className="text-fg-secondary">{i.period_label ?? "-"}</TD>
              <TD className="text-fg-secondary">{formatDate(i.created_at)}</TD>
              <TD className="text-fg-secondary">{i.due_on ? formatDate(i.due_on) : "-"}</TD>
              <TD right className="font-medium">{formatMoney(i.amount_minor, i.currency)}</TD>
              <TD><Badge variant={invoiceVariant(i.status)}>{titleCase(i.status)}</Badge></TD>
              <TD className="text-xs text-fg-secondary">{i.payment_method ? `${titleCase(i.payment_method)} ${i.payment_reference ?? ""}` : "-"}{i.reported_at ? <span className="block">Reported {formatDateTime(i.reported_at)}</span> : null}{i.confirmed_at ? <span className="block text-success">Confirmed {formatDateTime(i.confirmed_at)}</span> : null}</TD>
              <TD right>{["unpaid", "pending", "overdue", "issued"].includes(i.status) ? <Button size="sm" variant="soft" onClick={() => setReport({ invoice: i, method: "jazzcash", reference: "" })}>Report payment</Button> : null}</TD>
            </TR>
          )) : <EmptyRow colSpan={8}>No invoices yet.</EmptyRow>}
        </TBody>
      </Table>
      <Dialog open={!!choose} onClose={() => setChoose(null)} title="Choose a plan" description="An invoice is issued for the first period. The plan changes once it is paid, or straight away during the trial." size="sm"
        footer={<><Button variant="secondary" onClick={() => setChoose(null)}>Cancel</Button><Button loading={chooseM.isPending} disabled={!choose?.plan_code} onClick={() => choose && chooseM.mutate({ plan_code: choose.plan_code, cycle: choose.cycle, tills: Math.max(1, Number(choose.tills) || 1) }, { onSuccess: () => setChoose(null) })}>Issue invoice</Button></>}>
        {choose ? (
          <div className="space-y-3">
            <Field label="Plan"><Select value={choose.plan_code} onChange={(e) => setChoose({ ...choose, plan_code: e.target.value })}>{b.plans.map((p) => <option key={p.code} value={p.code}>{p.name} - {formatMoney(p.price_pkr_minor)}/month</option>)}</Select></Field>
            <Field label="Billing cycle" hint="Yearly is ten months for the price of twelve"><Select value={choose.cycle} onChange={(e) => setChoose({ ...choose, cycle: e.target.value as "monthly" | "yearly" })}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></Select></Field>
            <Field label="Tills"><Input type="number" min={1} className="tabular" value={choose.tills} onChange={(e) => setChoose({ ...choose, tills: e.target.value })} /></Field>
            {(() => { const p = b.plans.find((x) => x.code === choose.plan_code); if (!p) return null; const inc = includedTills(p); const cur = billingCurrency(biz.country); return <p className="rounded-md bg-muted px-3 py-2 text-sm">Invoice for about <span className="font-medium">{formatMoney(planEstimate(p, choose.cycle, Math.max(1, Number(choose.tills) || 1), cur), cur)}</span> per {choose.cycle === "yearly" ? "year" : "month"}. {inc === null ? `${p.name} includes unlimited tills.` : `${p.name} includes ${inc} till${inc === 1 ? "" : "s"}; each extra till is ${formatMoney(EXTRA_TILL_MINOR[cur], cur)} a month.`} The exact amount is on the invoice.</p>; })()}
          </div>
        ) : null}
      </Dialog>
      <Dialog open={!!report} onClose={() => setReport(null)} title="Report a payment" description={report ? `Invoice ${report.invoice.number} for ${formatMoney(report.invoice.amount_minor, report.invoice.currency)}` : undefined} size="sm"
        footer={<><Button variant="secondary" onClick={() => setReport(null)}>Cancel</Button><Button loading={reportM.isPending} disabled={!report?.reference} onClick={() => report && reportM.mutate({ id: report.invoice.id, method: report.method, reference: report.reference }, { onSuccess: () => setReport(null) })}>Report</Button></>}>
        {report ? (
          <div className="space-y-3">
            <Field label="Paid by"><Select value={report.method} onChange={(e) => setReport({ ...report, method: e.target.value })}><option value="jazzcash">JazzCash</option><option value="easypaisa">Easypaisa</option><option value="bank">Bank transfer</option><option value="cash">Cash</option></Select></Field>
            <Field label="Transaction reference" hint="The id on your payment receipt"><Input value={report.reference} onChange={(e) => setReport({ ...report, reference: e.target.value })} autoFocus /></Field>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}

/** Tills on the current plan: what it includes, or the tills paid for when that is more; Business includes every till. */
function tillsLabel(included: number | null, paid: number): string {
  if (included === null) return "unlimited tills";
  const n = Math.max(included, paid);
  return `${n} till${n === 1 ? "" : "s"}`;
}
