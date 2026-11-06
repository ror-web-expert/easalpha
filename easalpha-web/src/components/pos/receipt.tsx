/* eslint-disable @next/next/no-img-element -- receipt logo, barcode and QR codes are fixed-size print images, not page assets */
"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { Receipt } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { billRows } from "@/lib/bill";
import { itemCount, phoneLine, receiptTitle, registrationLines, savingsLine, taxRowLabel, unitPriceNote } from "@/lib/receipt-format";
import { loadSymbol, svgDataUrl, symbolSvg } from "@/components/admin/barcode-labels";

export type ReceiptBranding = { secondaryPhone?: string | null; footerQrUrl?: string | null; showLogo?: boolean; paper?: string | null; barcode?: boolean; policy?: string | null };

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

/** The receipt number as a Code 128 with the number under it (the same symbol the printer and the browser print). */
export function ReceiptBarcode({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadSymbol(value).then((sym) => { if (alive) setSrc(sym.kind === "bars" ? svgDataUrl(symbolSvg(sym)) : null); }).catch(() => { if (alive) setSrc(null); });
    return () => { alive = false; };
  }, [value]);
  return src ? <img src={src} alt={`Barcode ${value}`} className="mx-auto h-12 max-w-full" /> : <div className="text-center">{value}</div>;
}

/**
 * Receipt as shown on screen (receipt dialog, bill preview, order views), laid out as receipt printers lay it out the
 * world over. Printing goes through lib/print.ts, which sends the same content as fixed-width text lines (desktop app,
 * print server, or the browser's print dialog). `branding` carries the SPEC receipt-branding settings: logo, second
 * phone, footer QR, barcode, policy and paper width. No opacity here: a text-mode printer driver drops semi-transparent text.
 */
