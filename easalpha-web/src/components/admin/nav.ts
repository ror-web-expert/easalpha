import { Utensils, LayoutDashboard, ClipboardList, FileStack, Trash2, Ruler, Warehouse, ReceiptText, UtensilsCrossed, Layers, Package, SlidersHorizontal, Gift, Percent, Landmark, Wallet, CalendarCheck, FileCheck2, PiggyBank, Users, UserCircle, Shield, MonitorSmartphone, BarChart3, Settings, Building2, CreditCard, ListChecks, ScrollText, RefreshCw, Grid3X3, ChefHat, Tag, Boxes, BookOpenText, PieChart, Factory, PackageOpen, Flame, ShieldCheck, Truck, ShoppingCart, FileInput, Undo2, CalendarClock, TrendingUp, Receipt, Banknote, Gauge, Bike, MapPinned, QrCode, CalendarRange, Route, Star, Megaphone, CalendarDays, HandCoins, ClipboardCheck, Scale, GitCompare, Plug, Contact, BadgeDollarSign, Fingerprint, Wallet2, CircleDollarSign, Zap, Clock, History, LineChart, Sparkles, Activity, BookOpen, Lightbulb, Globe, Bell, MessageCircle, Ticket, Store, Timer, Printer, KeyRound, Lock, ListTree, Calculator, FileSpreadsheet, Scroll, Coins, ClipboardSignature, Palette, Barcode, FileText, HandCoins as Wage, ToggleRight, LayoutGrid, type LucideIcon } from "lucide-react";
import type { BusinessModule } from "@/lib/types";

/** module: shown only while the owner has that module switched on (Settings, Modules). */
/** `section` puts a small heading above the item inside its group (review 4.10: the 24 settings screens in six areas). */
/**
 * perms: the codes, any one of which opens the page's main calls on the API; the sidebar shows the item only for them.
 * all: further groups when the page needs calls the API guards differently (one code of every group).
 * open: the page reached by URL asks less than the sidebar: true when its main calls need nothing, else the codes (any)
 * they need. Such a page shows read-only to a session the sidebar does not offer it to (staff lists, settings forms);
 * any other page shows the no-access state instead (QA of 6 Nov 2026, P5: pages drawn half-empty around 403s for
 * accountants and custom roles; P6: forms that could not be saved).
 */
export interface NavItem { href: string; label: string; icon: LucideIcon; perms?: string[]; all?: string[][]; open?: true | string[]; soon?: boolean; exact?: boolean; module?: BusinessModule; section?: string }
/** flat: items render at the top level with no group header (the SPEC's four standalone screens). */
export interface NavGroup { label: string; icon: LucideIcon; items: NavItem[]; flat?: boolean }

// The sidebar follows docs/SPEC.md "System map": four standalone screens, then 12 groups in SPEC order with SPEC screen
// names. EasAlpha extras sit inside the nearest group. soon = SPEC screen not built yet.
// Each item's codes are what the API asks of that page's calls (app/controllers/api/v1, read with a member holding
// nothing but app.admin on 6 Nov 2026); nav-access.test.ts holds the same table and checks every code against it.
const REPORTS = ["reports.view_all", "reports.view_branch", "reports.view_own", "REPORTS"];
// Stock pages that load the sections list (GET /stock_sections), which reports.view_all does not open.
const STOCK = ["stock.view", "stock.actions", "stock.count"];
// Stock reports without the sections list: reports.view_all reads them too.
const STOCK_REPORTS = [...STOCK, "reports.view_all"];
const PURCHASES = ["purchasing.manage", "suppliers.manage", "stock.view", "finance.view", "reports.view_all"];
const SUPPLIER_LIST = ["SUPPLIERS", "PURCHASE_ORDERS", "stock.view", "finance.view"];
const SUPPLIER_LEDGER = ["SUPPLIER_LEDGER", "SUPPLIER_VIEW_LEDGER", "SUPPLIER_RECORD_PAYMENT", "finance.view"];
const CUSTOMER_LIST = ["customers.view", "customers.manage", "orders.create", "CUSTOMER_ACCOUNT"];
const ACCOUNT_BOOKS = ["customers.view", "customers.manage", "khata.collect", "CUSTOMER_ACCOUNT", "reports.view_all", "finance.view"];
const BOOKS = ["finance.view", "settings.manage"];
const STATEMENTS = ["finance.view", "reports.view_all"];
const STAFF = ["staff.manage"];
const RIDER_LIST = ["RIDERS", "RIDER_VIEW", "DUMMY_RIDER_VIEW", "orders.create", "reports.view_all"];
const SETTINGS = ["settings.manage"];
const MENU = ["menu.view", "menu.edit"];

