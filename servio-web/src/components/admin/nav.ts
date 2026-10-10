import { ShoppingBag, LayoutDashboard, ClipboardList, FileStack, Trash2, Ruler, Warehouse, ReceiptText, UtensilsCrossed, Layers, Package, SlidersHorizontal, Gift, Percent, Landmark, Wallet, CalendarCheck, FileCheck2, PiggyBank, Users, UserCircle, Shield, MonitorSmartphone, BarChart3, Settings, Building2, CreditCard, ListChecks, ScrollText, RefreshCw, Grid3X3, ChefHat, Tag, Boxes, BookOpenText, PieChart, Factory, PackageOpen, Flame, ShieldCheck, Truck, ShoppingCart, FileInput, Undo2, CalendarClock, TrendingUp, Receipt, Banknote, Gauge, Bike, MapPinned, QrCode, CalendarRange, Route, Star, Megaphone, CalendarDays, HandCoins, ClipboardCheck, Scale, GitCompare, Bike as FoodpandaIcon, Plug, Contact, BadgeDollarSign, Fingerprint, Wallet2, CircleDollarSign, type LucideIcon } from "lucide-react";

export interface NavItem { href: string; label: string; icon: LucideIcon; perms?: string[]; soon?: boolean; exact?: boolean }
export interface NavGroup { label: string; icon: LucideIcon; items: NavItem[] }

