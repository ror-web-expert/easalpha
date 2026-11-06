// Printing bridge for the till (SPEC "Kitchen display, printing and devices").
// Printers live on the desktop POS. The desktop app exposes window.easalphaDesktop; a browser or tablet till prints through the
// desktop's print server (its IP is the "pos.print_server.ip" setting); with neither, the same lines go to the browser's print
// dialog as fixed-width text in a private frame (printInBrowser). The browser cannot cut the paper or open the drawer.
import QRCode from "qrcode";
import type { BusinessSettings, Receipt, ZReport } from "@/lib/types";
import { toast } from "@/store/toast";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { settingValue } from "@/lib/pricing";
import { formatQty } from "@/components/pos/receipt";
import { billRows } from "./bill";
import { itemCount, phoneLine, receiptTitle, registrationLines, savingsLine, taxRowLabel, unitPriceNote } from "./receipt-format";
import { zCashRows } from "./z-report-rows";
import { loadSymbol, type CodeSymbol } from "@/components/admin/barcode-labels";

export type PrintLine =
  | { text: string; align?: "left" | "center" | "right"; bold?: boolean; size?: 1 | 2 }
  | { qr: string }
  /** Code 128 of the value with the value printed under it. `bars` ("1" a bar module, "0" a space) is filled in by
   *  withBarcodeBars for the paths that draw the bars themselves (the browser, the desktop's system driver). */
  | { barcode: string; bars?: string }
  | { feed: number }
  | { divider: true }
  | { cut: true }
  | { drawer: true };

export type PrintJob = { role: "receipt" | "kitchen" | "report"; printerId?: string; lines: PrintLine[]; copies?: number };

export type DesktopPrinter = { id: string; name: string; kind: "network" | "usb" | "system"; width: 58 | 80; role?: "receipt" | "kitchen" };

/** What the desktop POS app injects on window. The desktop build implements this; the web till only consumes it. */
export interface EasAlphaDesktop {
  version: string;
  listPrinters(): Promise<DesktopPrinter[]>;
  print(job: PrintJob): Promise<{ ok: boolean; error?: string }>;
  openPrinterSettings(): void;
  printServer(): Promise<{ host: string; port: number; running: boolean }>;
}

declare global {
  interface Window { easalphaDesktop?: EasAlphaDesktop }
}

export type PrintVia = "desktop" | "server" | "browser";
/** hint: set when the job went through the browser's print dialog, which cannot cut the paper (shown once per session). */
export interface PrintResult { ok: boolean; via: PrintVia; error?: string; hint?: string }

export const BROWSER_PRINT_HINT = "The browser's print dialog cannot cut the paper or open the drawer. For automatic cutting install the EasAlpha desktop app on this computer, or point this till at a print server under Settings, Printers.";

/** The desktop print server listens on 9977. The setting's default (9100) is a raw printer port, so it means "use the server's default". */
export const PRINT_SERVER_PORT = 9977;

export function desktopApp(): EasAlphaDesktop | undefined {
  return typeof window === "undefined" ? undefined : window.easalphaDesktop;
}

export function isDesktop(): boolean {
  return typeof desktopApp()?.print === "function";
}

/** The print server this device prints through, from the till settings; null when none is configured. */
export function printServer(settings: BusinessSettings | undefined | null): { ip: string; port: number; token?: string } | null {
  const ip = String(settingValue<string | null>(settings, "pos.print_server.ip", null) ?? "").trim();
  if (!ip) return null;
  const raw = Number(settingValue<number | string>(settings, "pos.print_server.port", PRINT_SERVER_PORT));
  const port = !Number.isFinite(raw) || raw <= 0 || raw === 9100 ? PRINT_SERVER_PORT : raw;
  const token = String(settingValue<string | null>(settings, "pos.print_server.token", null) ?? "").trim();
  return token ? { ip, port, token } : { ip, port };
}

