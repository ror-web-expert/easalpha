import { afterEach, describe, expect, it, vi } from "vitest";
import { hasPrinter, paperWidth, printJob, printServer, receiptLines, row, zReportLines, type PrintLine, printServerHeaders } from "./print";
import type { Receipt, ZReport } from "./types";

const receipt: Receipt = {
  receipt_number: "R-0007", duplicate: false, printed_at: "2026-10-10T12:00:00Z",
  business: { name: "Karachi Grill", legal_name: null, phone: "021-1111111", logo_key: null, currency: "PKR" },
  branch: { name: "DHA", address: "12 Khayaban-e-Ittehad", city: "Karachi", phone: "0300-1234567", tax_registration: { ntn: "1234567-8" } },
  header: null, footer: "Thank you", language: "en", paper: "80",
  order: { id: "o1", serial: 42, label: "A-42", order_type: "dine_in", table: "T4", business_day: "2026-10-10", placed_at: null, paid_at: "2026-10-10T12:00:00Z", cashier: "Ali", customer: null, guest_name: null, notes: null },
  lines: [
    { name: "Chicken Biryani", quantity: "2", unit_price_minor: 50000, modifiers: [{ name: "Extra raita", price_minor: 5000 }], line_total_minor: 99000, discount_minor: 11000, notes: "less spicy" },
    { name: "Water", quantity: "1", unit_price_minor: 8000, modifiers: [], line_total_minor: 8000, discount_minor: 0, notes: null },
  ],
  totals: { subtotal_minor: 118000, discount_minor: 11000, service_charge_minor: 10700, tax_minor: 0, tax_lines: [], delivery_charge_minor: 0, rounding_minor: 0, tip_minor: 0, total_minor: 117700, paid_minor: 117700, due_minor: 0 },
  payments: [{ method: "cash", amount_minor: 117700, tendered_minor: 120000, change_minor: 2300, reference: null }],
  refunds: [], khata: null, tax_invoice: { number: null, qr: null, status: "not_registered" }, feedback_whatsapp: "0300-1234567",
};

const texts = (lines: PrintLine[]) => lines.filter((l): l is Extract<PrintLine, { text: string }> => "text" in l).map((l) => l.text);

describe("receiptLines", () => {
  it("starts with the store name, prints both phone numbers and ends with a cut", () => {
    const lines = receiptLines(receipt, { settings: { "store.secondary_phone": "021-2222222" } });
    expect(lines[0]).toEqual({ text: "Karachi Grill", align: "center", bold: true, size: 2 });
    const t = texts(lines);
    expect(t).toContain("0300-1234567");
    expect(t).toContain("021-2222222");
    expect(t).toContain("NTN 1234567-8");
    expect(t).toContain("Serial 42");
    expect(t).toContain("Receipt R-0007");
    expect(t).toContain("Table T4");
    expect(lines.at(-1)).toEqual({ cut: true });
    expect(lines.at(-2)).toEqual({ feed: 3 });
  });
  it("lists items with modifiers, line discounts and notes, then totals and the payment", () => {
    const t = texts(receiptLines(receipt));
    expect(t.find((x) => x.startsWith("2 x Chicken Biryani"))).toMatch(/Rs 990$/);
    expect(t.find((x) => x.startsWith("  + Extra raita"))).toMatch(/Rs 50$/);
    expect(t.find((x) => x.startsWith("  Discount"))).toMatch(/-Rs 110$/);
    expect(t).toContain("  less spicy");
    expect(t.find((x) => x.startsWith("Discount"))).toMatch(/-Rs 110$/);
    expect(t.find((x) => x.startsWith("Service charge"))).toMatch(/Rs 107$/);
    expect(t.find((x) => x.startsWith("TOTAL"))).toMatch(/Rs 1,177$/);
    expect(t.find((x) => /^Paid by Cash\s/.test(x))).toMatch(/Rs 1,177$/);
    expect(t.find((x) => x.startsWith("  Change"))).toMatch(/Rs 23$/);
    expect(t).toContain("Thank you");
  });
  it("adds the footer QR from settings and sizes rows for 58 mm paper", () => {
    const lines = receiptLines(receipt, { settings: { "pos.receipt.footer_qr_url": "https://g.page/r/abc/review", "pos.receipt.paper": "58" } });
    expect(lines).toContainEqual({ qr: "https://g.page/r/abc/review" });
    const total = texts(lines).find((x) => x.startsWith("TOTAL"))!;
    expect(total.length).toBe(32);
    const total80 = texts(receiptLines(receipt)).find((x) => x.startsWith("TOTAL"))!;
    expect(total80.length).toBe(48);
    expect(receiptLines(receipt)).not.toContainEqual(expect.objectContaining({ qr: expect.any(String) }));
  });
  it("marks duplicates", () => {
    expect(receiptLines({ ...receipt, duplicate: true })[0]).toEqual({ text: "DUPLICATE", align: "center", bold: true });
  });
  it("wraps a long item name and right-aligns its amount", () => {
    const out = row("A very long product name that will not fit on one line of the roll", "Rs 1,000", 32);
    expect(out.length).toBeGreaterThan(1);
    const t = texts(out);
    t.slice(0, -1).forEach((x) => expect(x.length).toBeLessThanOrEqual(32));
    expect(t.at(-1)).toBe("Rs 1,000".padStart(32));
  });
});

