/* eslint-disable @next/next/no-img-element -- receipt logo and QR codes are fixed-size print images, not page assets */
"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { Receipt } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";

export type ReceiptBranding = { secondaryPhone?: string | null; footerQrUrl?: string | null; showLogo?: boolean; paper?: string | null };

/** "2.0" prints as 2, "1.5" stays 1.5. */
export function formatQty(q: string | number | null | undefined): string {
  const n = Number(q ?? 0);
  if (!Number.isFinite(n)) return String(q ?? "");
  return Number.isInteger(n) ? String(n) : String(n).replace(/\.?0+$/, "");
}

function useQr(value: string | null | undefined, size: number) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!value) { setSrc(null); return; }
    QRCode.toDataURL(value, { margin: 0, width: size, errorCorrectionLevel: "M" }).then((d) => { if (alive) setSrc(d); }).catch(() => { if (alive) setSrc(null); });
    return () => { alive = false; };
  }, [value, size]);
  return src;
}

/**
 * Receipt as printed on a 58 or 80 mm roll. Wrap in .print-area to print. `branding` carries the SPEC receipt-branding
 * settings: logo, second phone, footer QR and paper width.
 */
export function ReceiptView({ r, branding }: { r: Receipt; branding?: ReceiptBranding }) {
  const c = r.business?.currency ?? "PKR";
  const m = (v: number | null | undefined) => formatMoney(v, c);
  const narrow = String(branding?.paper ?? r.paper ?? "80") === "58";
  const footerQr = useQr(branding?.footerQrUrl, narrow ? 96 : 120);
  const taxQr = useQr(r.tax_invoice?.qr, narrow ? 96 : 120);
  const primaryPhone = r.branch?.phone ?? r.business?.phone ?? null;
  const phones = [primaryPhone, branding?.secondaryPhone].filter((p, i, a) => p && a.indexOf(p) === i) as string[];
  const due = r.totals?.due_minor ?? 0;
  const cashPayments = (r.payments ?? []).filter((p) => p.method === "cash");
  const row = (l: string, v: string, opts: { bold?: boolean; big?: boolean; muted?: boolean } = {}) => (
    <div key={l + v} className={`flex justify-between gap-2 ${opts.bold ? "font-bold" : ""} ${opts.big ? "text-[1.2em]" : ""} ${opts.muted ? "opacity-80" : ""}`}><span>{l}</span><span className="tabular whitespace-nowrap">{v}</span></div>
  );
  const Rule = ({ solid }: { solid?: boolean }) => <div className={`my-1.5 border-t ${solid ? "border-black" : "border-dashed border-black"}`} />;
  return (
    <div data-paper={narrow ? "58" : "80"} className={`receipt mx-auto bg-white font-mono leading-snug text-black ${narrow ? "w-[48mm] p-1 text-[11px]" : "w-[72mm] p-2 text-[12px]"}`}>
      {r.duplicate ? <div className="mb-2 border-2 border-black py-1 text-center text-base font-bold tracking-widest">DUPLICATE</div> : null}

      {/* Store header */}
      <div className="text-center">
        {branding?.showLogo !== false && r.business?.logo_key ? <img src={r.business.logo_key} alt="" className="mx-auto mb-1 max-h-14 max-w-[60%] object-contain" /> : null}
        <div className={`font-bold ${narrow ? "text-[15px]" : "text-[18px]"} leading-tight`}>{r.business?.name}</div>
        {r.business?.legal_name && r.business.legal_name !== r.business.name ? <div className="text-[0.9em]">{r.business.legal_name}</div> : null}
        {r.branch?.name ? <div>{r.branch.name}</div> : null}
        {r.branch?.address ? <div>{r.branch.address}{r.branch.city ? `, ${r.branch.city}` : ""}</div> : null}
        {phones.length ? <div>{phones.join("  |  ")}</div> : null}
        {r.branch?.tax_registration?.ntn ? <div>NTN {r.branch.tax_registration.ntn}</div> : null}
        {r.header ? <div className="mt-1 whitespace-pre-line">{r.header}</div> : null}
      </div>
      <Rule solid />

      {/* Order block */}
      <div className="grid grid-cols-[auto_1fr] gap-x-3">
        {r.receipt_number ? <><span className="opacity-80">Receipt</span><span className="text-right font-bold">{r.receipt_number}</span></> : null}
        <span className="opacity-80">Order</span><span className="text-right">{r.order?.label}  {titleCase(r.order?.order_type)}{r.order?.table ? `  Table ${r.order.table}` : ""}</span>
        <span className="opacity-80">Date</span><span className="text-right">{formatDateTime(r.order?.paid_at ?? r.printed_at)}</span>
        {r.order?.customer ? <><span className="opacity-80">Customer</span><span className="text-right">{r.order.customer.name}{r.order.customer.phone ? ` ${r.order.customer.phone}` : ""}</span></> : r.order?.guest_name ? <><span className="opacity-80">Guest</span><span className="text-right">{r.order.guest_name}</span></> : null}
        {r.order?.cashier ? <><span className="opacity-80">Cashier</span><span className="text-right">{r.order.cashier}</span></> : null}
      </div>
      <Rule />

      {/* Items */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 border-b border-black pb-0.5 text-[0.9em] font-bold"><span>Item</span><span className="text-right">Qty x Price</span><span className="text-right">Amount</span></div>
      {r.lines?.map((l, i) => (
        <div key={i} className="mt-1">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-2">
            <span className="break-words">{l.name}</span>
            <span className="tabular whitespace-nowrap text-right opacity-80">{formatQty(l.quantity)} x {m(l.unit_price_minor)}</span>
            <span className="tabular whitespace-nowrap text-right">{m(l.line_total_minor)}</span>
          </div>
          {l.modifiers?.map((mo, j) => <div key={j} className="flex justify-between pl-3 text-[0.9em]"><span>+ {mo.name}</span><span className="tabular">{mo.price_minor ? m(mo.price_minor) : ""}</span></div>)}
          {l.discount_minor ? <div className="flex justify-between pl-3 text-[0.9em]"><span>Discount</span><span className="tabular">-{m(l.discount_minor)}</span></div> : null}
          {l.notes ? <div className="pl-3 text-[0.9em] italic">{l.notes}</div> : null}
        </div>
      ))}
      <Rule />

      {/* Totals */}
      {row("Subtotal", m(r.totals?.subtotal_minor))}
      {r.totals?.discount_minor ? row("Discount", `-${m(r.totals.discount_minor)}`) : null}
      {r.totals?.service_charge_minor ? row("Service charge", m(r.totals.service_charge_minor)) : null}
      {r.totals?.tax_lines?.map((t) => row(`Tax ${t.rate}%${t.inclusive ? " (incl.)" : ""}`, m(t.tax_minor)))}
      {r.totals?.delivery_charge_minor ? row("Delivery charge", m(r.totals.delivery_charge_minor)) : null}
      {r.totals?.rounding_minor ? row("Rounding", m(r.totals.rounding_minor)) : null}
      {r.totals?.tip_minor ? row("Tip", m(r.totals.tip_minor)) : null}
      <div className="my-1 border-t border-black" />
      {row("TOTAL", m(r.totals?.total_minor), { bold: true, big: true })}
      <Rule />

      {/* Payments */}
      {r.payments?.map((p, i) => (
        <div key={i}>
          {row(`Paid by ${titleCase(p.method)}`, m(p.amount_minor))}
          {p.method === "cash" && p.tendered_minor ? row("Cash tendered", m(p.tendered_minor), { muted: true }) : null}
          {p.method === "cash" && p.tendered_minor ? row("Change", m(p.change_minor ?? 0), { muted: true }) : null}
          {p.reference ? <div className="text-[0.9em] opacity-80">Ref {p.reference}</div> : null}
        </div>
      ))}
      {r.refunds?.map((rf, i) => <div key={i}>{row(`Refund ${titleCase(rf.method)}`, `-${m(rf.amount_minor)}`)}</div>)}
      {due > 0 ? row("BALANCE DUE", m(due), { bold: true }) : r.payments?.length || cashPayments.length ? <div className="mt-1 text-center font-bold tracking-widest">PAID</div> : null}
      {r.khata ? <div className="mt-1 text-center">Account balance: {m(r.khata.balance_minor)}</div> : null}

      {/* Tax invoice */}
      {r.tax_invoice?.number || r.tax_invoice?.status === "pending" || taxQr ? <Rule /> : null}
      {r.tax_invoice?.number ? <div className="text-center">{(r.tax_invoice.authority ?? "FBR").toUpperCase()} invoice {r.tax_invoice.number}</div> : r.tax_invoice?.status === "pending" ? <div className="text-center">Tax invoice pending</div> : null}
      {taxQr ? <img src={taxQr} alt="Tax invoice QR" className="mx-auto mt-1" /> : null}

      {/* Footer */}
      <Rule />
      {r.footer ? <div className="whitespace-pre-line text-center font-bold">{r.footer}</div> : null}
      {footerQr ? <div className="mt-1 text-center"><img src={footerQr} alt="QR code" className="mx-auto" /><div className="mt-0.5 text-[0.85em] opacity-80">Scan for our menu and reviews</div></div> : null}
      {r.feedback_whatsapp ? <div className="mt-1 text-center text-[0.9em]">WhatsApp {r.feedback_whatsapp}</div> : null}
      <div className="mt-2 text-center text-[0.8em] opacity-70">Powered by Servio</div>
    </div>
  );
}
