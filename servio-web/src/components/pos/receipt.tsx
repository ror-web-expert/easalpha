"use client";
import type { Receipt } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";

/** Receipt as printed on an 80 mm roll. Wrap in .print-area to print. */
export function ReceiptView({ r }: { r: Receipt }) {
  const c = r.business?.currency ?? "PKR";
  const m = (v: number | null | undefined) => formatMoney(v, c);
  const row = (l: string, v: string, bold = false) => (
    <div key={l + v} className={`flex justify-between gap-2 ${bold ? "font-bold" : ""}`}><span>{l}</span><span className="tabular">{v}</span></div>
  );
  return (
    <div className="mx-auto w-[72mm] bg-white p-2 font-mono text-[12px] leading-tight text-black">
      {r.duplicate ? <div className="mb-1 border-2 border-black py-1 text-center text-base font-bold">DUPLICATE</div> : null}
      <div className="text-center">
        <div className="text-base font-bold">{r.business?.name}</div>
        {r.branch?.name ? <div>{r.branch.name}</div> : null}
        {r.branch?.address ? <div>{r.branch.address}{r.branch.city ? `, ${r.branch.city}` : ""}</div> : null}
        {r.branch?.phone ? <div>{r.branch.phone}</div> : null}
        {r.branch?.tax_registration?.ntn ? <div>NTN {r.branch.tax_registration.ntn}</div> : null}
        {r.header ? <div className="mt-1 whitespace-pre-line">{r.header}</div> : null}
      </div>
      <div className="my-1 border-t border-dashed border-black" />
      <div className="flex justify-between"><span>Order {r.order?.label}</span><span>{titleCase(r.order?.order_type)}</span></div>
      {r.receipt_number ? <div>Receipt {r.receipt_number}</div> : null}
      <div>{formatDateTime(r.order?.paid_at ?? r.printed_at)}</div>
      {r.order?.table ? <div>Table {r.order.table}</div> : null}
      {r.order?.cashier ? <div>Cashier {r.order.cashier}</div> : null}
      {r.order?.customer ? <div>Customer {r.order.customer.name}{r.order.customer.phone ? ` ${r.order.customer.phone}` : ""}</div> : r.order?.guest_name ? <div>Guest {r.order.guest_name}</div> : null}
      <div className="my-1 border-t border-dashed border-black" />
      {r.lines?.map((l, i) => (
        <div key={i} className="mb-0.5">
          <div className="flex justify-between gap-2"><span>{l.quantity} x {l.name}</span><span className="tabular">{m(l.line_total_minor)}</span></div>
          {l.modifiers?.map((mo, j) => <div key={j} className="pl-3 text-[11px]">+ {mo.name}{mo.price_minor ? ` ${m(mo.price_minor)}` : ""}</div>)}
          {l.notes ? <div className="pl-3 text-[11px] italic">{l.notes}</div> : null}
        </div>
      ))}
      <div className="my-1 border-t border-dashed border-black" />
      {row("Subtotal", m(r.totals?.subtotal_minor))}
      {r.totals?.discount_minor ? row("Discount", `-${m(r.totals.discount_minor)}`) : null}
      {r.totals?.service_charge_minor ? row("Service charge", m(r.totals.service_charge_minor)) : null}
      {r.totals?.tax_lines?.map((t, i) => <div key={i} className="flex justify-between"><span>Tax {t.rate}%{t.inclusive ? " incl." : ""}</span><span className="tabular">{m(t.tax_minor)}</span></div>)}
      {r.totals?.delivery_charge_minor ? row("Delivery", m(r.totals.delivery_charge_minor)) : null}
      {r.totals?.rounding_minor ? row("Rounding", m(r.totals.rounding_minor)) : null}
      {r.totals?.tip_minor ? row("Tip", m(r.totals.tip_minor)) : null}
      {row("TOTAL", m(r.totals?.total_minor), true)}
      <div className="my-1 border-t border-dashed border-black" />
      {r.payments?.map((p, i) => (
        <div key={i}>
          {row(titleCase(p.method), m(p.amount_minor))}
          {p.tendered_minor ? row("  Tendered", m(p.tendered_minor)) : null}
          {p.change_minor ? row("  Change", m(p.change_minor)) : null}
          {p.reference ? <div className="text-[11px]">  Ref {p.reference}</div> : null}
        </div>
      ))}
      {r.totals?.due_minor ? row("Due", m(r.totals.due_minor), true) : null}
      {r.refunds?.map((rf, i) => <div key={i}>{row(`Refund ${rf.method}`, `-${m(rf.amount_minor)}`)}</div>)}
      {r.khata ? <div className="mt-1">Khata balance: {m(r.khata.balance_minor)}</div> : null}
      {r.tax_invoice?.number ? <div className="mt-1 text-center">{(r.tax_invoice.authority ?? "FBR").toUpperCase()} invoice {r.tax_invoice.number}</div> : r.tax_invoice?.status === "pending" ? <div className="mt-1 text-center">Tax invoice pending</div> : null}
      {r.tax_invoice?.qr ? <div className="mt-1 break-all text-center text-[9px]">{r.tax_invoice.qr}</div> : null}
      <div className="my-1 border-t border-dashed border-black" />
      {r.footer ? <div className="whitespace-pre-line text-center">{r.footer}</div> : null}
      {r.feedback_whatsapp ? <div className="text-center text-[11px]">WhatsApp {r.feedback_whatsapp}</div> : null}
    </div>
  );
}