export const NAV: NavGroup[] = [
  {
    label: "Standalone",
    icon: LayoutDashboard,
    flat: true,
    items: [
      // The landing page: no codes; without the dashboard's it greets and lists the pages this session opens.
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/orders", label: "Orders", icon: ReceiptText, exact: true, perms: ["orders.create", "reports.view_all", "reports.view_branch"], all: [RIDER_LIST] },
      { href: "/admin/orders/pending", label: "Pending Orders", icon: Clock, exact: true, perms: ["orders.create", "reports.view_all", "reports.view_branch", "ORDERS"], all: [RIDER_LIST] },
      { href: "/admin/expenses", label: "Expenses", icon: Banknote, exact: true, perms: ["expenses.manage", "finance.view", "reports.view_all", "EXPENSES"] },
      { href: "/admin/tables", label: "Tables", icon: Grid3X3, perms: ["tables.manage", "orders.create", "kitchen.view"] },
    ],
  },
  {
    label: "Products",
    icon: UtensilsCrossed,
    items: [
      { href: "/admin/products/menus", label: "Menus", icon: UtensilsCrossed, perms: MENU },
      { href: "/admin/products/catalog", label: "Catalog", icon: Package, perms: MENU },
      { href: "/admin/products/deals", label: "Deals", icon: Gift, perms: MENU },
      { href: "/admin/products/promotions", label: "Promotions", icon: Percent, perms: MENU },
      { href: "/admin/products/quick-add", label: "Quick Add Menu", icon: Zap, perms: MENU },
      { href: "/admin/products/labels", label: "Barcode Labels", icon: Barcode, perms: MENU },
      { href: "/admin/products/categories", label: "Categories", icon: Layers, perms: MENU },
      { href: "/admin/products/modifier-groups", label: "Modifier groups", icon: SlidersHorizontal, perms: MENU },
      { href: "/admin/products/tax-rates", label: "Tax rates", icon: Tag },
      { href: "/admin/products/stations", label: "Stations", icon: ChefHat },
    ],
  },
  {
    label: "Inventory",
    icon: Boxes,
    items: [
      { href: "/admin/inventory/stock-in-hand", label: "Stock in Hand", icon: Boxes, perms: STOCK },
      { href: "/admin/inventory/stock-actions", label: "Stock Actions", icon: FileStack, perms: [...STOCK, "stock.waste"] },
      { href: "/admin/inventory/demand", label: "Demand", icon: TrendingUp, perms: STOCK, all: [PURCHASES] },
      { href: "/admin/inventory/items", label: "Items", icon: Package, perms: [...STOCK, "stock.waste"] },
      { href: "/admin/inventory/recipes", label: "Recipes", icon: BookOpenText, perms: ["stock.view", "stock.actions", "menu.edit", "menu.view"] },
      { href: "/admin/inventory/order-inventory", label: "Order Inventory", icon: PackageOpen, perms: ["stock.view", "stock.actions", "settings.manage"] },
      { href: "/admin/inventory/units", label: "Units", icon: Ruler, perms: ["stock.actions"] },
      { href: "/admin/inventory/settings", label: "Inventory Settings", icon: SlidersHorizontal, perms: STOCK },
      { href: "/admin/inventory/sections", label: "Sections", icon: Warehouse, perms: STOCK },
      { href: "/admin/inventory/food-cost", label: "Food cost", icon: PieChart, perms: ["stock.view", "stock.actions", "menu.edit", "menu.view"] },
      { href: "/admin/inventory/production", label: "Production", icon: Factory, perms: ["stock.view", "stock.actions"] },
    ],
  },
  {
    label: "Inventory Reports",
    icon: ClipboardList,
    items: [
      { href: "/admin/inventory-reports/daily-stock-sheet", label: "Daily Stock Sheet", icon: ClipboardList, perms: STOCK },
      { href: "/admin/inventory-reports/stock-ledger", label: "Stock Ledger", icon: History, perms: STOCK },
      { href: "/admin/inventory-reports/consumption", label: "Consumption", icon: Flame, perms: STOCK_REPORTS },
      { href: "/admin/inventory-reports/waste-adjustments", label: "Waste & Adjustments", icon: Trash2, perms: STOCK_REPORTS },
      { href: "/admin/inventory-reports/actual-vs-theoretical", label: "Actual vs Theoretical", icon: Scale, perms: STOCK },
      { href: "/admin/inventory-reports/valuation-cogs", label: "Valuation & COGS", icon: Calculator, perms: STOCK_REPORTS },
      { href: "/admin/inventory-reports/ai-stock-forecast", label: "AI Stock Forecast", icon: Sparkles, perms: REPORTS },
      { href: "/admin/inventory-reports/deduction-health", label: "Deduction Health", icon: ShieldCheck, perms: STOCK_REPORTS },
    ],
  },
  {
    label: "Purchasing",
    icon: ShoppingCart,
    items: [
      { href: "/admin/purchasing/purchase-orders", label: "Purchase Orders", icon: ShoppingCart, perms: ["PURCHASE_ORDERS", "stock.view"] },
      { href: "/admin/purchasing/purchase-returns", label: "Purchase Returns", icon: Undo2, perms: ["PURCHASE_ORDERS", "PO_RETURN", "stock.view"] },
      { href: "/admin/purchasing/price-history", label: "Purchase Price History", icon: LineChart, perms: ["PURCHASE_ORDERS", "purchasing.manage", "finance.view", "reports.view_all"] },
      { href: "/admin/purchasing/goods-received", label: "Goods received", icon: FileInput, perms: ["purchasing.manage", "stock.view", "stock.actions"] },
      { href: "/admin/purchasing/payables-aging", label: "Payables aging", icon: CalendarClock, perms: PURCHASES },
      { href: "/admin/purchasing/purchases-report", label: "Purchases report", icon: Receipt, perms: PURCHASES },
    ],
  },
  {
    label: "Suppliers",
    icon: Truck,
    items: [
      { href: "/admin/suppliers", label: "Suppliers", icon: Truck, exact: true, perms: SUPPLIER_LIST, all: [PURCHASES] },
      { href: "/admin/suppliers/ledger", label: "Supplier Ledger", icon: BookOpen, perms: SUPPLIER_LEDGER, all: [SUPPLIER_LIST] },
      { href: "/admin/suppliers/insights", label: "Supplier Insights", icon: Lightbulb, perms: SUPPLIER_LIST },
      { href: "/admin/suppliers/payments", label: "Supplier Payments", icon: Coins, perms: SUPPLIER_LEDGER, all: [SUPPLIER_LIST] },
    ],
  },
  {
    label: "Customers",
    icon: Users,
    items: [
      { href: "/admin/customers", label: "Customers", icon: Users, exact: true, perms: CUSTOMER_LIST, all: [ACCOUNT_BOOKS] },
      { href: "/admin/customers/ledger", label: "Customer Ledger", icon: BookOpen, perms: CUSTOMER_LIST, all: [ACCOUNT_BOOKS], module: "customer_accounts" },
      { href: "/admin/customers/bills", label: "Monthly Bills", icon: FileText, perms: CUSTOMER_LIST, all: [ACCOUNT_BOOKS], module: "customer_accounts" },
      { href: "/admin/customers/insights", label: "Customer Insights", icon: Lightbulb, perms: ["customers.manage"] },
      { href: "/admin/customers/payments", label: "Customer Payments", icon: Coins, perms: ["khata.collect", "customers.manage"], all: [CUSTOMER_LIST], module: "customer_accounts" },
      { href: "/admin/customers/account", label: "Customer Account", icon: Wallet, perms: CUSTOMER_LIST, all: [ACCOUNT_BOOKS], module: "customer_accounts" },
      { href: "/admin/customers/ar-aging", label: "AR Aging", icon: PiggyBank, perms: ACCOUNT_BOOKS, module: "customer_accounts" },
      { href: "/admin/customers/campaigns", label: "Campaigns", icon: Megaphone, perms: ["MARKETING", "MARKETING_CAMPAIGN", "MARKETING_CAMPAIGN_LOG", "settings.manage"] },
      { href: "/admin/customers/reservations", label: "Reservations", icon: CalendarDays, perms: ["orders.create", "tables.manage"] },
      { href: "/admin/orders/qr", label: "Online & QR orders", icon: QrCode, perms: ["orders.create", "kitchen.view"] },
    ],
  },
  {
    label: "Staff",
    icon: UserCircle,
    // GET /staff and /roles answer every session (names and roles only without staff.manage), so a page reached by
    // URL shows the team read-only rather than "no access".
    items: [
      { href: "/admin/staff/cashiers", label: "Cashiers", icon: UserCircle, perms: STAFF, open: true },
      { href: "/admin/staff/sessions", label: "User Sessions", icon: Clock, perms: STAFF },
      { href: "/admin/staff/order-takers", label: "Order Takers", icon: ClipboardSignature, perms: STAFF, open: true },
      { href: "/admin/staff/admin-staff", label: "Admin Staff", icon: Shield, perms: STAFF, open: true },
      { href: "/admin/staff/roles", label: "Roles", icon: KeyRound, perms: STAFF, open: true },
      { href: "/admin/staff/commissions", label: "Commissions", icon: HandCoins, perms: ["staff.manage", "settings.manage", "reports.view_all"] },
    ],
  },
  {
    label: "Finance",
    icon: Landmark,
    items: [
      { href: "/admin/finance/dashboard", label: "Dashboard", icon: Gauge, perms: STATEMENTS },
      { href: "/admin/finance/payment-accounts", label: "Payment Accounts", icon: Landmark, perms: ["finance.view", "settings.manage", "shifts.any"] },
      { href: "/admin/finance/combined-ledger", label: "Combined Ledger", icon: BookOpen, perms: BOOKS },
      { href: "/admin/finance/journal-voucher", label: "Journal Voucher", icon: Scroll, perms: BOOKS },
      { href: "/admin/finance/chart-of-accounts", label: "Chart of Accounts", icon: ListTree, perms: BOOKS },
      { href: "/admin/finance/fixed-assets", label: "Fixed Assets", icon: Building2, perms: BOOKS },
      { href: "/admin/finance/liabilities", label: "Liabilities", icon: FileSpreadsheet, perms: STATEMENTS },
      { href: "/admin/finance/equity", label: "Equity", icon: PieChart, perms: STATEMENTS },
      { href: "/admin/finance/balance-sheet", label: "Balance Sheet", icon: Scale, perms: STATEMENTS },
      { href: "/admin/finance/trial-balance", label: "Trial Balance", icon: Calculator, perms: STATEMENTS },
      { href: "/admin/finance/shifts", label: "Shifts", icon: Wallet, perms: ["shifts.any", "reports.view_all", "reports.view_branch", "shifts.own", "MY_TILL"] },
      { href: "/admin/finance/day-close", label: "Day close", icon: CalendarCheck, perms: ["shifts.any", "reports.view_all", "reports.view_branch"] },
      { href: "/admin/finance/tax-invoices", label: "Tax invoices", icon: FileCheck2, perms: ["settings.manage", "reports.view_all", "reports.view_branch", "finance.view"] },
      { href: "/admin/expenses/overheads", label: "Overheads", icon: Gauge, perms: ["settings.manage", "expenses.manage", "finance.view"] },
    ],
  },
  {
    label: "Payroll",
    icon: BadgeDollarSign,
    items: [
      { href: "/admin/payroll/overview", label: "Overview", icon: Gauge, perms: ["payroll.manage", "PAYROLL"], module: "payroll" },
      { href: "/admin/payroll/employees", label: "Employees", icon: Contact, perms: ["payroll.manage", "staff.manage", "PAYROLL"], module: "payroll" },
      { href: "/admin/payroll/advances", label: "Advances", icon: CircleDollarSign, perms: ["payroll.manage", "PAYROLL"], module: "payroll" },
      { href: "/admin/payroll/run", label: "Run Payroll", icon: BadgeDollarSign, perms: ["payroll.manage", "PAYROLL"], module: "payroll" },
      { href: "/admin/payroll/wages", label: "Pay Wages", icon: Wage, perms: ["payroll.manage", "PAYROLL", "wages.pay"], module: "payroll" },
      { href: "/admin/payroll/statement", label: "Employee Statement", icon: FileText, perms: ["payroll.manage", "PAYROLL", "wages.pay"], module: "payroll" },
      { href: "/admin/payroll/ledger", label: "Ledger", icon: BookOpen, perms: ["payroll.manage", "PAYROLL"], module: "payroll" },
      { href: "/admin/payroll/fingerprint", label: "Fingerprint", icon: Fingerprint, perms: ["payroll.manage", "staff.manage", "PAYROLL"], module: "payroll" },
      { href: "/admin/payroll/reports", label: "Reports", icon: BarChart3, perms: ["payroll.manage", "PAYROLL"], module: "payroll" },
      // GET /payroll/settings needs payroll.manage or PAYROLL; settings.manage only joins them for saving.
      { href: "/admin/payroll/settings", label: "Settings", icon: Wallet2, perms: ["payroll.manage", "PAYROLL"], module: "payroll" },
    ],
  },
  {
    label: "Canteen",
    icon: Utensils,
    // As the API's canteen controller checks them (review R5): canteen.serve opens the kiosk screens (today, meals),
    // everything else needs canteen.manage. settings.manage and the report permissions open none of it.
    items: [
      { href: "/admin/canteen", label: "Today", icon: Utensils, exact: true, perms: ["canteen.manage", "canteen.serve"], module: "canteen" },
      { href: "/admin/canteen/plans", label: "Meal Plans", icon: CalendarDays, perms: ["canteen.manage"], module: "canteen" },
      { href: "/admin/canteen/claims", label: "Meals", icon: ListChecks, perms: ["canteen.manage", "canteen.serve"], module: "canteen" },
      { href: "/admin/canteen/workers", label: "Workers", icon: Fingerprint, perms: ["canteen.manage"], module: "canteen" },
      { href: "/admin/canteen/sessions", label: "Meal Sessions", icon: Timer, perms: ["canteen.manage"], module: "canteen" },
      { href: "/admin/canteen/reports", label: "Reports", icon: BarChart3, perms: ["canteen.manage"], module: "canteen" },
    ],
  },
  {
    label: "Reports",
    icon: BarChart3,
    items: [
      { href: "/admin/reports", label: "Business Overview", icon: BarChart3, exact: true, perms: REPORTS },
      { href: "/admin/reports/grand", label: "Grand Report", icon: FileSpreadsheet, perms: REPORTS },
      { href: "/admin/reports/sales", label: "Sales", icon: LineChart, perms: REPORTS },
      { href: "/admin/reports/sales-calendar", label: "Sales Calendar", icon: CalendarRange, perms: REPORTS },
      // GET /finance/profit_loss: the books, not the sales reports.
      { href: "/admin/reports/financial", label: "Financial", icon: Landmark, perms: STATEMENTS },
      { href: "/admin/reports/products-deals", label: "Products & Deals", icon: Package, perms: REPORTS },
      { href: "/admin/reports/categories", label: "Category Report", icon: Layers, perms: REPORTS },
      { href: "/admin/reports/order-takers", label: "Order Takers", icon: ClipboardSignature, perms: REPORTS },
      { href: "/admin/reports/cashiers", label: "Cashiers", icon: UserCircle, perms: REPORTS },
      { href: "/admin/reports/cashier-till", label: "Cashier Till", icon: Wallet, perms: REPORTS, all: [["shifts.any", "reports.view_all", "reports.view_branch", "REPORTS"]] },
      { href: "/admin/reports/customers", label: "Customers", icon: Users, perms: REPORTS },
      { href: "/admin/reports/customer-ledger", label: "Customer Ledger", icon: BookOpen, perms: CUSTOMER_LIST, all: [ACCOUNT_BOOKS], module: "customer_accounts" },
      { href: "/admin/reports/operations", label: "Operations", icon: Activity, perms: REPORTS },
      { href: "/admin/reports/cancelled-modified", label: "Cancelled & Modified Orders", icon: Undo2, perms: REPORTS },
      { href: "/admin/reports/delivery-riders", label: "Delivery Riders", icon: Bike, perms: REPORTS },
      { href: "/admin/reports/vouchers", label: "Vouchers", icon: Ticket, perms: REPORTS },
      { href: "/admin/reports/loyalty-points", label: "Loyalty Points", icon: Star, perms: REPORTS },
      { href: "/admin/reports/regular-discounts", label: "Regular Discounts", icon: Percent, perms: REPORTS },
      { href: "/admin/reports/ai-pricing", label: "AI Pricing", icon: Sparkles, perms: REPORTS },
      { href: "/admin/reports/schedules", label: "Scheduled reports", icon: CalendarRange, perms: ["reports.view_all", "settings.manage"] },
      { href: "/admin/reports/branches", label: "Branch comparison", icon: GitCompare, perms: STATEMENTS },
      { href: "/admin/reports/foodpanda", label: "Foodpanda", icon: Bike, perms: STATEMENTS },
    ],
  },
  {
    label: "Riders",
    icon: Bike,
    items: [
      { href: "/admin/riders/manage", label: "Manage Riders", icon: Bike, perms: RIDER_LIST },
      { href: "/admin/riders/vault", label: "Rider Vault", icon: Wallet, perms: RIDER_LIST, all: [["expenses.manage", "EXPENSES", "finance.view", "reports.view_all"]] },
      { href: "/admin/riders/reports", label: "Rider Reports", icon: BarChart3, perms: REPORTS },
      { href: "/admin/riders/app", label: "Rider App", icon: MonitorSmartphone, perms: RIDER_LIST },
      { href: "/admin/riders/delivery-board", label: "Delivery board", icon: Route, perms: ["orders.create", "reports.view_all", "staff.manage"], all: [RIDER_LIST] },
      { href: "/admin/riders/zones", label: "Zones", icon: MapPinned, perms: ["settings.manage", "orders.create", "menu.view"] },
    ],
  },
  {
    label: "Settings",
    icon: Settings,
    // The settings forms read GET /settings, /business and /branches, which answer every session: reached by URL without
    // settings.manage they show read-only (QA of 6 Nov 2026, P6), so they are open. The others say what they read.
    items: [
      { href: "/admin/settings", label: "All settings", icon: LayoutGrid, perms: SETTINGS, exact: true, open: true },
      { href: "/admin/settings/store", section: "Store", label: "Store", icon: Store, perms: SETTINGS, open: true },
      { href: "/admin/settings/branding", section: "Store", label: "Branding", icon: Palette, perms: SETTINGS, open: ["settings.manage", "menu.edit"] },
      { href: "/admin/settings/store-management", section: "Store", label: "Store Management", icon: Building2, perms: SETTINGS, open: true },
      { href: "/admin/settings/business-hours", section: "Store", label: "Business Hours", icon: Timer, perms: SETTINGS, open: true },
      { href: "/admin/settings/point-of-sale", section: "Point of Sale", label: "Point of Sale", icon: MonitorSmartphone, perms: SETTINGS, open: true },
      { href: "/admin/settings/qr", section: "Point of Sale", label: "QR ordering", icon: QrCode, perms: SETTINGS, all: [["orders.create", "tables.manage", "kitchen.view"]], open: ["orders.create", "tables.manage", "kitchen.view"] },
      { href: "/admin/settings/checklists", section: "Point of Sale", label: "Opening and closing", icon: ClipboardCheck, perms: ["settings.manage", "shifts.any", "shifts.own", "app.pos"] },
      { href: "/admin/settings/needs-attention", section: "Point of Sale", label: "Needs attention", icon: RefreshCw, perms: ["settings.manage", "devices.manage", "reports.view_all", "reports.view_branch"] },
      { href: "/admin/settings/charges-tax", section: "Money", label: "Charges & Tax", icon: Percent, perms: SETTINGS, open: true },
      { href: "/admin/settings/payment-methods", section: "Money", label: "Payment Methods", icon: CreditCard, perms: SETTINGS },
      { href: "/admin/settings/regular-discounts", section: "Money", label: "Regular Discounts", icon: Percent, perms: SETTINGS, open: ["settings.manage", "menu.edit", "orders.create", "reports.view_all", "MARKETING"] },
      { href: "/admin/settings/vouchers", section: "Money", label: "Vouchers", icon: Ticket, perms: SETTINGS, open: ["settings.manage", "menu.edit", "orders.create", "reports.view_all", "MARKETING"] },
      { href: "/admin/settings/loyalty-points", section: "Money", label: "Loyalty Points", icon: Star, perms: SETTINGS, open: ["settings.manage", "customers.view", "orders.create"] },
      { href: "/admin/settings/security-cash", section: "Staff and Security", label: "Security & Cash", icon: Lock, perms: SETTINGS, open: true },
      { href: "/admin/settings/devices", section: "Staff and Security", label: "Signed-in devices", icon: Printer, perms: ["devices.manage", "settings.manage"] },
      { href: "/admin/settings/audit-logs", section: "Staff and Security", label: "Audit Logs", icon: ScrollText, perms: ["audit.view", "reports.view_all"] },
      { href: "/admin/settings/website", section: "Integrations", label: "Website Config", icon: Globe, perms: SETTINGS, open: ["settings.manage", "menu.edit"] },
      { href: "/admin/settings/whatsapp", section: "Integrations", label: "WhatsApp", icon: MessageCircle, perms: SETTINGS },
      { href: "/admin/settings/notifications", section: "Integrations", label: "Notifications", icon: Bell, perms: SETTINGS, open: true },
      { href: "/admin/settings/reviews", section: "Integrations", label: "Reviews", icon: Star, perms: SETTINGS, open: ["settings.manage", "reports.view_all", "customers.view", "orders.create"] },
      // GET /integrations/foodpanda reads the money side: finance.view or reports.view_all, not settings.manage.
      { href: "/admin/settings/integrations", section: "Integrations", label: "Integrations", icon: Plug, perms: STATEMENTS },
      { href: "/admin/settings/plan", section: "Plan", label: "Plan", icon: BadgeDollarSign, perms: ["billing.manage", "settings.manage"] },
      { href: "/admin/settings/modules", section: "Plan", label: "Modules", icon: ToggleRight, perms: SETTINGS, open: true },
      { href: "/admin/settings/checklist", section: "Plan", label: "Setup checklist", icon: ListChecks },
    ],
  },
];

