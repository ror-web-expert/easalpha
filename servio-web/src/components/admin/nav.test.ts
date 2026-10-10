import { describe, expect, it } from "vitest";
import { NAV } from "./nav";

// The sidebar follows docs/SPEC.md: four standalone screens, then the 12 groups in SPEC order.
describe("SPEC sidebar", () => {
  it("has the four standalone screens first, flat, with Pending Orders right after Orders", () => {
    expect(NAV[0].flat).toBe(true);
    expect(NAV[0].items.map((i) => i.label)).toEqual(["Dashboard", "Orders", "Pending Orders", "Expenses", "Tables"]);
  });

  it("has the 12 SPEC groups in SPEC order", () => {
    expect(NAV.slice(1).map((g) => g.label)).toEqual([
      "Products", "Inventory", "Inventory Reports", "Purchasing", "Suppliers", "Customers", "Staff", "Finance", "Payroll", "Reports", "Riders", "Settings",
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

  it("uses the SPEC route roots", () => {
    const hrefs = NAV.flatMap((g) => g.items.map((i) => i.href.split("#")[0]));
    for (const h of hrefs) expect(h).toMatch(/^\/admin(\/(products|inventory|inventory-reports|purchasing|suppliers|customers|staff|finance|payroll|reports|riders|settings|orders|expenses|tables)(\/.*)?)?$/);
  });
});