/** Headers for a request to the print server: the install's token when the owner has entered it. */
export function printServerHeaders(settings: BusinessSettings | undefined | null): Record<string, string> {
  const token = printServer(settings)?.token;
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export function printServerUrl(settings: BusinessSettings | undefined | null): string | null {
  const ps = printServer(settings);
  return ps ? `http://${ps.ip}:${ps.port}/print` : null;
}

/** True when a job goes to a real printer (desktop app or print server) rather than the browser print dialog. */
export function hasPrinter(settings: BusinessSettings | undefined | null): boolean {
  return isDesktop() || !!printServer(settings);
}

/** Characters per line for the thermal paper width. */
export function paperWidth(paper: string | number | null | undefined): number {
  return String(paper ?? "80") === "58" ? 32 : 48;
}

/** SPEC "Receipt branding": logo, footer QR, both phone numbers and paper width come from the settings store. */
export function receiptSettings(settings: BusinessSettings | undefined | null, receipt?: Pick<Receipt, "paper"> | null) {
  const legacy = (settings?.receipt ?? {}) as { paper?: string; show_logo?: boolean };
  return {
    paper: String(settingValue<string | number>(settings, "pos.receipt.paper", receipt?.paper ?? legacy.paper ?? "80")),
    showLogo: settingValue<boolean>(settings, "pos.receipt.show_logo", legacy.show_logo ?? true) !== false,
    footerQrUrl: String(settingValue<string | null>(settings, "pos.receipt.footer_qr_url", null) ?? "").trim() || null,
    secondaryPhone: String(settingValue<string | null>(settings, "store.secondary_phone", null) ?? "").trim() || null,
    /** A Code 128 of the receipt number, so a scan at the till finds the order (on by default). */
    barcode: settingValue<boolean>(settings, "pos.receipt.barcode", true) !== false,
    /** Return or exchange policy printed above the footer. */
    policy: String(settingValue<string | null>(settings, "pos.receipt.policy", null) ?? "").trim() || null,
  };
}

// ---- Text layout helpers ----
function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of String(text ?? "").split(/\r?\n/)) {
    let cur = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (!cur) { cur = word; continue; }
      if (cur.length + 1 + word.length <= width) cur += ` ${word}`;
      else { out.push(cur); cur = word; }
    }
    out.push(cur);
  }
  return out.map((l) => (l.length > width ? l.slice(0, width) : l));
}

/** "left ......... right" padded to the width; a long left part goes on its own line(s) first. */
export function row(leftIn: string, rightIn: string, width: number, bold = false): PrintLine[] {
  // Numbers reach here too (a payment number from the API): text them first, so padStart never meets a number.
  const left = String(leftIn ?? ""), right = String(rightIn ?? "");
  const fit = width - right.length - 1;
  if (left.length <= fit) return [{ text: left + " ".repeat(Math.max(1, width - left.length - right.length)) + right, bold }];
  return [...wrap(left, width).map((text) => ({ text, bold })), { text: right.padStart(width), bold }];
}

const text = (t: string, extra: Partial<Extract<PrintLine, { text: string }>> = {}): PrintLine => ({ text: t, ...extra });
const center = (t: string, extra: Partial<Extract<PrintLine, { text: string }>> = {}): PrintLine => ({ text: t, align: "center", ...extra });

/** The store block at the top of every printout: name, legal name, branch, address, phones, email, registrations and the header. */
function storeBlock(r: Pick<Receipt, "business" | "branch"> & { header?: string | null }, width: number, secondaryPhone: string | null): PrintLine[] {
  const lines: PrintLine[] = [];
  const centred = (t: string | null | undefined, extra: Partial<Extract<PrintLine, { text: string }>> = {}) => { if (t) lines.push(...wrap(t, width).map((x) => center(x, extra))); };
  lines.push(center(r.business?.name ?? "", { bold: true, size: 2 }));
  if (r.business?.legal_name && r.business.legal_name !== r.business.name) centred(r.business.legal_name);
  if (r.branch?.name) centred(r.branch.name);
  if (r.branch?.address) centred(`${r.branch.address}${r.branch.city ? `, ${r.branch.city}` : ""}`);
  centred(phoneLine(r.branch?.phone ?? r.business?.phone ?? null, secondaryPhone));
  if (r.business?.email) centred(r.business.email);
  for (const reg of registrationLines(r.branch?.tax_registration)) centred(reg);
  centred(r.header);
  return lines;
}

// ---- Receipt ----
/**
 * The receipt as receipt printers lay it out the world over (and as the on-screen ReceiptView shows it): store block,
 * title, the order facts in two columns, QTY / ITEM / AMOUNT lines, the bill block to a double-size TOTAL, payments
 * and change, then the tax invoice, a barcode of the receipt number, the policy and the footer.
 */
