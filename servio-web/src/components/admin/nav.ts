import { LayoutDashboard, ClipboardList, FileStack, Trash2, Ruler, Warehouse, ReceiptText, UtensilsCrossed, Layers, Package, SlidersHorizontal, Gift, Percent, Landmark, Wallet, CalendarCheck, FileCheck2, PiggyBank, Users, UserCircle, Shield, MonitorSmartphone, BarChart3, Settings, Building2, CreditCard, ListChecks, ScrollText, RefreshCw, Grid3X3, ChefHat, Tag, Boxes, BookOpenText, PieChart, Factory, PackageOpen, Flame, ShieldCheck, Truck, ShoppingCart, FileInput, Undo2, CalendarClock, TrendingUp, Receipt, Banknote, Gauge, Bike, MapPinned, QrCode, CalendarRange, Route, Star, Megaphone, CalendarDays, HandCoins, ClipboardCheck, Scale, GitCompare, Plug, Contact, BadgeDollarSign, Fingerprint, Wallet2, CircleDollarSign, Zap, Clock, History, LineChart, Sparkles, Activity, BookOpen, Lightbulb, Globe, Bell, MessageCircle, Ticket, Store, Timer, Printer, KeyRound, Lock, ListTree, Calculator, FileSpreadsheet, Scroll, Coins, ClipboardSignature, type LucideIcon } from "lucide-react";

export interface NavItem { href: string; label: string; icon: LucideIcon; perms?: string[]; soon?: boolean; exact?: boolean }
/** flat: items render at the top level with no group header (the SPEC's four standalone screens). */
export interface NavGroup { label: string; icon: LucideIcon; items: NavItem[]; flat?: boolean }

// The sidebar follows docs/SPEC.md "System map": four standalone screens, then 12 groups in SPEC order with SPEC screen
// names. Servio extras sit inside the nearest group. soon = SPEC screen not built yet.
const REPORTS = ["reports.view_all", "reports.view_branch", "reports.view_own", "REPORTS"];
const STOCK = ["stock.view", "stock.actions", "stock.waste", "stock.count", "reports.view_all"];
const BUY = ["purchasing.manage", "suppliers.manage", "stock.view", "finance.view", "PURCHASE_ORDERS"];
const PEOPLE = ["customers.view", "customers.manage", "orders.create", "khata.collect", "CUSTOMER_ACCOUNT"];
const MONEY = ["finance.view", "settings.manage", "shifts.any", "reports.view_all"];
const STAFF = ["staff.manage"];
const RIDERS = ["riders.manage", "staff.manage", "orders.create", "RIDERS", "RIDER_VIEW"];
const SETTINGS = ["settings.manage"];

