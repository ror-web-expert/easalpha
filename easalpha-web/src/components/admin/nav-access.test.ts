import { describe, expect, it } from "vitest";
import { NAV, isNavActive, navAllows, navItemFor, pageAllows, type NavItem } from "./nav";

// QA of 6 Nov 2026, P5 (and review R5 before it): the sidebar must never offer a page whose calls the API refuses that
// role, and a page reached by URL must show the no-access state instead of drawing itself around 403s. What the API
// asks of each page's calls, read on 6 Nov 2026 from a member holding nothing but app.admin (every GET the page makes,
// its 403 naming the codes): one code of every group.
const R = ["reports.view_all", "reports.view_branch", "reports.view_own"];
const STOCK_READ = ["stock.view", "stock.actions", "stock.count", "reports.view_all"];
const SECTIONS = ["stock.view", "stock.actions", "stock.waste", "stock.count"];
const RIDERS = ["RIDERS", "RIDER_VIEW", "DUMMY_RIDER_VIEW", "orders.create", "reports.view_all"];
const CUSTOMERS = ["customers.view", "customers.manage", "orders.create"];
const BOOKS_READ = ["customers.view", "customers.manage", "khata.collect", "CUSTOMER_ACCOUNT", "reports.view_all", "finance.view"];
const PURCH = ["purchasing.manage", "suppliers.manage", "stock.view", "finance.view", "reports.view_all"];
const SUPPLIERS = ["SUPPLIERS", "PURCHASE_ORDERS", "stock.view", "finance.view"];
const SUPPLIER_BOOKS = ["SUPPLIER_LEDGER", "SUPPLIER_VIEW_LEDGER", "SUPPLIER_RECORD_PAYMENT", "finance.view"];
const API_NEEDS: Record<string, string[][]> = {
  "/admin/orders": [["orders.create", ...R, "kitchen.view"], ["orders.create", "reports.view_all", "reports.view_branch"], RIDERS],
  "/admin/orders/pending": [["orders.create", "reports.view_all", "reports.view_branch", "ORDERS"], RIDERS],
  "/admin/expenses": [["expenses.manage", "EXPENSES", "finance.view", "reports.view_all"]],
  "/admin/tables": [["orders.create", "tables.manage", "kitchen.view"]],
  "/admin/products/menus": [["menu.view", "menu.edit"]],
  "/admin/products/catalog": [["menu.view", "menu.edit"]],
  "/admin/products/deals": [["menu.view", "menu.edit"]],
  "/admin/products/promotions": [["menu.view", "menu.edit", "orders.create"]],
  "/admin/products/quick-add": [["menu.view", "menu.edit"], ["menu.view", "menu.edit", "orders.create"]],
  "/admin/products/labels": [["menu.view", "menu.edit"]],
  "/admin/products/categories": [["menu.view", "menu.edit"]],
  "/admin/products/modifier-groups": [["menu.view", "menu.edit"]],
  "/admin/products/tax-rates": [], // GET /tax_rates answers everyone; the account picker loads only with its codes
  "/admin/products/stations": [],
  "/admin/inventory/stock-in-hand": [STOCK_READ, SECTIONS],
  "/admin/inventory/stock-actions": [SECTIONS],
  "/admin/inventory/demand": [STOCK_READ, PURCH, SECTIONS, [...SECTIONS, "menu.edit"]],
  "/admin/inventory/items": [[...SECTIONS, "menu.edit"], SECTIONS],
  "/admin/inventory/recipes": [["stock.view", "stock.actions", "menu.edit", "menu.view"]],
  "/admin/inventory/order-inventory": [["stock.view", "stock.actions", "settings.manage"]],
  "/admin/inventory/units": [["stock.actions", "settings.manage"], [...SECTIONS, "menu.edit"]],
  "/admin/inventory/settings": [["stock.view", "stock.actions", "stock.count", "settings.manage"], SECTIONS],
  "/admin/inventory/sections": [STOCK_READ, SECTIONS],
  "/admin/inventory/food-cost": [["stock.view", "stock.actions", "menu.edit", "menu.view"]],
  "/admin/inventory/production": [["stock.view", "stock.actions"], SECTIONS],
  "/admin/inventory-reports/daily-stock-sheet": [STOCK_READ, SECTIONS],
  "/admin/inventory-reports/stock-ledger": [STOCK_READ, SECTIONS],
  "/admin/inventory-reports/consumption": [STOCK_READ],
  "/admin/inventory-reports/waste-adjustments": [STOCK_READ],
  "/admin/inventory-reports/actual-vs-theoretical": [STOCK_READ, SECTIONS],
  "/admin/inventory-reports/valuation-cogs": [STOCK_READ],
  "/admin/inventory-reports/ai-stock-forecast": [R],
  "/admin/inventory-reports/deduction-health": [STOCK_READ],
  "/admin/purchasing/purchase-orders": [["PURCHASE_ORDERS", "stock.view"]],
  "/admin/purchasing/purchase-returns": [["PURCHASE_ORDERS", "PO_RETURN", "stock.view"]],
  "/admin/purchasing/price-history": [["PURCHASE_ORDERS", "purchasing.manage", "finance.view", "reports.view_all"]],
  "/admin/purchasing/goods-received": [["purchasing.manage", "stock.view", "stock.actions"]],
  "/admin/purchasing/payables-aging": [PURCH],
  "/admin/purchasing/purchases-report": [PURCH],
  "/admin/suppliers": [PURCH, SUPPLIERS],
  "/admin/suppliers/ledger": [SUPPLIERS, SUPPLIER_BOOKS],
  "/admin/suppliers/insights": [SUPPLIERS],
  "/admin/suppliers/payments": [SUPPLIER_BOOKS, SUPPLIERS],
  "/admin/customers": [CUSTOMERS, BOOKS_READ], // the status counts (customers.manage) load only with it
  "/admin/customers/ledger": [CUSTOMERS, BOOKS_READ],
  "/admin/customers/bills": [CUSTOMERS, BOOKS_READ],
  "/admin/customers/insights": [["customers.manage"]],
  "/admin/customers/payments": [["khata.collect", "customers.manage"], CUSTOMERS],
  "/admin/customers/account": [CUSTOMERS, BOOKS_READ],
  "/admin/customers/ar-aging": [["customers.view", "customers.manage", "khata.collect", "reports.view_all", "finance.view"]],
  "/admin/customers/campaigns": [["MARKETING", "MARKETING_CAMPAIGN", "MARKETING_CAMPAIGN_LOG", "settings.manage"]],
  "/admin/customers/reservations": [["orders.create", "tables.manage", "customers.manage"], ["orders.create", "tables.manage", "kitchen.view"]],
  "/admin/orders/qr": [["orders.create", "kitchen.view"]],
  "/admin/staff/cashiers": [],
  "/admin/staff/sessions": [["staff.manage"]],
  "/admin/staff/order-takers": [],
  "/admin/staff/admin-staff": [],
  "/admin/staff/roles": [],
  "/admin/staff/commissions": [["staff.manage", "settings.manage", "reports.view_all"]],
  "/admin/finance/dashboard": [["finance.view", "reports.view_all"]],
  "/admin/finance/payment-accounts": [["finance.view", "settings.manage", "shifts.any"]],
  "/admin/finance/combined-ledger": [["finance.view", "settings.manage"]],
  "/admin/finance/journal-voucher": [["finance.view", "settings.manage"]],
  "/admin/finance/chart-of-accounts": [["finance.view", "settings.manage"]],
  "/admin/finance/fixed-assets": [["finance.view", "settings.manage"], ["finance.view", "settings.manage", "shifts.any"]],
  "/admin/finance/liabilities": [["finance.view", "reports.view_all"]],
  "/admin/finance/equity": [["finance.view", "reports.view_all"]],
  "/admin/finance/balance-sheet": [["finance.view", "reports.view_all"]],
  "/admin/finance/trial-balance": [["finance.view", "reports.view_all"]],
  "/admin/finance/shifts": [["shifts.any", "reports.view_all", "reports.view_branch", "shifts.own"]],
  "/admin/finance/day-close": [["shifts.any", "reports.view_all", "reports.view_branch"]],
  "/admin/finance/tax-invoices": [["settings.manage", "reports.view_all", "reports.view_branch", "finance.view"]],
  "/admin/expenses/overheads": [["settings.manage", "expenses.manage", "finance.view"]],
  "/admin/payroll/overview": [["payroll.manage", "PAYROLL"]],
  "/admin/payroll/employees": [["payroll.manage", "staff.manage"]],
  "/admin/payroll/advances": [["payroll.manage", "PAYROLL"]],
  "/admin/payroll/run": [["payroll.manage", "PAYROLL"]],
  "/admin/payroll/wages": [["wages.pay", "payroll.manage", "PAYROLL"]],
  "/admin/payroll/statement": [["wages.pay", "payroll.manage", "PAYROLL"]],
  "/admin/payroll/ledger": [["payroll.manage", "PAYROLL"]],
  "/admin/payroll/fingerprint": [["payroll.manage", "PAYROLL", "staff.manage", "shifts.any", "app.pos"]],
  "/admin/payroll/reports": [["payroll.manage", "PAYROLL"]],
  "/admin/payroll/settings": [["payroll.manage", "PAYROLL"]],
  "/admin/canteen": [["canteen.serve", "canteen.manage", "orders.create"]],
  "/admin/canteen/plans": [["canteen.manage"]],
  "/admin/canteen/claims": [["canteen.serve", "canteen.manage", "orders.create"]],
  "/admin/canteen/workers": [["canteen.serve", "canteen.manage", "orders.create"]],
  "/admin/canteen/sessions": [["canteen.manage"]],
  "/admin/canteen/reports": [["canteen.manage"]],
  "/admin/reports": [R], "/admin/reports/grand": [R], "/admin/reports/sales": [R], "/admin/reports/sales-calendar": [R],
  "/admin/reports/financial": [["finance.view", "reports.view_all"]],
  "/admin/reports/products-deals": [R], "/admin/reports/categories": [R], "/admin/reports/order-takers": [R], "/admin/reports/cashiers": [R],
  "/admin/reports/cashier-till": [R, ["shifts.any", "reports.view_all", "reports.view_branch"]],
  "/admin/reports/customers": [R],
  "/admin/reports/customer-ledger": [CUSTOMERS, BOOKS_READ],
  "/admin/reports/operations": [R], "/admin/reports/cancelled-modified": [R], "/admin/reports/delivery-riders": [R], "/admin/reports/vouchers": [R],
  "/admin/reports/loyalty-points": [R], "/admin/reports/regular-discounts": [R], "/admin/reports/ai-pricing": [R],
  "/admin/reports/schedules": [["reports.view_all", "settings.manage"]],
  "/admin/reports/branches": [["finance.view", "reports.view_all"]],
  "/admin/reports/foodpanda": [["finance.view", "reports.view_all"]],
  "/admin/riders/manage": [RIDERS],
  "/admin/riders/vault": [RIDERS, ["expenses.manage", "EXPENSES", "finance.view", "reports.view_all"]],
  "/admin/riders/reports": [R],
  "/admin/riders/app": [RIDERS],
  "/admin/riders/delivery-board": [["orders.create", "reports.view_all", "staff.manage"], RIDERS],
  "/admin/riders/zones": [["settings.manage", "orders.create", "menu.view"]],
  // Settings forms read GET /settings, /business or /branches (no code needed) and save with settings.manage.
  "/admin/settings": [], "/admin/settings/store": [], "/admin/settings/store-management": [], "/admin/settings/business-hours": [],
  "/admin/settings/point-of-sale": [], "/admin/settings/charges-tax": [], "/admin/settings/security-cash": [], "/admin/settings/notifications": [],
  "/admin/settings/modules": [], "/admin/settings/checklist": [], "/admin/settings/devices": [],
  "/admin/settings/branding": [["settings.manage", "menu.edit"]],
  "/admin/settings/website": [["settings.manage", "menu.edit"]],
  "/admin/settings/qr": [["orders.create", "tables.manage", "kitchen.view"]],
  "/admin/settings/checklists": [["app.pos", "shifts.own", "shifts.any", "settings.manage"]],
  "/admin/settings/needs-attention": [["settings.manage", "devices.manage", "reports.view_all", "reports.view_branch"]],
  "/admin/settings/payment-methods": [["settings.manage"]],
  "/admin/settings/regular-discounts": [["settings.manage", "menu.edit", "orders.create", "reports.view_all", "MARKETING"]],
  "/admin/settings/vouchers": [["settings.manage", "menu.edit", "orders.create", "reports.view_all", "MARKETING"]],
  "/admin/settings/loyalty-points": [["settings.manage", "customers.view", "orders.create"]],
  "/admin/settings/audit-logs": [["audit.view", "reports.view_all"]],
  "/admin/settings/whatsapp": [["settings.manage"]],
  "/admin/settings/reviews": [["settings.manage", "reports.view_all", "customers.view", "orders.create"]],
  "/admin/settings/integrations": [["finance.view", "reports.view_all"]],
  "/admin/settings/plan": [["billing.manage", "settings.manage"]],
};