export function receiptLines(r: Receipt, opts: { settings?: BusinessSettings | null; width?: number } = {}): PrintLine[] {
  const rs = receiptSettings(opts.settings, r);
  const width = opts.width ?? paperWidth(rs.paper);
  const c = r.business?.currency ?? "PKR";
  const m = (v: number | null | undefined) => formatMoney(v, c);
  const lines: PrintLine[] = [];
  const centred = (t: string | null | undefined, extra: Partial<Extract<PrintLine, { text: string }>> = {}) => { if (t) lines.push(...wrap(t, width).map((x) => center(x, extra))); };
  if (r.duplicate) lines.push(center("DUPLICATE", { bold: true }));
  lines.push(...storeBlock(r, width, rs.secondaryPhone), { divider: true });
  lines.push(center(receiptTitle(r), { bold: true }));
  lines.push({ divider: true });
  // The order facts: label left, value right
  if (r.receipt_number) lines.push(...row("Receipt", r.receipt_number, width, true));
  lines.push(...row("Order", `${r.order?.label ?? ""}  ${titleCase(r.order?.order_type)}`.trim(), width));
  if (r.order?.table) lines.push(...row("Table", r.order.table, width));
  lines.push(...row("Date", formatDateTime(r.order?.paid_at ?? r.printed_at), width));
  if (r.order?.cashier) lines.push(...row("Cashier", r.order.cashier, width));
  if (r.order?.till) lines.push(...row("Till", r.order.till, width));
  if (r.order?.customer) lines.push(...row("Customer", `${r.order.customer.name}${r.order.customer.phone ? ` ${r.order.customer.phone}` : ""}`, width));
  else if (r.order?.guest_name) lines.push(...row("Guest", r.order.guest_name, width));
  lines.push({ divider: true });
  // Items: QTY (3 columns, right-aligned), ITEM, AMOUNT
  lines.push(...row("QTY  ITEM", "AMOUNT", width, true));
  lines.push({ divider: true });
  const indent = "     ";
  for (const l of r.lines ?? []) {
    lines.push(...row(`${formatQty(l.quantity).padStart(3)}  ${l.name}`, m(l.line_subtotal_minor ?? l.line_total_minor), width));
    const note = unitPriceNote(l, m);
    if (note) lines.push(...wrap(note, width - indent.length).map((t) => text(`${indent}${t}`)));
    for (const mo of l.modifiers ?? []) lines.push(...row(`${indent}+ ${mo.name}`, mo.price_minor ? m(mo.price_minor) : "", width));
    if (l.discount_minor) lines.push(...row(`${indent}Discount`, `-${m(l.discount_minor)}`, width));
    if (l.notes) lines.push(...wrap(`"${l.notes}"`, width - indent.length).map((t) => text(`${indent}${t}`)));
  }
  lines.push({ divider: true });
  // The bill block (lib/bill.ts): the lines above add up to the Subtotal, these rows add up to TOTAL.
  const t = r.totals;
  lines.push(...row("Items", itemCount(r.lines), width));
  if (t) for (const b of billRows({ ...t, is_staff_meal: r.order?.is_staff_meal }, c)) lines.push(...row(taxRowLabel(b.label, b.key, t.tax_lines, c), b.amount_minor < 0 ? `-${m(-b.amount_minor)}` : m(b.amount_minor), width));
  lines.push({ divider: true });
  lines.push(...row("TOTAL", m(t?.total_minor), Math.floor(width / 2), true).map((x) => ({ ...x, size: 2 as const })));
  if (r.order?.is_staff_meal) centred(`STAFF MEAL${r.order.staff_meal_reason ? ` - ${r.order.staff_meal_reason}` : ""}`, { bold: true });
  lines.push({ divider: true });
  // Payments
  for (const p of r.payments ?? []) {
    lines.push(...row(titleCase(p.method), m(p.amount_minor), width));
    // Only a cash-kind method carries a tendered amount, whatever its code (Cash, cash on delivery).
    if (p.tendered_minor) lines.push(...row("  Cash tendered", m(p.tendered_minor), width), ...row("  Change", m(p.change_minor ?? 0), width, true));
    if (p.reference) lines.push(text(`  Ref ${p.reference}`));
  }
  if (t?.due_minor) lines.push(...row("BALANCE DUE", m(t.due_minor), width, true));
  else if (r.payments?.length) lines.push(center("PAID", { bold: true }));
  for (const rf of r.refunds ?? []) lines.push(...row(`Refund ${titleCase(rf.method)}`, `-${m(rf.amount_minor)}`, width));
  centred(savingsLine(r));
  if (r.khata) lines.push(...row("Account balance", m(r.khata.balance_minor), width));
  // Tax invoice
  if (r.tax_invoice?.number || r.tax_invoice?.status === "pending" || r.tax_invoice?.qr) lines.push({ divider: true });
  if (r.tax_invoice?.number) centred(`${(r.tax_invoice.authority ?? "FBR").toUpperCase()} invoice ${r.tax_invoice.number}`);
  else if (r.tax_invoice?.status === "pending") centred("Tax invoice pending");
  if (r.tax_invoice?.qr) lines.push({ qr: r.tax_invoice.qr });
  // The receipt number as a barcode: a scan at the till opens the order for a reprint, refund or reopen
  if (rs.barcode && r.receipt_number) lines.push({ divider: true }, { barcode: r.receipt_number });
  lines.push({ divider: true });
  centred(rs.policy);
  centred(r.footer, { bold: true });
  if (rs.footerQrUrl) lines.push({ qr: rs.footerQrUrl }, center("Scan for our menu and reviews"));
  if (r.feedback_whatsapp) centred(`WhatsApp ${r.feedback_whatsapp}`);
  lines.push(center("Powered by EasAlpha"));
  lines.push({ feed: 3 }, { cut: true });
  return lines;
}