export const NAV: NavGroup[] = [
  {
    label: "Standalone",
    icon: LayoutDashboard,
    flat: true,
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/orders", label: "Orders", icon: ReceiptText, exact: true },
      { href: "/admin/orders/pending", label: "Pending Orders", icon: Clock, exact: true },
      { href: "/admin/expenses", label: "Expenses", icon: Banknote, exact: true, perms: ["expenses.manage", "finance.view", "reports.view_all", "EXPENSES"] },
      { href: "/admin/tables", label: "Tables", icon: Grid3X3, perms: ["tables.manage", "orders.create"] },
    ],
  },
  {
    label: "Products",
    icon: UtensilsCrossed,
    items: [
      { href: "/admin/products/menus", label: "Menus", icon: UtensilsCrossed, perms: ["menu.view", "menu.edit"] },
      { href: "/admin/products/catalog", label: "Catalog", icon: Package, perms: ["menu.view", "menu.edit"] },
      { href: "/admin/products/deals", label: "Deals", icon: Gift, perms: ["menu.view", "menu.edit"] },
      { href: "/admin/products/promotions", label: "Promotions", icon: Percent, perms: ["menu.view", "menu.edit"] },
      { href: "/admin/products/quick-add", label: "Quick Add Menu", icon: Zap, perms: ["menu.view", "menu.edit"] },
      { href: "/admin/products/categories", label: "Categories", icon: Layers, perms: ["menu.view", "menu.edit"] },
      { href: "/admin/products/modifier-groups", label: "Modifier groups", icon: SlidersHorizontal, perms: ["menu.view", "menu.edit"] },
      { href: "/admin/products/tax-rates", label: "Tax rates", icon: Tag },
      { href: "/admin/products/stations", label: "Stations", icon: ChefHat },
    ],
  },
  {
    label: "Inventory",
    icon: Boxes,
    items: [
      { href: "/admin/inventory/stock-in-hand", label: "Stock in Hand", icon: Boxes, perms: STOCK },
      { href: "/admin/inventory/stock-actions", label: "Stock Actions", icon: FileStack, perms: STOCK },
      { href: "/admin/inventory/demand", label: "Demand", icon: TrendingUp, perms: [...STOCK, "purchasing.manage"] },
      { href: "/admin/inventory/items", label: "Items", icon: Package, perms: [...STOCK, "menu.edit"] },
      { href: "/admin/inventory/recipes", label: "Recipes", icon: BookOpenText, perms: [...STOCK, "menu.edit", "menu.view"] },
      { href: "/admin/inventory/order-inventory", label: "Order Inventory", icon: PackageOpen, perms: [...STOCK, "settings.manage"] },
      { href: "/admin/inventory/units", label: "Units", icon: Ruler, perms: [...STOCK, "menu.edit"] },
      { href: "/admin/inventory/settings", label: "Inventory Settings", icon: SlidersHorizontal, perms: [...STOCK, "settings.manage"] },
      { href: "/admin/inventory/sections", label: "Sections", icon: Warehouse, perms: STOCK },
      { href: "/admin/inventory/food-cost", label: "Food cost", icon: PieChart, perms: [...STOCK, "menu.edit", "menu.view"] },
      { href: "/admin/inventory/production", label: "Production", icon: Factory, perms: ["stock.view", "stock.actions"] },
    ],
  },
  {
    label: "Inventory Reports",
    icon: ClipboardList,
    items: [
      { href: "/admin/inventory-reports/daily-stock-sheet", label: "Daily Stock Sheet", icon: ClipboardList, perms: STOCK },
      { href: "/admin/inventory-reports/stock-ledger", label: "Stock Ledger", icon: History, perms: STOCK },
      { href: "/admin/inventory-reports/consumption", label: "Consumption", icon: Flame, perms: STOCK },
      { href: "/admin/inventory-reports/waste-adjustments", label: "Waste & Adjustments", icon: Trash2, perms: STOCK },
      { href: "/admin/inventory-reports/actual-vs-theoretical", label: "Actual vs Theoretical", icon: Scale, perms: STOCK },
      { href: "/admin/inventory-reports/valuation-cogs", label: "Valuation & COGS", icon: Calculator, perms: STOCK },
      { href: "/admin/inventory-reports/ai-stock-forecast", label: "AI Stock Forecast", icon: Sparkles, perms: STOCK },
      { href: "/admin/inventory-reports/deduction-health", label: "Deduction Health", icon: ShieldCheck, perms: STOCK },
    ],
  },
  {
    label: "Purchasing",
    icon: ShoppingCart,
    items: [
      { href: "/admin/purchasing/purchase-orders", label: "Purchase Orders", icon: ShoppingCart, perms: BUY },
      { href: "/admin/purchasing/purchase-returns", label: "Purchase Returns", icon: Undo2, perms: BUY },
      { href: "/admin/purchasing/price-history", label: "Purchase Price History", icon: LineChart, perms: BUY },
      { href: "/admin/purchasing/goods-received", label: "Goods received", icon: FileInput, perms: BUY },
      { href: "/admin/purchasing/payables-aging", label: "Payables aging", icon: CalendarClock, perms: BUY },
      { href: "/admin/purchasing/purchases-report", label: "Purchases report", icon: Receipt, perms: BUY },
    ],
  },
  {
    label: "Suppliers",
    icon: Truck,
    items: [
      { href: "/admin/suppliers", label: "Suppliers", icon: Truck, exact: true, perms: [...BUY, "SUPPLIERS"] },
      { href: "/admin/suppliers/ledger", label: "Supplier Ledger", icon: BookOpen, perms: [...BUY, "SUPPLIER_LEDGER"] },
      { href: "/admin/suppliers/insights", label: "Supplier Insights", icon: Lightbulb, perms: BUY },
      { href: "/admin/suppliers/payments", label: "Supplier Payments", icon: Coins, perms: [...BUY, "SUPPLIER_RECORD_PAYMENT"] },
    ],
  },
  {
    label: "Customers",
    icon: Users,
    items: [
      { href: "/admin/customers", label: "Customers", icon: Users, exact: true, perms: PEOPLE },
      { href: "/admin/customers/ledger", label: "Customer Ledger", icon: BookOpen, perms: PEOPLE },
      { href: "/admin/customers/insights", label: "Customer Insights", icon: Lightbulb, perms: PEOPLE },
      { href: "/admin/customers/payments", label: "Customer Payments", icon: Coins, perms: PEOPLE },
      { href: "/admin/customers/account", label: "Customer Account", icon: Wallet, perms: PEOPLE },
      { href: "/admin/customers/ar-aging", label: "AR Aging", icon: PiggyBank, perms: [...PEOPLE, "reports.view_all", "finance.view"] },
      { href: "/admin/customers/campaigns", label: "Campaigns", icon: Megaphone, perms: ["customers.manage", "settings.manage", "MARKETING_CAMPAIGN"] },
      { href: "/admin/customers/reservations", label: "Reservations", icon: CalendarDays, perms: ["orders.create", "tables.manage", "customers.manage"] },
      { href: "/admin/orders/qr", label: "QR orders", icon: QrCode, perms: ["orders.create", "kitchen.view", "WEB_ORDERS"] },
    ],
  },
  {
    label: "Staff",
    icon: UserCircle,
    items: [
      { href: "/admin/staff/cashiers", label: "Cashiers", icon: UserCircle, perms: STAFF },
      { href: "/admin/staff/sessions", label: "User Sessions", icon: Clock, perms: STAFF },
      { href: "/admin/staff/order-takers", label: "Order Takers", icon: ClipboardSignature, perms: STAFF },
      { href: "/admin/staff/admin-staff", label: "Admin Staff", icon: Shield, perms: STAFF },
      { href: "/admin/staff/roles", label: "Roles", icon: KeyRound, perms: STAFF },
      { href: "/admin/staff/commissions", label: "Commissions", icon: HandCoins, perms: ["staff.manage", "settings.manage", "reports.view_all"] },
    ],
  },
  {
    label: "Finance",
    icon: Landmark,
    items: [
      { href: "/admin/finance/dashboard", label: "Dashboard", icon: Gauge, perms: MONEY },
      { href: "/admin/finance/payment-accounts", label: "Payment Accounts", icon: Landmark, perms: MONEY },
      { href: "/admin/finance/combined-ledger", label: "Combined Ledger", icon: BookOpen, perms: MONEY },
      { href: "/admin/finance/journal-voucher", label: "Journal Voucher", icon: Scroll, perms: MONEY },
      { href: "/admin/finance/chart-of-accounts", label: "Chart of Accounts", icon: ListTree, perms: MONEY },
      { href: "/admin/finance/fixed-assets", label: "Fixed Assets", icon: Building2, perms: MONEY },
      { href: "/admin/finance/liabilities", label: "Liabilities", icon: FileSpreadsheet, perms: MONEY },
      { href: "/admin/finance/equity", label: "Equity", icon: PieChart, perms: MONEY },
      { href: "/admin/finance/balance-sheet", label: "Balance Sheet", icon: Scale, perms: MONEY },
      { href: "/admin/finance/trial-balance", label: "Trial Balance", icon: Calculator, perms: MONEY },
      { href: "/admin/finance/shifts", label: "Shifts", icon: Wallet, perms: ["shifts.any", "reports.view_all", "reports.view_branch", "shifts.own", "MY_TILL"] },
      { href: "/admin/finance/day-close", label: "Day close", icon: CalendarCheck, perms: ["shifts.any", "reports.view_all", "reports.view_branch"] },
      { href: "/admin/finance/tax-invoices", label: "Tax invoices", icon: FileCheck2, perms: MONEY },
      { href: "/admin/expenses/overheads", label: "Overheads", icon: Gauge, perms: ["settings.manage", "expenses.manage", "finance.view"] },
    ],
  },
  {
    label: "Payroll",
    icon: BadgeDollarSign,
    items: [
      { href: "/admin/payroll/overview", label: "Overview", icon: Gauge, perms: ["payroll.manage", "PAYROLL"] },
      { href: "/admin/payroll/employees", label: "Employees", icon: Contact, perms: ["payroll.manage", "staff.manage", "PAYROLL"] },
      { href: "/admin/payroll/advances", label: "Advances", icon: CircleDollarSign, perms: ["payroll.manage", "PAYROLL"] },
      { href: "/admin/payroll/run", label: "Run Payroll", icon: BadgeDollarSign, perms: ["payroll.manage", "PAYROLL"] },
      { href: "/admin/payroll/ledger", label: "Ledger", icon: BookOpen, perms: ["payroll.manage", "PAYROLL"] },
      { href: "/admin/payroll/fingerprint", label: "Fingerprint", icon: Fingerprint, perms: ["payroll.manage", "staff.manage", "PAYROLL"] },
      { href: "/admin/payroll/reports", label: "Reports", icon: BarChart3, perms: ["payroll.manage", "PAYROLL"] },
      { href: "/admin/payroll/settings", label: "Settings", icon: Wallet2, perms: ["payroll.manage", "settings.manage"] },
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
      { href: "/admin/reports/financial", label: "Financial", icon: Landmark, perms: REPORTS },
      { href: "/admin/reports/products-deals", label: "Products & Deals", icon: Package, perms: REPORTS },
      { href: "/admin/reports/categories", label: "Category Report", icon: Layers, perms: REPORTS },
      { href: "/admin/reports/order-takers", label: "Order Takers", icon: ClipboardSignature, perms: REPORTS },
      { href: "/admin/reports/cashiers", label: "Cashiers", icon: UserCircle, perms: REPORTS },
      { href: "/admin/reports/cashier-till", label: "Cashier Till", icon: Wallet, perms: [...REPORTS, "shifts.any"] },
      { href: "/admin/reports/customers", label: "Customers", icon: Users, perms: REPORTS },
      { href: "/admin/reports/customer-ledger", label: "Customer Ledger", icon: BookOpen, perms: REPORTS },
      { href: "/admin/reports/operations", label: "Operations", icon: Activity, perms: REPORTS },
      { href: "/admin/reports/cancelled-modified", label: "Cancelled & Modified Orders", icon: Undo2, perms: REPORTS },
      { href: "/admin/reports/delivery-riders", label: "Delivery Riders", icon: Bike, perms: REPORTS },
      { href: "/admin/reports/vouchers", label: "Vouchers", icon: Ticket, perms: REPORTS },
      { href: "/admin/reports/loyalty-points", label: "Loyalty Points", icon: Star, perms: REPORTS },
      { href: "/admin/reports/regular-discounts", label: "Regular Discounts", icon: Percent, perms: REPORTS },
      { href: "/admin/reports/ai-pricing", label: "AI Pricing", icon: Sparkles, perms: REPORTS },
      { href: "/admin/reports/schedules", label: "Scheduled reports", icon: CalendarRange, perms: ["reports.view_all", "settings.manage"] },
      { href: "/admin/reports/branches", label: "Branch comparison", icon: GitCompare, perms: ["finance.view", "reports.view_all"] },
      { href: "/admin/reports/foodpanda", label: "Foodpanda", icon: Bike, perms: ["finance.view", "reports.view_all"] },
    ],
  },
  {
    label: "Riders",
    icon: Bike,
    items: [
      { href: "/admin/riders/manage", label: "Manage Riders", icon: Bike, perms: RIDERS },
      { href: "/admin/riders/vault", label: "Rider Vault", icon: Wallet, perms: RIDERS },
      { href: "/admin/riders/reports", label: "Rider Reports", icon: BarChart3, perms: RIDERS },
      { href: "/admin/riders/app", label: "Rider App", icon: MonitorSmartphone, perms: RIDERS },
      { href: "/admin/riders/delivery-board", label: "Delivery board", icon: Route, perms: ["orders.create", "reports.view_all", "staff.manage", "SALES_DELIVERY"] },
      { href: "/admin/riders/zones", label: "Zones", icon: MapPinned, perms: ["settings.manage", "orders.create", "menu.view"] },
    ],
  },
  {
    label: "Settings",
    icon: Settings,
    items: [
      { href: "/admin/settings/store", label: "Store", icon: Store, perms: SETTINGS },
      { href: "/admin/settings/store-management", label: "Store Management", icon: Building2, perms: SETTINGS },
      { href: "/admin/settings/business-hours", label: "Business Hours", icon: Timer, perms: SETTINGS },
      { href: "/admin/settings/point-of-sale", label: "Point of Sale", icon: MonitorSmartphone, perms: SETTINGS },
      { href: "/admin/settings/charges-tax", label: "Charges & Tax", icon: Percent, perms: SETTINGS },
      { href: "/admin/settings/security-cash", label: "Security & Cash", icon: Lock, perms: SETTINGS },
      { href: "/admin/settings/payment-methods", label: "Payment Methods", icon: CreditCard, perms: SETTINGS },
      { href: "/admin/settings/plan", label: "Plan", icon: BadgeDollarSign, perms: ["billing.manage", "settings.manage"] },
      { href: "/admin/settings/whatsapp", label: "WhatsApp", icon: MessageCircle, perms: SETTINGS },
      { href: "/admin/settings/website", label: "Website Config", icon: Globe, perms: SETTINGS },
      { href: "/admin/settings/notifications", label: "Notifications", icon: Bell, perms: SETTINGS },
      { href: "/admin/settings/loyalty-points", label: "Loyalty Points", icon: Star, perms: ["settings.manage", "customers.view", "orders.create"] },
      { href: "/admin/settings/regular-discounts", label: "Regular Discounts", icon: Percent, perms: SETTINGS },
      { href: "/admin/settings/vouchers", label: "Vouchers", icon: Ticket, perms: SETTINGS },
      { href: "/admin/settings/reviews", label: "Reviews", icon: Star, perms: SETTINGS },
      { href: "/admin/settings/audit-logs", label: "Audit Logs", icon: ScrollText, perms: ["audit.view", "reports.view_all"] },
      { href: "/admin/settings/devices", label: "Signed-in devices", icon: Printer, perms: ["devices.manage", "settings.manage"] },
      { href: "/admin/settings/qr", label: "QR ordering", icon: QrCode, perms: SETTINGS },
      { href: "/admin/settings/checklist", label: "Setup checklist", icon: ListChecks },
      { href: "/admin/settings/checklists", label: "Opening and closing", icon: ClipboardCheck, perms: ["settings.manage", "shifts.any", "shifts.own"] },
      { href: "/admin/settings/needs-attention", label: "Needs attention", icon: RefreshCw },
      { href: "/admin/settings/integrations", label: "Integrations", icon: Plug, perms: ["settings.manage", "finance.view"] },
    ],
  },
];