// Permission.expand as app/models/permission.rb has it: SPEC codes bring the EasAlpha codes they imply; a set of EasAlpha
// codes alone (a role) also gets the SPEC codes it covers, except the explicit-only ones (QA P2).
const IMPLIES: Record<string, string[]> = {
  DASHBOARD: ["app.pos"], VIEW_DAILY_SALES: ["reports.view_own"], VIEW_SALES_ANALYTICS: ["reports.view_branch"], OFFLINE_ORDERS: [], PRINTERS: [], SETTINGS: [],
  SALES_WALKIN: ["orders.create"], SALES_TAKEAWAY: ["orders.create"], SALES_DELIVERY: ["orders.create"], ORDERS: [], WEB_ORDERS: [], COMPLETE_ORDER: [],
  CANCEL_ORDER: ["orders.void"], REOPEN_ORDER: ["orders.edit_after_send"], PLACE_AND_COMPLETE_ORDER: [], COMPLIMENTARY_ORDER: ["orders.staff_meal"],
  DELETE_ORDER_ITEM: ["orders.edit_after_send"], MODIFY_REOPEN_DECREASE_QTY: ["orders.edit_after_send"], PAYMENT: ["payments.take"], ACCEPT_PAYMENT: ["payments.take"],
  PLACE_UNPAID_DIRECT: [], APPLY_VOUCHER: ["discounts.apply"], CUSTOMER_ACCOUNT: ["customers.view", "khata.collect"], SEND_ACCOUNT_BILL: [],
  PURCHASE_ORDERS: ["stock.view"], PO_CREATE: ["purchasing.manage"], PO_EDIT: ["purchasing.manage"], PO_DELETE: ["purchasing.manage"], PO_RECEIVE: ["purchasing.manage"],
  PO_RETURN: ["purchasing.manage"], PO_PAYMENT: ["purchasing.manage"], PO_ADD_ITEM: ["stock.actions"], PO_ADD_SUPPLIER: ["suppliers.manage"],
  SUPPLIERS: ["suppliers.manage"], SUPPLIER_LEDGER: ["suppliers.manage"], SUPPLIER_VIEW_LEDGER: [], SUPPLIER_RECORD_PAYMENT: ["suppliers.manage"],
  MARKETING: [], MARKETING_CAMPAIGN: ["customers.manage"], MARKETING_CAMPAIGN_LOG: [], MARKETING_CONTACTS: ["customers.manage"], MARKETING_AUTO_SEND_LOG: [],
  RIDERS: [], RIDER_VIEW: [], RIDER_CREATE: ["riders.manage"], RIDER_EDIT: ["riders.manage"], RIDER_DELETE: ["riders.manage"], DUMMY_RIDER_VIEW: [],
  DUMMY_RIDER_CREATE: ["riders.manage"], DUMMY_RIDER_EDIT: ["riders.manage"], DUMMY_RIDER_DELETE: ["riders.manage"],
  KDS: ["app.kitchen", "kitchen.view", "kitchen.bump"], EXPENSES: ["expenses.manage"], REPORTS: ["reports.view_branch"], MY_TILL: ["shifts.own"], PAYROLL: ["payroll.manage"],
};
const EXPLICIT_ONLY = ["REOPEN_ORDER", "DELETE_ORDER_ITEM", "MODIFY_REOPEN_DECREASE_QTY", "PLACE_UNPAID_DIRECT", "PLACE_AND_COMPLETE_ORDER", "MARKETING_CAMPAIGN", "MARKETING_CONTACTS", "DASHBOARD", "VIEW_DAILY_SALES"];
const DOTTED = ["app.admin", "app.pos", "app.kitchen", "app.rider", "orders.create", "orders.edit_after_send", "orders.void", "orders.refund", "orders.staff_meal", "discounts.apply",
  "discounts.above_limit", "prices.override", "items.open", "payments.take", "payments.cod", "receipts.reprint", "shifts.own", "shifts.any", "cash.in_out", "drawer.open", "kitchen.view",
  "kitchen.bump", "menu.view", "menu.edit", "tables.manage", "customers.view", "customers.manage", "khata.collect", "khata.adjust", "staff.manage", "devices.manage", "settings.manage",
  "billing.manage", "reports.view_all", "reports.view_branch", "reports.view_own", "stock.view", "stock.actions", "stock.waste", "stock.count", "purchasing.manage", "suppliers.manage",
  "riders.manage", "expenses.manage", "finance.view", "payroll.manage", "wages.pay", "canteen.manage", "canteen.serve", "audit.view"];