// ---- Account payment receipt ----
/** Money received against a customer's account at the till (lib/customer-payments.ts builds it from the result and the stores). */
export interface AccountPaymentReceipt {
  business: Receipt["business"]; branch: Receipt["branch"]; header?: string | null;
  /** The server's payment number; null for a payment queued offline. */
  number: string | null;
  customer: { name: string; khata_no: string | null };
  amount_minor: number; method: string; reference: string | null;
  /** The account before and after, as the till knows them; null when it has no balance for this customer. */
  previous_balance_minor: number | null; new_balance_minor: number | null;
  received_at: string; cashier: string | null;
  /** Queued on the till: the receipt says so, since the account on the server has not moved yet. */
  offline?: boolean;
}

/**
 * The receipt for money received against an account (review, debit side, item 3): the store block, ACCOUNT PAYMENT,
 * who and when, the amount double-size, method and reference, the balance before and after, a thank you.
 */
export function paymentReceiptLines(p: AccountPaymentReceipt, opts: { settings?: BusinessSettings | null; width?: number } = {}): PrintLine[] {
  const rs = receiptSettings(opts.settings);
  const width = opts.width ?? paperWidth(rs.paper);
  const c = p.business?.currency ?? "PKR";
  const m = (v: number | null | undefined) => formatMoney(v, c);
  const balance = (v: number) => (v < 0 ? `${m(-v)} in credit` : m(v));
  const lines: PrintLine[] = [...storeBlock(p, width, rs.secondaryPhone), { divider: true }, center("ACCOUNT PAYMENT", { bold: true }), { divider: true }];
  if (p.number != null && p.number !== "") lines.push(...row("Receipt", String(p.number), width, true));
  lines.push(...row("Date", formatDateTime(p.received_at), width));
  if (p.cashier) lines.push(...row("Cashier", p.cashier, width));
  lines.push(...row("Customer", p.customer.name, width));
  if (p.customer.khata_no) lines.push(...row("Khata no.", p.customer.khata_no, width));
  lines.push({ divider: true });
  lines.push(...row("RECEIVED", m(p.amount_minor), Math.floor(width / 2), true).map((x) => ({ ...x, size: 2 as const })));
  lines.push(...row("Method", p.method, width));
  if (p.reference) lines.push(...row("Reference", p.reference, width));
  lines.push({ divider: true });
  if (p.previous_balance_minor !== null) lines.push(...row("Balance before", balance(p.previous_balance_minor), width));
  if (p.new_balance_minor !== null) lines.push(...row("Balance now", balance(p.new_balance_minor), width, true));
  if (p.offline) lines.push(...wrap("Recorded on the till; it reaches the account when the till is back online.", width).map((t) => center(t)));
  lines.push({ divider: true }, center("Thank you", { bold: true }), center("Powered by EasAlpha"), { feed: 3 }, { cut: true });
  return lines;
}

