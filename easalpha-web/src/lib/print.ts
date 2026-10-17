// Printing bridge for the till (SPEC "Kitchen display, printing and devices").
// Printers live on the desktop POS. The desktop app exposes window.easalphaDesktop; a browser or tablet till prints through the
// desktop's print server (its IP is the "pos.print_server.ip" setting); with neither, the browser print dialog is used.
import type { BusinessSettings, Receipt, ZReport } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { settingValue } from "@/lib/pricing";
import { formatQty } from "@/components/pos/receipt";
import { billRows } from "./bill";

export type PrintLine =
  | { text: string; align?: "left" | "center" | "right"; bold?: boolean; size?: 1 | 2 }
  | { qr: string }
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
export interface PrintResult { ok: boolean; via: PrintVia; error?: string }

/** The desktop print server listens on 9977. The setting's default (9100) is a raw printer port, so it means "use the server's default". */
export const PRINT_SERVER_PORT = 9977;

export function desktopApp(): EasAlphaDesktop | undefined {
  return typeof window === "undefined" ? undefined : window.easalphaDesktop;
}

export function isDesktop(): boolean {
  return typeof desktopApp()?.print === "function";
}

/** The print server this device prints through, from the till settings; null when none is configured. */
export function printServer(settings: BusinessSettings | undefined | null): { ip: string; port: number } | null {
  const ip = String(settingValue<string | null>(settings, "pos.print_server.ip", null) ?? "").trim();
  if (!ip) return null;
  const raw = Number(settingValue<number | string>(settings, "pos.print_server.port", PRINT_SERVER_PORT));
  const port = !Number.isFinite(raw) || raw <= 0 || raw === 9100 ? PRINT_SERVER_PORT : raw;
  return { ip, port };
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
export function row(left: string, right: string, width: number, bold = false): PrintLine[] {
  const fit = width - right.length - 1;
  if (left.length <= fit) return [{ text: left + " ".repeat(Math.max(1, width - left.length - right.length)) + right, bold }];
  return [...wrap(left, width).map((text) => ({ text, bold })), { text: right.padStart(width), bold }];
}

const text = (t: string, extra: Partial<Extract<PrintLine, { text: string }>> = {}): PrintLine => ({ text: t, ...extra });
const center = (t: string, extra: Partial<Extract<PrintLine, { text: string }>> = {}): PrintLine => ({ text: t, align: "center", ...extra });

// ---- Receipt ----
export function receiptLines(r: Receipt, opts: { settings?: BusinessSettings | null; width?: number } = {}): PrintLine[] {
  const rs = receiptSettings(opts.settings, r);
  const width = opts.width ?? paperWidth(rs.paper);
  const c = r.business?.currency ?? "PKR";
  const m = (v: number | null | undefined) => formatMoney(v, c);
  const lines: PrintLine[] = [];
  if (r.duplicate) lines.push(center("DUPLICATE", { bold: true }));
  lines.push(center(r.business?.name ?? "", { bold: true, size: 2 }));
  if (r.branch?.name) lines.push(center(r.branch.name));
  if (r.branch?.address) lines.push(...wrap(`${r.branch.address}${r.branch.city ? `, ${r.branch.city}` : ""}`, width).map((t) => center(t)));
  const primary = r.branch?.phone ?? r.business?.phone ?? null;
  if (primary) lines.push(center(primary));
  if (rs.secondaryPhone && rs.secondaryPhone !== primary) lines.push(center(rs.secondaryPhone));
  if (r.branch?.tax_registration?.ntn) lines.push(center(`NTN ${r.branch.tax_registration.ntn}`));
  if (r.header) lines.push(...wrap(r.header, width).map((t) => center(t)));
  lines.push({ divider: true });
  lines.push(...row(`Order ${r.order?.label ?? ""}`, titleCase(r.order?.order_type), width));
  if (r.order?.serial != null) lines.push(text(`Serial ${r.order.serial}`));
  if (r.receipt_number) lines.push(text(`Receipt ${r.receipt_number}`));
  lines.push(text(formatDateTime(r.order?.paid_at ?? r.printed_at)));
  if (r.order?.table) lines.push(text(`Table ${r.order.table}`));
  if (r.order?.cashier) lines.push(text(`Cashier ${r.order.cashier}`));
  if (r.order?.customer) lines.push(...wrap(`Customer ${r.order.customer.name}${r.order.customer.phone ? ` ${r.order.customer.phone}` : ""}`, width).map((t) => text(t)));
  else if (r.order?.guest_name) lines.push(text(`Guest ${r.order.guest_name}`));
  lines.push({ divider: true });
  for (const l of r.lines ?? []) {
    const qty = Number(l.quantity ?? 1);
    lines.push(...row(`${formatQty(l.quantity)} x ${l.name}`, m(l.line_subtotal_minor ?? l.line_total_minor), width));
    if (qty !== 1 && l.unit_price_minor) lines.push(text(`  @ ${m(l.unit_price_minor)} each`));
    for (const mo of l.modifiers ?? []) lines.push(...row(`  + ${mo.name}`, mo.price_minor ? m(mo.price_minor) : "", width));
    if (l.discount_minor) lines.push(...row("  Discount", `-${m(l.discount_minor)}`, width));
    if (l.notes) lines.push(...wrap(l.notes, width - 2).map((t) => text(`  ${t}`)));
  }
  lines.push({ divider: true });
  const t = r.totals;
  // The shared bill block (lib/bill.ts): the lines add up to the Subtotal and these rows add up to TOTAL.
  if (t) for (const b of billRows(t, r.business?.currency)) lines.push(...row(b.label, b.amount_minor < 0 ? `-${m(-b.amount_minor)}` : m(b.amount_minor), width));
  lines.push(...row("TOTAL", m(t?.total_minor), width, true));
  lines.push({ divider: true });
  for (const p of r.payments ?? []) {
    lines.push(...row(`Paid by ${titleCase(p.method)}`, m(p.amount_minor), width));
    if (p.method === "cash" && p.tendered_minor) lines.push(...row("  Cash tendered", m(p.tendered_minor), width), ...row("  Change", m(p.change_minor ?? 0), width));
    if (p.reference) lines.push(text(`  Ref ${p.reference}`));
  }
  if (t?.due_minor) lines.push(...row("BALANCE DUE", m(t.due_minor), width, true));
  else if (r.payments?.length) lines.push(center("PAID", { bold: true }));
  for (const rf of r.refunds ?? []) lines.push(...row(`Refund ${rf.method}`, `-${m(rf.amount_minor)}`, width));
  if (r.khata) lines.push(text(`Khata balance: ${m(r.khata.balance_minor)}`));
  if (r.tax_invoice?.number) lines.push(center(`${(r.tax_invoice.authority ?? "FBR").toUpperCase()} invoice ${r.tax_invoice.number}`));
  else if (r.tax_invoice?.status === "pending") lines.push(center("Tax invoice pending"));
  if (r.tax_invoice?.qr) lines.push({ qr: r.tax_invoice.qr });
  lines.push({ divider: true });
  if (r.footer) lines.push(...wrap(r.footer, width).map((x) => center(x)));
  if (rs.footerQrUrl) lines.push({ qr: rs.footerQrUrl });
  if (r.feedback_whatsapp) lines.push(center(`WhatsApp ${r.feedback_whatsapp}`));
  lines.push(center("Powered by EasAlpha"));
  lines.push({ feed: 3 }, { cut: true });
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
  lines.push(...row("Opening", m(z.cash?.opening_minor), width), ...row("Cash sales", m(z.cash?.cash_sales_minor), width), ...row("Cash in", m(z.cash?.cash_in_minor), width), ...row("Cash out", `-${m(z.cash?.cash_out_minor)}`, width), ...row("Expected", m(z.cash?.expected_minor), width));
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

// ---- Dispatch ----
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Send a job to (a) the desktop app, else (b) the print server from the till settings, else (c) the browser print dialog.
 * Never throws: the result says which path was used and why it failed.
 */
export async function printJob(job: PrintJob, opts: { settings?: BusinessSettings | null } = {}): Promise<PrintResult> {
  const desktop = desktopApp();
  if (typeof desktop?.print === "function") {
    try { const r = await desktop.print(job); return { ok: !!r?.ok, via: "desktop", error: r?.ok ? undefined : r?.error ?? "The desktop app could not print" }; }
    catch (e) { return { ok: false, via: "desktop", error: errText(e) }; }
  }
  const url = printServerUrl(opts.settings);
  if (url) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(job) });
      return res.ok ? { ok: true, via: "server" } : { ok: false, via: "server", error: `Print server replied ${res.status}` };
    } catch (e) { return { ok: false, via: "server", error: `Print server unreachable: ${errText(e)}` }; }
  }
  if (typeof window !== "undefined" && typeof window.print === "function") { window.print(); return { ok: true, via: "browser" }; }
  return { ok: false, via: "browser", error: "No printer available" };
}