export function ReceiptView({ r, branding }: { r: Receipt; branding?: ReceiptBranding }) {
  const c = r.business?.currency ?? "PKR";
  const m = (v: number | null | undefined) => formatMoney(v, c);
  const narrow = String(branding?.paper ?? r.paper ?? "80") === "58";
  const footerQr = useQr(branding?.footerQrUrl, narrow ? 96 : 120);
  const taxQr = useQr(r.tax_invoice?.qr, narrow ? 96 : 120);
  const phones = phoneLine(r.branch?.phone ?? r.business?.phone ?? null, branding?.secondaryPhone);
  const due = r.totals?.due_minor ?? 0;
  const saved = savingsLine(r);
  const row = (l: string, v: string, opts: { bold?: boolean; big?: boolean; muted?: boolean } = {}) => (
    <div key={l + v} className={`flex justify-between gap-2 ${opts.bold ? "font-bold" : ""} ${opts.big ? "text-[1.4em]" : ""} ${opts.muted ? "text-[0.95em]" : ""}`}><span>{l}</span><span className="tabular whitespace-nowrap">{v}</span></div>
  );
  const Rule = ({ solid }: { solid?: boolean }) => <div className={`my-1.5 border-t ${solid ? "border-black" : "border-dashed border-black"}`} />;
  const showBarcode = branding?.barcode !== false && !!r.receipt_number;
  return (
    <div data-paper={narrow ? "58" : "80"} className={`receipt mx-auto bg-white font-mono leading-snug text-black ${narrow ? "w-[48mm] p-1 text-[11px]" : "w-[72mm] p-2 text-[12px]"}`}>
      {r.duplicate ? <div className="mb-2 border-2 border-black py-1 text-center text-base font-bold tracking-widest">DUPLICATE</div> : null}

      {/* Store block */}
      <div className="text-center">
        {branding?.showLogo !== false && r.business?.logo_key ? <img src={r.business.logo_key} alt="" className="mx-auto mb-1 max-h-14 max-w-[60%] object-contain" /> : null}
        <div className={`font-bold ${narrow ? "text-[15px]" : "text-[18px]"} leading-tight`}>{r.business?.name}</div>
        {r.business?.legal_name && r.business.legal_name !== r.business.name ? <div className="text-[0.9em]">{r.business.legal_name}</div> : null}
        {r.branch?.name ? <div>{r.branch.name}</div> : null}
        {r.branch?.address ? <div>{r.branch.address}{r.branch.city ? `, ${r.branch.city}` : ""}</div> : null}
        {phones ? <div>{phones}</div> : null}
        {r.business?.email ? <div>{r.business.email}</div> : null}
        {registrationLines(r.branch?.tax_registration).map((t) => <div key={t}>{t}</div>)}
        {r.header ? <div className="mt-1 whitespace-pre-line">{r.header}</div> : null}
      </div>
      <Rule solid />
      <div className="text-center font-bold tracking-wider">{receiptTitle(r)}</div>
      <Rule solid />

      {/* The order facts */}
      <div className="grid grid-cols-[auto_1fr] gap-x-3">
        {r.receipt_number ? <><span>Receipt</span><span className="text-right font-bold">{r.receipt_number}</span></> : null}
        <span>Order</span><span className="text-right">{r.order?.label}  {titleCase(r.order?.order_type)}</span>
        {r.order?.table ? <><span>Table</span><span className="text-right">{r.order.table}</span></> : null}
        <span>Date</span><span className="text-right">{formatDateTime(r.order?.paid_at ?? r.printed_at)}</span>
        {r.order?.cashier ? <><span>Cashier</span><span className="text-right">{r.order.cashier}</span></> : null}
        {r.order?.till ? <><span>Till</span><span className="text-right">{r.order.till}</span></> : null}
        {r.order?.customer ? <><span>Customer</span><span className="text-right">{r.order.customer.name}{r.order.customer.phone ? ` ${r.order.customer.phone}` : ""}</span></> : r.order?.guest_name ? <><span>Guest</span><span className="text-right">{r.order.guest_name}</span></> : null}
      </div>
      <Rule />

      {/* Items: QTY, ITEM, AMOUNT */}
      <div className="grid grid-cols-[2.2em_1fr_auto] gap-x-2 border-b border-black pb-0.5 text-[0.9em] font-bold"><span className="text-right">QTY</span><span>ITEM</span><span className="text-right">AMOUNT</span></div>
      {r.lines?.map((l, i) => (
        <div key={i} className="mt-1">
          <div className="grid grid-cols-[2.2em_1fr_auto] gap-x-2">
            <span className="tabular text-right">{formatQty(l.quantity)}</span>
            <span className="break-words">{l.name}</span>
            <span className="tabular whitespace-nowrap text-right">{m(l.line_subtotal_minor ?? l.line_total_minor)}</span>
          </div>
          {unitPriceNote(l, m) ? <div className="pl-[2.9em] text-[0.9em]">{unitPriceNote(l, m)}</div> : null}
          {l.modifiers?.map((mo, j) => <div key={j} className="flex justify-between pl-[2.9em] text-[0.9em]"><span>+ {mo.name}</span><span className="tabular">{mo.price_minor ? m(mo.price_minor) : ""}</span></div>)}
          {l.discount_minor ? <div className="flex justify-between pl-[2.9em] text-[0.9em]"><span>Discount</span><span className="tabular">-{m(l.discount_minor)}</span></div> : null}
          {l.notes ? <div className="pl-[2.9em] text-[0.9em] italic">&ldquo;{l.notes}&rdquo;</div> : null}
        </div>
      ))}
      <Rule />

      {/* The bill block (lib/bill.ts): the lines above add up to the Subtotal, and these rows add up to TOTAL. */}
      {row("Items", itemCount(r.lines))}
      {r.totals ? billRows({ ...r.totals, is_staff_meal: r.order?.is_staff_meal, delivery_label: "Delivery charge" }, c).map((b) => <div key={b.key}>{row(taxRowLabel(b.label, b.key, r.totals?.tax_lines, c), b.amount_minor < 0 ? `-${m(-b.amount_minor)}` : m(b.amount_minor), b.info ? { muted: true } : undefined)}</div>) : null}
      <div className="my-1 border-t border-black" />
      {row("TOTAL", m(r.totals?.total_minor), { bold: true, big: true })}
      {r.order?.is_staff_meal ? <div className="text-center font-bold">STAFF MEAL{r.order.staff_meal_reason ? ` - ${r.order.staff_meal_reason}` : ""}</div> : null}
      <Rule />

      {/* Payments */}
      {r.payments?.map((p, i) => (
        <div key={i}>
          {row(titleCase(p.method), m(p.amount_minor))}
          {p.method === "cash" && p.tendered_minor ? row("Cash tendered", m(p.tendered_minor), { muted: true }) : null}
          {p.method === "cash" && p.tendered_minor ? row("Change", m(p.change_minor ?? 0), { bold: true }) : null}
          {p.reference ? <div className="text-[0.9em]">Ref {p.reference}</div> : null}
        </div>
      ))}
      {r.refunds?.map((rf, i) => <div key={i}>{row(`Refund ${titleCase(rf.method)}`, `-${m(rf.amount_minor)}`)}</div>)}
      {due > 0 ? row("BALANCE DUE", m(due), { bold: true }) : r.payments?.length ? <div className="mt-1 text-center font-bold tracking-widest">PAID</div> : null}
      {saved ? <div className="text-center">{saved}</div> : null}
      {r.khata ? row("Account balance", m(r.khata.balance_minor)) : null}

      {/* Tax invoice */}
      {r.tax_invoice?.number || r.tax_invoice?.status === "pending" || taxQr ? <Rule /> : null}
      {r.tax_invoice?.number ? <div className="text-center">{(r.tax_invoice.authority ?? "FBR").toUpperCase()} invoice {r.tax_invoice.number}</div> : r.tax_invoice?.status === "pending" ? <div className="text-center">Tax invoice pending</div> : null}
      {taxQr ? <img src={taxQr} alt="Tax invoice QR" className="mx-auto mt-1" /> : null}

      {/* The receipt number as a barcode: a scan at the till opens the order for a reprint, refund or reopen */}
      {showBarcode ? <><Rule /><ReceiptBarcode value={r.receipt_number!} /></> : null}

      {/* Policy and footer */}
      <Rule />
      {branding?.policy ? <div className="whitespace-pre-line text-center text-[0.9em]">{branding.policy}</div> : null}
      {r.footer ? <div className="whitespace-pre-line text-center font-bold">{r.footer}</div> : null}
      {footerQr ? <div className="mt-1 text-center"><img src={footerQr} alt="QR code" className="mx-auto" /><div className="mt-0.5 text-[0.85em]">Scan for our menu and reviews</div></div> : null}
      {r.feedback_whatsapp ? <div className="mt-1 text-center text-[0.9em]">WhatsApp {r.feedback_whatsapp}</div> : null}
      <div className="mt-2 text-center text-[0.8em]">Powered by EasAlpha</div>
    </div>
  );
}