export const NAV: NavGroup[] = [
  {
    label: "Sell",
    icon: ShoppingBag,
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/orders", label: "Orders", icon: ReceiptText },
      { href: "/admin/tables", label: "Tables and floors", icon: Grid3X3, perms: ["tables.manage", "orders.create"] },
      { href: "/admin/qr-orders", label: "QR orders", icon: QrCode, perms: ["orders.create", "kitchen.view"] },
      { href: "/admin/reservations", label: "Reservations", icon: CalendarDays, perms: ["orders.create", "tables.manage", "customers.manage"] },
    ],
  },
  {
    label: "Menu",
    icon: UtensilsCrossed,
    items: [
      { href: "/admin/menu/menus", label: "Menus", icon: UtensilsCrossed, perms: ["menu.view", "menu.edit"] },
      { href: "/admin/menu/categories", label: "Categories", icon: Layers, perms: ["menu.view", "menu.edit"] },
      { href: "/admin/menu/products", label: "Products", icon: Package, perms: ["menu.view", "menu.edit"] },
      { href: "/admin/menu/modifier-groups", label: "Modifier groups", icon: SlidersHorizontal, perms: ["menu.view", "menu.edit"] },
      { href: "/admin/menu/deals", label: "Deals", icon: Gift, perms: ["menu.view", "menu.edit"] },
      { href: "/admin/menu/promotions", label: "Promotions", icon: Percent, perms: ["menu.view", "menu.edit"] },
      { href: "/admin/menu/tax-rates", label: "Tax rates", icon: Tag },
      { href: "/admin/menu/stations", label: "Stations", icon: ChefHat },
    ],
  },
  {
    label: "Money",
    icon: Wallet,
    items: [
      { href: "/admin/shifts", label: "Shifts", icon: Wallet, perms: ["shifts.any", "reports.view_all", "reports.view_branch", "shifts.own"] },
      { href: "/admin/day-close", label: "Day close", icon: CalendarCheck, perms: ["shifts.any", "reports.view_all", "reports.view_branch"] },
      { href: "/admin/accounts", label: "Payment accounts", icon: Landmark, perms: ["finance.view", "settings.manage", "shifts.any"] },
      { href: "/admin/tax-invoices", label: "Tax invoices", icon: FileCheck2, perms: ["settings.manage", "reports.view_all", "reports.view_branch", "finance.view"] },
      { href: "/admin/customers/aging", label: "Khata aging", icon: PiggyBank, perms: ["customers.view", "customers.manage", "khata.collect", "reports.view_all", "finance.view"] },
      { href: "/admin/expenses", label: "Expenses", icon: Banknote, exact: true, perms: ["expenses.manage", "finance.view", "reports.view_all"] },
      { href: "/admin/expenses/overheads", label: "Overheads", icon: Gauge, perms: ["settings.manage", "expenses.manage", "finance.view"] },
      { href: "/admin/finance", label: "Finance", icon: Scale, perms: ["finance.view", "reports.view_all"], soon: true },
    ],
  },
  {
    label: "Stock",
    icon: Boxes,
    items: [
      { href: "/admin/stock", label: "Stock levels", icon: Boxes, exact: true, perms: ["stock.view", "stock.actions", "stock.count", "reports.view_all"] },
      { href: "/admin/stock/items", label: "Stock items", icon: Package, perms: ["stock.view", "stock.actions", "stock.waste", "stock.count", "menu.edit"] },
      { href: "/admin/stock/documents", label: "Documents", icon: FileStack, perms: ["stock.view", "stock.actions", "stock.waste", "stock.count"] },
      { href: "/admin/stock/sheet", label: "Daily sheet", icon: ClipboardList, perms: ["stock.view", "stock.actions", "stock.count", "reports.view_all"] },
      { href: "/admin/stock/waste", label: "Waste", icon: Trash2, perms: ["stock.view", "stock.actions", "stock.count", "reports.view_all"] },
      { href: "/admin/stock/sections", label: "Sections", icon: Warehouse, perms: ["stock.view", "stock.actions", "stock.waste", "stock.count"] },
      { href: "/admin/stock/units", label: "Units", icon: Ruler, perms: ["stock.view", "stock.actions", "stock.waste", "stock.count", "menu.edit"] },
      { href: "/admin/stock/recipes", label: "Recipes", icon: BookOpenText, perms: ["stock.view", "stock.actions", "menu.edit", "menu.view"] },
      { href: "/admin/stock/food-cost", label: "Food cost", icon: PieChart, perms: ["stock.view", "stock.actions", "menu.edit", "menu.view"] },
      { href: "/admin/stock/production", label: "Production", icon: Factory, perms: ["stock.view", "stock.actions"] },
      { href: "/admin/stock/packaging", label: "Packaging", icon: PackageOpen, perms: ["stock.view", "stock.actions", "settings.manage"] },
      { href: "/admin/stock/consumption", label: "Consumption", icon: Flame, perms: ["stock.view", "stock.actions", "reports.view_all"] },
      { href: "/admin/stock/deduction-audits", label: "Deduction audits", icon: ShieldCheck, perms: ["stock.view", "stock.actions", "reports.view_all"] },
      { href: "/admin/stock/settings", label: "Stock settings", icon: SlidersHorizontal, perms: ["stock.view", "stock.actions", "stock.count", "settings.manage"] },
    ],
  },
  {
    label: "Purchasing",
    icon: Truck,
    items: [
      { href: "/admin/purchasing/suppliers", label: "Suppliers", icon: Truck, perms: ["suppliers.manage", "purchasing.manage", "stock.view", "finance.view"] },
      { href: "/admin/purchasing/orders", label: "Purchase orders", icon: ShoppingCart, perms: ["purchasing.manage", "stock.view"] },
      { href: "/admin/purchasing/receipts", label: "Goods received", icon: FileInput, perms: ["purchasing.manage", "stock.view", "stock.actions"] },
      { href: "/admin/purchasing/returns", label: "Returns", icon: Undo2, perms: ["purchasing.manage", "stock.view"] },
      { href: "/admin/purchasing", label: "Payables aging", icon: CalendarClock, exact: true, perms: ["purchasing.manage", "suppliers.manage", "stock.view", "finance.view", "reports.view_all"] },
      { href: "/admin/purchasing/reorder", label: "Reorder and forecast", icon: TrendingUp, perms: ["purchasing.manage", "suppliers.manage", "stock.view", "finance.view", "reports.view_all"] },
      { href: "/admin/purchasing/report", label: "Purchases report", icon: Receipt, perms: ["purchasing.manage", "suppliers.manage", "stock.view", "finance.view", "reports.view_all"] },
    ],
  },
  {
    label: "Delivery",
    icon: Bike,
    items: [
      { href: "/admin/delivery", label: "Delivery board", icon: Route, exact: true, perms: ["orders.create", "reports.view_all", "staff.manage"] },
      { href: "/admin/delivery/riders", label: "Riders", icon: Bike, perms: ["staff.manage", "orders.create", "settings.manage", "reports.view_all"] },
      { href: "/admin/delivery/zones", label: "Zones", icon: MapPinned, perms: ["settings.manage", "orders.create", "menu.view"] },
    ],
  },
  {
    label: "People",
    icon: Users,
    items: [
      { href: "/admin/customers", label: "Customers", icon: Users, perms: ["customers.view", "customers.manage", "orders.create"] },
      { href: "/admin/loyalty", label: "Loyalty", icon: Star, perms: ["settings.manage", "customers.view", "orders.create"] },
      { href: "/admin/campaigns", label: "Campaigns", icon: Megaphone, perms: ["customers.manage", "settings.manage"] },
      { href: "/admin/staff", label: "Staff", icon: UserCircle },
      { href: "/admin/staff/roles", label: "Roles", icon: Shield },
      { href: "/admin/staff/commissions", label: "Commissions", icon: HandCoins, perms: ["staff.manage", "settings.manage", "reports.view_all"] },
      { href: "/admin/devices", label: "Devices", icon: MonitorSmartphone },
    ],
  },
  {
    label: "Payroll",
    icon: BadgeDollarSign,
    items: [
      { href: "/admin/payroll/employees", label: "Employees", icon: Contact, perms: ["payroll.manage", "staff.manage"], soon: true },
      { href: "/admin/payroll/attendance", label: "Attendance", icon: Fingerprint, perms: ["payroll.manage", "staff.manage", "shifts.any"], soon: true },
      { href: "/admin/payroll/runs", label: "Payroll runs", icon: BadgeDollarSign, perms: ["payroll.manage"], soon: true },
      { href: "/admin/payroll/advances", label: "Advances", icon: CircleDollarSign, perms: ["payroll.manage"], soon: true },
      { href: "/admin/payroll/settings", label: "Payroll settings", icon: Wallet2, perms: ["payroll.manage", "staff.manage"], soon: true },
    ],
  },
  {
    label: "Reports",
    icon: BarChart3,
    items: [
      { href: "/admin/reports", label: "Reports", icon: BarChart3, perms: ["reports.view_all", "reports.view_branch", "reports.view_own"] },
      { href: "/admin/reports/schedules", label: "Scheduled reports", icon: CalendarRange, perms: ["reports.view_all", "settings.manage"] },
      { href: "/admin/reports/branches", label: "Branch comparison", icon: GitCompare, perms: ["finance.view", "reports.view_all"], soon: true },
      { href: "/admin/reports/foodpanda", label: "Foodpanda", icon: FoodpandaIcon, perms: ["finance.view", "reports.view_all"], soon: true },
      { href: "/admin/audit", label: "Audit log", icon: ScrollText, perms: ["audit.view", "reports.view_all"] },
      { href: "/admin/sync", label: "Needs attention", icon: RefreshCw },
    ],
  },
  {
    label: "Settings",
    icon: Settings,
    items: [
      { href: "/admin/settings", label: "Business", icon: Settings },
      { href: "/admin/settings/branches", label: "Branches", icon: Building2 },
      { href: "/admin/settings/payment-methods", label: "Payment methods", icon: CreditCard },
      { href: "/admin/settings/qr", label: "QR ordering", icon: QrCode },
      { href: "/admin/settings/checklist", label: "Setup checklist", icon: ListChecks },
      { href: "/admin/settings/checklists", label: "Opening and closing", icon: ClipboardCheck, perms: ["settings.manage", "shifts.any", "shifts.own"], soon: true },
      { href: "/admin/settings/integrations", label: "Integrations", icon: Plug, perms: ["settings.manage", "finance.view"], soon: true },
    ],
  },
];