// ---- Z report ----
export function zReportLines(z: ZReport, opts: { currency?: string; settings?: BusinessSettings | null; width?: number } = {}): PrintLine[] {
  const width = opts.width ?? paperWidth(receiptSettings(opts.settings).paper);
  const m = (v: number | null | undefined) => formatMoney(v, opts.currency);
  const lines: PrintLine[] = [center("Z REPORT", { bold: true, size: 2 })];
  lines.push(...row("Cashier", z.cashier ?? "-", width), ...row("Day", z.business_day, width), ...row("Opened", formatDateTime(z.opened_at), width), ...row("Closed", formatDateTime(z.closed_at), width));
  lines.push({ divider: true }, text("SALES", { bold: true }));
  lines.push(...row("Gross", m(z.sales?.gross_minor), width), ...row("Discounts", `-${m(z.sales?.discount_minor)}`, width), ...row("Service charge", m(z.sales?.service_charge_minor), width),
    ...row("Tax", m(z.sales?.tax_minor), width), ...row("Rounding", m(z.sales?.rounding_minor), width), ...row("Tips", m(z.sales?.tips_minor), width), ...row("Net sales", m(z.sales?.net_minor), width, true));
  lines.push({ divider: true }, text("BY PAYMENT METHOD", { bold: true }));
  const pm = Object.entries(z.by_payment_method ?? {});
  if (pm.length) pm.forEach(([k, v]) => lines.push(...row(titleCase(k), m(v), width))); else lines.push(text("No payments"));
  lines.push({ divider: true }, text("BY ORDER TYPE", { bold: true }));
  Object.entries(z.by_order_type ?? {}).forEach(([k, v]) => lines.push(...row(titleCase(k), m(v), width)));
  lines.push({ divider: true }, text("ORDERS", { bold: true }));
  lines.push(...row("Paid", String(z.orders?.paid ?? 0), width), ...row("Voided", `${z.voids?.count ?? 0} / ${m(z.voids?.amount_minor)}`, width), ...row("Refunds", `${z.refunds?.count ?? 0} / ${m(z.refunds?.amount_minor)}`, width),
    ...row("Discounts", `${z.discounts?.count ?? 0} / ${m(z.discounts?.amount_minor)}`, width), ...row("Staff meals", String(z.orders?.staff_meals ?? 0), width), ...row("Still open", String(z.orders?.open ?? 0), width));
  lines.push({ divider: true }, text("CASH DRAWER", { bold: true }));
  // The same rows as the screen, every kind of money the drawer moved, so the slip adds up to Expected (QA B8).
  zCashRows(z.cash).forEach((r) => lines.push(...row(r.label, r.minor < 0 ? `-${m(-r.minor)}` : m(r.minor), width)));
  lines.push(...row("Expected", m(z.cash?.expected_minor), width, true));
  if (z.cash?.counted_minor != null) lines.push(...row("Counted", m(z.cash.counted_minor), width));
  const os = z.cash?.over_short_minor;
  if (os != null) lines.push(...row(os >= 0 ? "Over" : "Short", m(Math.abs(os)), width, true));
  lines.push({ divider: true }, text("KHATA", { bold: true }), ...row("Put on account", m(z.khata?.on_account_minor), width), ...row("Collected", m(z.khata?.collected_minor), width));
  if (z.movements?.length) {
    lines.push({ divider: true }, text("CASH MOVEMENTS", { bold: true }));
    z.movements.forEach((mv) => lines.push(...row(`${titleCase(mv.kind)}${mv.reason ? ` - ${mv.reason}` : ""}`, m(mv.amount_minor), width)));
  }
  lines.push({ feed: 3 }, { cut: true });
  return lines;
}

// ---- Browser fallback ----
export type TextRow = { text: string; bold?: boolean; size?: 1 | 2 } | { qr: string } | { barcode: string; bars?: string };