function expand(codes: string[]): string[] {
  const set = new Set(codes);
  const reverse = !codes.some((c) => c in IMPLIES);
  for (const c of codes) for (const i of IMPLIES[c] ?? []) set.add(i);
  if (reverse) for (const [code, implies] of Object.entries(IMPLIES)) if (implies.length && !EXPLICIT_ONLY.includes(code) && implies.every((i) => set.has(i))) set.add(code);
  return [...set];
}
const SPEC = Object.keys(IMPLIES);
const role = (codes: string[]) => expand(codes);
const MANAGER = role([...DOTTED.filter((c) => !["payroll.manage", "billing.manage", "settings.manage"].includes(c)), ...SPEC.filter((c) => c !== "PAYROLL")]);
const ROLES: [string, string[]][] = [
  ["the Owner", role([...DOTTED, ...SPEC])],
  ["the Manager", MANAGER],
  ["the Accountant", role(["app.admin", "reports.view_all", "finance.view", "expenses.manage", "audit.view", "customers.view"])],
  ["the tester's stock clerk", role(["app.admin", "stock.view", "stock.count", "menu.view"])],
  ...DOTTED.map((c): [string, string[]] => [`app.admin with ${c}`, role(["app.admin", c])]),
  ...SPEC.map((c): [string, string[]] => [`app.admin with ${c}`, role(["app.admin", c])]),
];