/** Whether the sidebar offers this item to a session with these codes: one of perms, and one of every group in all. */
export function navAllows(it: NavItem, perms: string[] | undefined): boolean {
  const has = (codes: string[]) => !!perms && codes.some((c) => perms.includes(c));
  return (!it.perms || has(it.perms)) && (it.all ?? []).every(has);
}

/** Whether a session may open the page itself (reached by URL): what the sidebar asks, unless the page asks less. */
export function pageAllows(it: NavItem, perms: string[] | undefined): boolean {
  if (it.open === true) return true;
  if (it.open) return !!perms && it.open.some((c) => perms.includes(c));
  return navAllows(it, perms);
}

/** Whether a sidebar entry is the page at `pathname`: exact entries match only themselves, others their sub-pages too. */
export function isNavActive(it: NavItem, pathname: string): boolean {
  const base = it.href.split("#")[0];
  if (it.href.includes("#")) return false; // report tabs: only the exact Business Overview entry highlights
  return base === "/admin" || it.exact ? pathname === base : pathname === base || pathname.startsWith(base + "/");
}

/** The entry a page belongs to, among those `where` accepts: the longest matching href wins (/admin/stock/items over /admin/stock). */
export function navItemFor(pathname: string, where: (it: NavItem) => boolean = () => true): NavItem | null {
  let best: NavItem | null = null;
  for (const g of NAV) for (const it of g.items) if (where(it) && isNavActive(it, pathname) && (!best || it.href.length > best.href.length)) best = it;
  return best;
}