/**
 * The lines as fixed-width rows, exactly as a receipt printer lays them out: `width` columns, alignment by padding,
 * double-size text on half the columns, dividers as dashes, feeds as blank rows. A blank row is a single space so a
 * text-mode printer driver (which prints only text it is given) still moves down a line.
 */
export function textRows(lines: PrintLine[], width: number): TextRow[] {
  const out: TextRow[] = [];
  const pad = (t: string, align: "left" | "center" | "right" | undefined, cols: number) => {
    if (t.length >= cols) return t;
    const space = cols - t.length;
    if (align === "center") return " ".repeat(Math.floor(space / 2)) + t;
    if (align === "right") return " ".repeat(space) + t;
    return t;
  };
  for (const l of lines) {
    if ("text" in l) {
      const cols = l.size === 2 ? Math.floor(width / 2) : width;
      for (const para of String(l.text ?? "").split(/\r?\n/)) {
        if (!para.length) { out.push({ text: " " }); continue; }
        for (let i = 0; i < para.length; i += cols) out.push({ text: pad(para.slice(i, i + cols), l.align, cols), bold: l.bold, size: l.size });
      }
    } else if ("qr" in l) out.push({ qr: l.qr });
    else if ("barcode" in l) { if (l.barcode) out.push({ barcode: l.barcode, bars: l.bars }); }
    else if ("feed" in l) for (let i = 0; i < Math.min(l.feed, 10); i++) out.push({ text: " " });
    else if ("divider" in l) out.push({ text: "-".repeat(width) });
    // cut and drawer: nothing a browser can do
  }
  return out;
}

const escapeHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The bar modules of a linear symbol as one string, quiet zones included: "1" a bar, "0" a space. */
export function barsOf(symbol: CodeSymbol): string | null {
  if (symbol.kind !== "bars") return null;
  const p = symbol.pattern;
  return "0".repeat(p.quietLeft) + p.segments.map((seg) => seg.data).join("") + "0".repeat(p.quietRight);
}

/** The same lines with `bars` on every barcode line (Code 128 via jsbarcode), so a path that draws its own bars can. Unchanged lines are returned as they are. */
export async function withBarcodeBars(lines: PrintLine[]): Promise<PrintLine[]> {
  if (!lines.some((l) => "barcode" in l && l.barcode && !l.bars)) return lines;
  return Promise.all(lines.map(async (l) => {
    if (!("barcode" in l) || !l.barcode || l.bars) return l;
    try { const bars = barsOf(await loadSymbol(l.barcode)); return bars ? { ...l, bars } : l; } catch { return l; }
  }));
}

/** A Code 128 as an inline SVG, 0.33 mm a module (a 14-character receipt number is about 60 mm), 12 mm high. */
export function barcodeSvg(bars: string, heightMm = 12): string {
  const rects: string[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (bars[i] !== "1") continue;
    const start = i;
    while (bars[i + 1] === "1") i++;
    rects.push(`<rect x="${(start * 0.33).toFixed(2)}" y="0" width="${((i - start + 1) * 0.33).toFixed(2)}" height="${heightMm}"/>`);
  }
  const w = (bars.length * 0.33).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${heightMm}mm" viewBox="0 0 ${w} ${heightMm}" shape-rendering="crispEdges">${rects.join("")}</svg>`;
}

/**
 * A complete print document for the lines: a page as wide as the roll, one text run per row in a monospace font sized so
 * `width` columns fill the printable area (1.5 mm a character, the printer's own font A), no opacity, no layout to lose.
 * A text-mode Windows driver prints the rows as they are; a graphics driver prints them as shown.
 */
