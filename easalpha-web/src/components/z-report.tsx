"use client";
import type { ZReport } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { Stat } from "@/components/ui";

export function ZReportView({ z, currency, hideExpected }: { z: ZReport; currency?: string; hideExpected?: boolean }) {
  const m = (v: number | null | undefined) => formatMoney(v, currency);
  const os = z.cash?.over_short_minor;
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-x-6 text-xs text-fg-secondary">
        <div>Cashier <b className="text-fg">{z.cashier ?? "-"}</b></div>
        <div>Day <b className="text-fg">{z.business_day}</b></div>
        <div>Opened <b className="text-fg">{formatDateTime(z.opened_at)}</b></div>
        <div>Closed <b className="text-fg">{formatDateTime(z.closed_at)}</b></div>
      </div>
      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-secondary">Sales</h4>
        <Stat label="Gross" value={m(z.sales?.gross_minor)} />
        <Stat label="Discounts" value={`-${m(z.sales?.discount_minor)}`} tone="danger" />
        <Stat label="Service charge" value={m(z.sales?.service_charge_minor)} />
        <Stat label="Tax" value={m(z.sales?.tax_minor)} />
        <Stat label="Rounding" value={m(z.sales?.rounding_minor)} />
        <Stat label="Tips" value={m(z.sales?.tips_minor)} />
        <Stat label="Net sales" value={<b>{m(z.sales?.net_minor)}</b>} />
      </section>
      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-secondary">By payment method</h4>
        {Object.entries(z.by_payment_method ?? {}).map(([k, v]) => <Stat key={k} label={titleCase(k)} value={m(v)} />)}
        {!Object.keys(z.by_payment_method ?? {}).length ? <p className="text-xs text-fg-muted">No payments</p> : null}
      </section>
      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-secondary">By order type</h4>
        {Object.entries(z.by_order_type ?? {}).map(([k, v]) => <Stat key={k} label={titleCase(k)} value={m(v)} />)}
      </section>
      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-secondary">Orders</h4>
        <Stat label="Paid" value={z.orders?.paid ?? 0} />
        <Stat label="Voided" value={`${z.voids?.count ?? 0} · ${m(z.voids?.amount_minor)}`} tone="danger" />
        <Stat label="Refunds" value={`${z.refunds?.count ?? 0} · ${m(z.refunds?.amount_minor)}`} tone="danger" />
        <Stat label="Discounts" value={`${z.discounts?.count ?? 0} · ${m(z.discounts?.amount_minor)}`} />
        <Stat label="Staff meals" value={z.orders?.staff_meals ?? 0} />
        <Stat label="Still open" value={z.orders?.open ?? 0} />
      </section>
      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-secondary">Cash drawer</h4>
        <Stat label="Opening" value={m(z.cash?.opening_minor)} />
        <Stat label="Cash sales" value={m(z.cash?.cash_sales_minor)} tone="success" />
        <Stat label="Cash in" value={m(z.cash?.cash_in_minor)} tone="success" />
        <Stat label="Cash out" value={`-${m(z.cash?.cash_out_minor)}`} tone="danger" />
        {!hideExpected ? <Stat label="Expected" value={m(z.cash?.expected_minor)} /> : null}
        {z.cash?.counted_minor !== null && z.cash?.counted_minor !== undefined ? <Stat label="Counted" value={m(z.cash.counted_minor)} /> : null}
        {!hideExpected && os !== null && os !== undefined ? <Stat label={os >= 0 ? "Over" : "Short"} value={m(Math.abs(os))} tone={os >= 0 ? "success" : "danger"} /> : null}
      </section>
      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-secondary">Khata</h4>
        <Stat label="Put on account" value={m(z.khata?.on_account_minor)} />
        <Stat label="Collected" value={m(z.khata?.collected_minor)} tone="success" />
      </section>
      {z.movements?.length ? (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-secondary">Cash movements</h4>
          {z.movements.map((mv, i) => <Stat key={i} label={`${titleCase(mv.kind)}${mv.reason ? ` · ${mv.reason}` : ""}`} value={m(mv.amount_minor)} tone={mv.amount_minor >= 0 ? "success" : "danger"} />)}
        </section>
      ) : null}
    </div>
  );
}