/**
 * The entry whose codes guard a page reached by URL: as navItemFor, but an exact entry also covers its own sub-pages
 * (a customer's page under Customers, a supplier's under Suppliers), and the Dashboard covers nothing but itself.
 */
export function guardItemFor(pathname: string): NavItem | null {
  let best: NavItem | null = null;
  for (const g of NAV) for (const it of g.items) {
    const base = it.href.split("#")[0];
    if (base === "/admin" || it.href.includes("#")) continue;
    if ((pathname === base || pathname.startsWith(base + "/")) && (!best || base.length > best.href.length)) best = it;
  }
  return best;
}

/** One line per settings area, for the Settings overview page (review 4.10). Keys match the `section` on each item. */
export const SETTINGS_SECTIONS: { key: string; summary: string }[] = [
  { key: "Store", summary: "Name, address and phone on the receipt, linked stores, the business day and the look of the receipt." },
  { key: "Point of Sale", summary: "How the till takes orders, QR ordering at the table, opening and closing checks, and records that failed to sync." },
  { key: "Money", summary: "Service and delivery charges, tax, payment methods, discounts, vouchers and loyalty points." },
  { key: "Staff and Security", summary: "PINs and the cashier drawer, the devices signed in, and the audit log of who changed what." },
  { key: "Integrations", summary: "The ordering website, WhatsApp, notifications, customer reviews and connected services." },
  { key: "Plan", summary: "Your subscription, the modules switched on, and the setup checklist." },
];