describe("zReportLines", () => {
  const z: ZReport = {
    shift_id: "s1", business_day: "2026-10-10", opened_at: "2026-10-10T08:00:00Z", closed_at: "2026-10-10T16:00:00Z", cashier: "Ali",
    orders: { total: 10, paid: 9, voided: 1, open: 0, staff_meals: 0 },
    sales: { gross_minor: 100000, discount_minor: 5000, service_charge_minor: 0, tax_minor: 0, rounding_minor: 0, tips_minor: 0, net_minor: 95000 },
    by_payment_method: { cash: 95000 }, by_order_type: { dine_in: 95000 },
    refunds: { count: 0, amount_minor: 0 }, voids: { count: 1, amount_minor: 2000 }, discounts: { count: 1, amount_minor: 5000 },
    cash: { opening_minor: 10000, cash_sales_minor: 95000, cash_in_minor: 0, cash_out_minor: 0, expected_minor: 105000, counted_minor: 104000, over_short_minor: -1000 },
    khata: { collected_minor: 0, on_account_minor: 0 }, movements: [],
  };
  it("prints the heading, sales, payment methods, drawer and the short amount", () => {
    const lines = zReportLines(z, { currency: "PKR" });
    expect(lines[0]).toEqual({ text: "Z REPORT", align: "center", bold: true, size: 2 });
    const t = texts(lines);
    expect(t.find((x) => x.startsWith("Net sales"))).toMatch(/Rs 950$/);
    expect(t.find((x) => x.startsWith("Cash "))).toMatch(/Rs 950$/);
    expect(t.find((x) => x.startsWith("Short"))).toMatch(/Rs 10$/);
    expect(lines.at(-1)).toEqual({ cut: true });
  });
});

describe("printServer", () => {
  it("is null without an IP and uses 9977 when the port is blank or the 9100 printer default", () => {
    expect(printServer(undefined)).toBeNull();
    expect(printServer({ "pos.print_server.ip": " " })).toBeNull();
    expect(printServer({ "pos.print_server.ip": "192.168.1.5" })).toEqual({ ip: "192.168.1.5", port: 9977 });
    expect(printServer({ "pos.print_server.ip": "192.168.1.5", "pos.print_server.port": 9100 })).toEqual({ ip: "192.168.1.5", port: 9977 });
    expect(printServer({ "pos.print_server.ip": "192.168.1.5", "pos.print_server.port": "9200" })).toEqual({ ip: "192.168.1.5", port: 9200 });
    expect(printServer({ "pos.print_server.ip": "192.168.1.5", "pos.print_server.token": " K7PQ2M9X " })).toEqual({ ip: "192.168.1.5", port: 9977, token: "K7PQ2M9X" });
    expect(printServerHeaders({ "pos.print_server.ip": "192.168.1.5", "pos.print_server.token": "K7PQ2M9X" })).toEqual({ "Content-Type": "application/json", Authorization: "Bearer K7PQ2M9X" });
    expect(printServerHeaders({ "pos.print_server.ip": "192.168.1.5" })).toEqual({ "Content-Type": "application/json" });
  });
  it("paperWidth is 32 for 58 mm and 48 otherwise", () => {
    expect(paperWidth("58")).toBe(32);
    expect(paperWidth(80)).toBe(48);
    expect(paperWidth(null)).toBe(48);
  });
});

describe("printJob dispatch", () => {
  const job = { role: "receipt" as const, lines: [{ text: "hi" }] };
  afterEach(() => { delete window.easalphaDesktop; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("uses the desktop app when it is present, even if a print server is configured", async () => {
    const print = vi.fn().mockResolvedValue({ ok: true });
    window.easalphaDesktop = { version: "1.0.0", print, listPrinters: vi.fn(), openPrinterSettings: vi.fn(), printServer: vi.fn() };
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const r = await printJob(job, { settings: { "pos.print_server.ip": "10.0.0.2" } });
    expect(r).toEqual({ ok: true, via: "desktop" });
    expect(print).toHaveBeenCalledWith(job);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(hasPrinter(undefined)).toBe(true);
  });
  it("reports a desktop failure without throwing", async () => {
    window.easalphaDesktop = { version: "1.0.0", print: vi.fn().mockResolvedValue({ ok: false, error: "Paper out" }), listPrinters: vi.fn(), openPrinterSettings: vi.fn(), printServer: vi.fn() };
    expect(await printJob(job)).toEqual({ ok: false, via: "desktop", error: "Paper out" });
  });
  it("posts the job to the print server when the till has an IP, on port 9977 for the 9100 default", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 }); vi.stubGlobal("fetch", fetchMock);
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    const settings = { "pos.print_server.ip": "192.168.1.5", "pos.print_server.port": 9100 };
    expect(hasPrinter(settings)).toBe(true);
    const r = await printJob(job, { settings });
    expect(r).toEqual({ ok: true, via: "server" });
    expect(fetchMock).toHaveBeenCalledWith("http://192.168.1.5:9977/print", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(job) });
    expect(printSpy).not.toHaveBeenCalled();
  });
  it("reports an unreachable print server", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const r = await printJob(job, { settings: { "pos.print_server.ip": "192.168.1.5" } });
    expect(r.ok).toBe(false);
    expect(r.via).toBe("server");
    expect(r.error).toMatch(/unreachable/);
  });
  it("falls back to the browser print dialog", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect(hasPrinter({})).toBe(false);
    expect(await printJob(job, { settings: {} })).toEqual({ ok: true, via: "browser" });
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
