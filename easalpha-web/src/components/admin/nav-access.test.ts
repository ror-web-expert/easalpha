import { describe, expect, it } from "vitest";
import { hasPermission } from "@/store/auth";
import { NAV, isNavActive, navItemFor, type NavItem } from "./nav";

// Review R5: the sidebar must never offer a page whose main call the API refuses that role. What the API asks for each
// page's main call, read from app/controllers/api/v1 (canteen, payroll, employees, wages, attendance, payment_methods,
// billing, whatsapp) on 6 Nov 2026:
const API_NEEDS: Record<string, string[]> = {
  "/admin/canteen": ["canteen.serve", "canteen.manage", "orders.create"], // canteen#today, a kiosk action
  "/admin/canteen/plans": ["canteen.manage"],
  "/admin/canteen/claims": ["canteen.serve", "canteen.manage", "orders.create"],
  "/admin/canteen/workers": ["canteen.serve", "canteen.manage", "orders.create"],
  "/admin/canteen/sessions": ["canteen.manage"],
  "/admin/canteen/reports": ["canteen.manage"],
  "/admin/payroll/overview": ["payroll.manage", "PAYROLL"],
  "/admin/payroll/employees": ["payroll.manage", "staff.manage"],
  "/admin/payroll/advances": ["payroll.manage", "PAYROLL"],
  "/admin/payroll/run": ["payroll.manage", "PAYROLL"],
  "/admin/payroll/wages": ["wages.pay", "payroll.manage", "PAYROLL"],
  "/admin/payroll/statement": ["wages.pay", "payroll.manage", "PAYROLL"],
  "/admin/payroll/ledger": ["payroll.manage", "PAYROLL"],
  "/admin/payroll/fingerprint": ["payroll.manage", "PAYROLL", "staff.manage", "shifts.any", "app.pos"],
  "/admin/payroll/reports": ["payroll.manage", "PAYROLL"],
  "/admin/payroll/settings": ["payroll.manage", "PAYROLL"],
  "/admin/settings/payment-methods": ["settings.manage"],
  "/admin/settings/plan": ["billing.manage", "settings.manage"],
  "/admin/settings/whatsapp": ["settings.manage"],
};

// The Manager role as the API grants it today: Permission.expand(RoleTemplate "manager"), every code but payroll.manage,
// billing.manage and settings.manage, with payroll.manage back through the SPEC code PAYROLL.
const MANAGER = ["ACCEPT_PAYMENT", "APPLY_VOUCHER", "CANCEL_ORDER", "COMPLETE_ORDER", "COMPLIMENTARY_ORDER", "CUSTOMER_ACCOUNT", "DASHBOARD", "DELETE_ORDER_ITEM", "DUMMY_RIDER_CREATE", "DUMMY_RIDER_DELETE", "DUMMY_RIDER_EDIT", "DUMMY_RIDER_VIEW", "EXPENSES", "KDS", "MARKETING", "MARKETING_AUTO_SEND_LOG", "MARKETING_CAMPAIGN", "MARKETING_CAMPAIGN_LOG", "MARKETING_CONTACTS", "MODIFY_REOPEN_DECREASE_QTY", "MY_TILL", "OFFLINE_ORDERS", "ORDERS", "PAYMENT", "PAYROLL", "PLACE_AND_COMPLETE_ORDER", "PLACE_UNPAID_DIRECT", "PO_ADD_ITEM", "PO_ADD_SUPPLIER", "PO_CREATE", "PO_DELETE", "PO_EDIT", "PO_PAYMENT", "PO_RECEIVE", "PO_RETURN", "PRINTERS", "PURCHASE_ORDERS", "REOPEN_ORDER", "REPORTS", "RIDERS", "RIDER_CREATE", "RIDER_DELETE", "RIDER_EDIT", "RIDER_VIEW", "SALES_DELIVERY", "SALES_TAKEAWAY", "SALES_WALKIN", "SEND_ACCOUNT_BILL", "SETTINGS", "SUPPLIERS", "SUPPLIER_LEDGER", "SUPPLIER_RECORD_PAYMENT", "SUPPLIER_VIEW_LEDGER", "VIEW_DAILY_SALES", "VIEW_SALES_ANALYTICS", "WEB_ORDERS", "app.admin", "app.kitchen", "app.pos", "app.rider", "audit.view", "canteen.manage", "canteen.serve", "cash.in_out", "customers.manage", "customers.view", "devices.manage", "discounts.above_limit", "discounts.apply", "drawer.open", "expenses.manage", "finance.view", "items.open", "khata.adjust", "khata.collect", "kitchen.bump", "kitchen.view", "menu.edit", "menu.view", "orders.create", "orders.edit_after_send", "orders.refund", "orders.staff_meal", "orders.void", "payments.cod", "payments.take", "payroll.manage", "prices.override", "purchasing.manage", "receipts.reprint", "reports.view_all", "reports.view_branch", "reports.view_own", "riders.manage", "shifts.any", "shifts.own", "staff.manage", "stock.actions", "stock.count", "stock.view", "stock.waste", "suppliers.manage", "tables.manage", "wages.pay"];
// A Manager role made before the canteen (29 Oct 2026): its codes were never added to existing roles.
const MANAGER_BEFORE_CANTEEN = MANAGER.filter((c) => !c.startsWith("canteen."));
// A Manager role made before the SPEC codes too: no PAYROLL, so no payroll.manage (the 6 Nov screen walk's manager).
const MANAGER_BEFORE_SPEC = MANAGER_BEFORE_CANTEEN.filter((c) => c !== c.toUpperCase() && c !== "payroll.manage");
const CUSTOM_SETTINGS_ADMIN = ["app.admin", "settings.manage", "reports.view_all"];

const items = (): NavItem[] => NAV.flatMap((g) => g.items).filter((it) => it.href in API_NEEDS);
const shows = (it: NavItem, perms: string[]) => !it.perms || hasPermission(perms, ...it.perms);

describe("the sidebar and the API agree on the canteen, payroll, payment method, plan and WhatsApp pages", () => {
  it("covers every one of those pages", () => {
    expect(items().map((it) => it.href).sort()).toEqual(Object.keys(API_NEEDS).sort());
  });

  it.each([["the Manager role", MANAGER], ["a Manager role made before the canteen", MANAGER_BEFORE_CANTEEN], ["a Manager role made before the SPEC codes", MANAGER_BEFORE_SPEC], ["a custom settings role", CUSTOM_SETTINGS_ADMIN]])(
    "offers %s only pages the API lets it load", (_name, perms) => {
      const refused = items().filter((it) => shows(it, perms) && !hasPermission(perms, ...API_NEEDS[it.href])).map((it) => it.href);
      expect(refused).toEqual([]);
    });

  it("keeps payment methods, the plan and WhatsApp from a manager, and gives them the canteen and payroll", () => {
    const shown = items().filter((it) => shows(it, MANAGER)).map((it) => it.href);
    expect(shown).not.toEqual(expect.arrayContaining(["/admin/settings/payment-methods"]));
    expect(shown.filter((h) => h.startsWith("/admin/settings"))).toEqual([]);
    expect(shown).toEqual(expect.arrayContaining(["/admin/canteen", "/admin/canteen/plans", "/admin/canteen/reports", "/admin/payroll/overview", "/admin/payroll/settings"]));
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