export async function printDocument(lines: PrintLine[], paper: string | number | null | undefined): Promise<string> {
  const width = paperWidth(paper);
  const narrow = width === 32;
  const rows = textRows(await withBarcodeBars(lines), width);
  const body: string[] = [];
  const pad = (t: string) => " ".repeat(Math.max(0, Math.floor((width - t.length) / 2))) + t;
  for (const r of rows) {
    if ("barcode" in r) {
      // The bars as a graphic for a graphics driver; the number under them as text for either kind of driver.
      if (r.bars) body.push(`<div class="bc">${barcodeSvg(r.bars)}</div>`);
      body.push(`<div class="l">${escapeHtml(pad(r.barcode))}</div>`);
      continue;
    }
    if ("qr" in r) {
      try { body.push(`<img src="${await QRCode.toDataURL(r.qr, { margin: 0, width: narrow ? 96 : 120, errorCorrectionLevel: "M" })}" alt="">`); }
      catch { body.push(`<div class="l">${escapeHtml(r.qr)}</div>`); }
      continue;
    }
    const cls = ["l", r.bold ? "b" : "", r.size === 2 ? "s2" : ""].filter(Boolean).join(" ");
    body.push(`<div class="${cls}">${escapeHtml(r.text)}</div>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>Print</title><style>
@page { size: ${narrow ? 58 : 80}mm auto; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { width: ${narrow ? 48 : 72}mm; padding: 2mm 0 0 ${narrow ? 2 : 3}mm; font-family: "Courier New", Consolas, "Liberation Mono", monospace; font-size: 9.5px; line-height: 1.25; }
.l { white-space: pre; }
.b { font-weight: 700; }
.s2 { font-size: 19px; }
img { display: block; margin: 2mm auto; }
.bc { text-align: center; padding: 1mm 0 0; }
.bc svg { display: inline-block; max-width: 100%; height: auto; }
</style></head><body>${body.join("")}</body></html>`;
}

let hinted = false;

/**
 * Prints the job through the browser's dialog from a private frame holding printDocument(), so the printout is the
 * printer's text layout rather than the page on screen (which a text-mode driver turned into glued words with the
 * labels missing: first client report, 30 Oct 2026). The frame is removed after printing.
 */
async function printInBrowser(job: PrintJob, settings: BusinessSettings | undefined | null): Promise<PrintResult> {
  if (typeof window === "undefined" || typeof document === "undefined" || typeof window.print !== "function") return { ok: false, via: "browser", error: "No printer available" };
  const result: PrintResult = { ok: true, via: "browser", hint: BROWSER_PRINT_HINT };
  if (!hinted) { hinted = true; toast.info("Printed through the browser", BROWSER_PRINT_HINT); }
  let frame: HTMLIFrameElement | null = null;
  try {
    const html = await printDocument(job.lines, receiptSettings(settings).paper);
    frame = document.createElement("iframe");
    frame.title = "Print";
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;overflow:hidden";
    document.body.appendChild(frame);
    const win = frame.contentWindow;
    const doc = frame.contentDocument ?? win?.document;
    if (!win || !doc) throw new Error("No print frame");
    doc.open(); doc.write(html); doc.close();
    await Promise.all(Array.from(doc.images).map((img) => (img.complete ? null : new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); }))));
    const done = () => { frame?.remove(); frame = null; };
    win.addEventListener("afterprint", done, { once: true });
    setTimeout(done, 120_000);
    win.focus();
    win.print();
    return result;
  } catch {
    frame?.remove();
    window.print();
    return result;
  }
}

// ---- Dispatch ----
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Send a job to (a) the desktop app, else (b) the print server from the till settings, else (c) the browser print dialog
 * with the same lines as fixed-width text (printInBrowser). Never throws: the result says which path was used and why it failed.
 */
export async function printJob(input: PrintJob, opts: { settings?: BusinessSettings | null } = {}): Promise<PrintResult> {
  const lines = await withBarcodeBars(input.lines);
  const job = lines === input.lines ? input : { ...input, lines };
  const desktop = desktopApp();
  if (typeof desktop?.print === "function") {
    try { const r = await desktop.print(job); return { ok: !!r?.ok, via: "desktop", error: r?.ok ? undefined : r?.error ?? "The desktop app could not print" }; }
    catch (e) { return { ok: false, via: "desktop", error: errText(e) }; }
  }
  const url = printServerUrl(opts.settings);
  if (url) {
    try {
      const res = await fetch(url, { method: "POST", headers: printServerHeaders(opts.settings), body: JSON.stringify(job) });
      return res.ok ? { ok: true, via: "server" } : { ok: false, via: "server", error: `Print server replied ${res.status}` };
    } catch (e) { return { ok: false, via: "server", error: `Print server unreachable: ${errText(e)}` }; }
  }
  return printInBrowser(job, opts.settings);
}
