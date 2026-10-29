import { describe, expect, it } from "vitest";
import { NAV } from "./nav";

// The sidebar follows docs/SPEC.md: four standalone screens, then the 12 groups in SPEC order.
describe("SPEC sidebar", () => {
  it("has the four standalone screens first, flat, with Pending Orders right after Orders", () => {
    expect(NAV[0].flat).toBe(true);
    expect(NAV[0].items.map((i) => i.label)).toEqual(["Dashboard", "Orders", "Pending Orders", "Expenses", "Tables"]);
  });

  it("has the 12 SPEC groups in SPEC order, plus Canteen (29 Oct 2026) before Reports", () => {
    expect(NAV.slice(1).map((g) => g.label)).toEqual([
      "Products", "Inventory", "Inventory Reports", "Purchasing", "Suppliers", "Customers", "Staff", "Finance", "Payroll", "Canteen", "Reports", "Riders", "Settings",
    ]);
  });

  it("names every SPEC screen", () => {
    const labels = NAV.flatMap((g) => g.items.map((i) => i.label));
    for (const l of ["Menus", "Catalog", "Deals", "Promotions", "Quick Add Menu", "Stock in Hand", "Stock Actions", "Demand", "Items", "Recipes", "Order Inventory", "Units", "Inventory Settings",
      "Daily Stock Sheet", "Stock Ledger", "Consumption", "Waste & Adjustments", "Actual vs Theoretical", "Valuation & COGS", "AI Stock Forecast", "Deduction Health",
      "Purchase Orders", "Purchase Returns", "Purchase Price History", "Suppliers", "Supplier Ledger", "Supplier Insights", "Supplier Payments",
      "Customers", "Customer Ledger", "Customer Insights", "Customer Payments", "Customer Account", "AR Aging", "Cashiers", "User Sessions", "Order Takers", "Admin Staff",
      "Payment Accounts", "Combined Ledger", "Journal Voucher", "Chart of Accounts", "Fixed Assets", "Liabilities", "Equity", "Balance Sheet", "Trial Balance",
      "Overview", "Employees", "Advances", "Run Payroll", "Ledger", "Fingerprint", "Business Overview", "Grand Report", "Sales", "Sales Calendar", "Financial",
      "Products & Deals", "Category Report", "Cashier Till", "Operations", "Cancelled & Modified Orders", "Delivery Riders", "Vouchers", "Loyalty Points", "Regular Discounts", "AI Pricing",
      "Manage Riders", "Rider Vault", "Rider Reports", "Rider App", "Store", "Payment Methods", "Plan", "WhatsApp", "Website Config", "Notifications", "Reviews", "Audit Logs"]) {
      expect(labels, l).toContain(l);
    }
  });

  it("puts Branding right after Store in Settings", () => {
    const settings = NAV.find((g) => g.label === "Settings")!.items.map((i) => i.label);
    expect(settings.indexOf("Branding")).toBe(settings.indexOf("Store") + 1);
    expect(NAV.find((g) => g.label === "Settings")!.items.find((i) => i.label === "Branding")?.href).toBe("/admin/settings/branding");
  });

  it("ties customer-account and payroll screens to their modules, and keeps the plain customer list always on", () => {
    const all = NAV.flatMap((g) => g.items);
    const byLabel = (l: string, group?: string) => (group ? NAV.find((g) => g.label === group)!.items : all).find((i) => i.label === l)!;
    for (const l of ["Customer Ledger", "Monthly Bills", "Customer Payments", "Customer Account", "AR Aging"]) expect(byLabel(l, "Customers").module, l).toBe("customer_accounts");
    expect(byLabel("Customer Ledger", "Reports").module).toBe("customer_accounts"); // its API answers module.disabled too
    expect(byLabel("Customers", "Reports").module).toBeUndefined();
    for (const l of ["Overview", "Employees", "Advances", "Run Payroll", "Pay Wages", "Employee Statement", "Fingerprint"]) expect(byLabel(l, "Payroll").module, l).toBe("payroll");
    expect(byLabel("Customers", "Customers").module).toBeUndefined();
    expect(byLabel("Modules", "Settings").href).toBe("/admin/settings/modules");
    expect(byLabel("Barcode Labels", "Products").href).toBe("/admin/products/labels");
  });

  it("uses the SPEC route roots", () => {
    const hrefs = NAV.flatMap((g) => g.items.map((i) => i.href.split("#")[0]));
    for (const h of hrefs) expect(h).toMatch(/^\/admin(\/(products|inventory|inventory-reports|purchasing|suppliers|customers|staff|finance|payroll|canteen|reports|riders|settings|orders|expenses|tables)(\/.*)?)?$/);
  });
});

describe("settings sections (review 4.10)", () => {
  it("puts every settings screen in one of the six areas, each area listed once and in order", async () => {
    const { SETTINGS_SECTIONS } = await import("./nav");
    const settings = NAV.find((g) => g.label === "Settings")!;
    const screens = settings.items.filter((i) => i.href !== "/admin/settings");
    const keys = SETTINGS_SECTIONS.map((s) => s.key);
    expect(keys).toEqual(["Store", "Point of Sale", "Money", "Staff and Security", "Integrations", "Plan"]);
    expect(screens.every((i) => i.section && keys.includes(i.section))).toBe(true);
    // Contiguous runs: a section heading appears once in the sidebar.
    const runs = screens.map((i) => i.section).filter((s, n, a) => s !== a[n - 1]);
    expect(runs).toEqual(keys);
    expect(screens).toHaveLength(24);
  });
});