const items = (): NavItem[] => NAV.flatMap((g) => g.items).filter((it) => !it.soon && it.href !== "/admin");
const meets = (perms: string[], groups: string[][]) => groups.every((g) => g.some((c) => perms.includes(c)));

describe("the sidebar and the API agree on every page (QA P5)", () => {
  it("knows what the API asks of every sidebar page", () => {
    expect(items().map((it) => it.href).filter((h) => !(h in API_NEEDS))).toEqual([]);
  });

  it.each(ROLES)("offers %s only pages whose calls the API answers", (_name, perms) => {
    const refused = items().filter((it) => navAllows(it, perms) && !meets(perms, API_NEEDS[it.href])).map((it) => it.href);
    expect(refused).toEqual([]);
  });

  it.each(ROLES)("opens to %s, by URL, only pages whose calls the API answers", (_name, perms) => {
    const refused = items().filter((it) => pageAllows(it, perms) && !meets(perms, API_NEEDS[it.href])).map((it) => it.href);
    expect(refused).toEqual([]);
  });

  it("still offers each page to someone: no item the API would answer is hidden from every role", () => {
    const hidden = items().filter((it) => !ROLES.some(([, perms]) => navAllows(it, perms))).map((it) => it.href);
    expect(hidden).toEqual([]);
  });

  it("gives the Accountant the books and reports, not the stock screens that load the sections list (the tester's 19 pages)", () => {
    const acc = ROLES[2][1];
    const shown = items().filter((it) => navAllows(it, acc)).map((it) => it.href);
    expect(shown).toEqual(expect.arrayContaining(["/admin/finance/balance-sheet", "/admin/reports/financial", "/admin/inventory-reports/valuation-cogs", "/admin/customers/ar-aging"]));
    expect(shown).not.toEqual(expect.arrayContaining(["/admin/inventory/stock-in-hand"]));
    for (const h of ["/admin/inventory/stock-in-hand", "/admin/inventory/demand", "/admin/purchasing/goods-received", "/admin/customers/insights", "/admin/customers/payments"]) expect(shown).not.toContain(h);
  });

  it("keeps payroll, settings forms and billing from the Manager, and shows the forms read-only by URL", () => {
    const shown = items().filter((it) => navAllows(it, MANAGER)).map((it) => it.href);
    expect(shown.filter((h) => h.startsWith("/admin/payroll/") && !["/admin/payroll/employees", "/admin/payroll/wages", "/admin/payroll/statement", "/admin/payroll/fingerprint"].includes(h))).toEqual([]);
    expect(shown.filter((h) => h.startsWith("/admin/settings/") && !["/admin/settings/checklists", "/admin/settings/checklist", "/admin/settings/needs-attention", "/admin/settings/devices", "/admin/settings/audit-logs", "/admin/settings/integrations"].includes(h))).toEqual([]);
    const store = items().find((it) => it.href === "/admin/settings/store")!;
    expect(pageAllows(store, MANAGER)).toBe(true); // read-only: the form shows, Save needs settings.manage
    expect(pageAllows(items().find((it) => it.href === "/admin/settings/plan")!, MANAGER)).toBe(false);
  });
});

describe("navItemFor", () => {
  it("finds the entry a page belongs to: the longest match, an exact entry only for itself", () => {
    expect(navItemFor("/admin/canteen/plans")?.label).toBe("Meal Plans");
    expect(navItemFor("/admin/payroll/employees/e-1")?.label).toBe("Employees");
    expect(navItemFor("/admin/customers/c-1")?.href).not.toBe("/admin/customers");
    expect(navItemFor("/admin/canteen/reports", (it) => !!it.module)?.module).toBe("canteen");
    expect(isNavActive({ href: "/admin/reports#tab", label: "x" } as NavItem, "/admin/reports")).toBe(false);
  });
});
