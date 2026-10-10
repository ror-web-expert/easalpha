// Types matching servio-api serializers (app/services/*_serializers.rb). Money is integer minor units.

export type ID = string;

export interface ApiErrorShape {
  error: { code: string; message: string; details?: unknown };
}

export interface Page<T> {
  data: T[];
  next_cursor: string | null;
}

export interface User {
  id: ID; name: string; email: string | null; phone: string | null; locale: string | null;
  two_factor_enabled: boolean; last_login_at: string | null;
}

export interface BusinessSettings {
  service_charge_percent?: number | string;
  service_charge_order_types?: string[];
  cash_rounding?: number | string;
  staff_meal_requires_approval?: boolean;
  discount_requires_reason?: boolean;
  kitchen_ticket_print?: boolean;
  default_order_type?: OrderType;
  receipt?: { header?: string; footer?: string; show_logo?: boolean; language?: string; paper?: string };
  [key: string]: unknown;
}

export interface Business {
  id: ID; name: string; slug: string; legal_name: string | null; country: string; currency: string; time_zone: string;
  phone: string | null; email: string | null; status: string; trial_ends_on: string | null; trial_days_left: number;
  plan: { code: string; name: string; features: Record<string, unknown>; limits: Record<string, number> } | null;
  settings: BusinessSettings; read_only: boolean; created_at: string;
}

export interface Branch {
  id: ID; business_id: ID; name: string; code: string; address: string | null; city: string | null; phone: string | null;
  time_zone: string | null; day_end_time: string | null; business_day_start?: string | null; business_day_window?: string | null;
  tax_registration: Record<string, string> | null;
  opening_hours: Record<string, unknown> | null; qr_settings?: Partial<QrSettings> | null; is_main: boolean; archived_at: string | null;
}

// ---- Settings store (SPEC "Settings and multi-outlet"): typed keys grouped by screen, with a version tills compare. ----
export type SettingType = "string" | "boolean" | "integer" | "number" | "json" | "pin";
export interface SettingKey {
  key: string; group: string; screen: string; type: SettingType; label: string;
  /** Secrets (pins, tokens) come back as "set" or null, never the real value. */
  value: unknown; default: unknown;
}
export interface SettingsGroup { name: string; screens: Record<string, SettingKey[]> }
export interface SettingsResponse { version: number; groups: Record<string, SettingsGroup> }

export interface RoleRef { id: ID; name: string; system_key: string | null }

export type StaffType = "admin" | "cashier" | "order_taker" | "rider";
export type CashierRole = "cashier" | "supervisor" | "kitchen_display";
export type PermissionsMode = "role" | "custom";

export interface Membership {
  id: ID; business_id: ID; user_id: ID; role: RoleRef; status: string; all_branches: boolean; branch_ids: ID[];
  has_pin: boolean; pin_locked: boolean; invited_via: string | null; created_at: string; deactivated_at: string | null;
  staff_type: StaffType; cashier_role: CashierRole | null; permissions_mode: PermissionsMode;
  user?: User;
}

export interface Role {
  id: ID; name: string; system_key: string | null; is_system: boolean; copied_from_role_id: ID | null;
  permissions: { code: string; limit: number | string | null }[]; archived_at: string | null;
}

export type PermissionSurface = "software" | "app" | "both";
/** One entry of GET /roles/permissions. SPEC codes are UPPER_SNAKE (spec: true); Servio codes are dotted (module "Servio extras"). */
export interface Permission {
  code: string; module: string; label: string; description: string; surface: PermissionSurface; restriction: boolean; implies: string[]; spec: boolean;
}
export interface PermissionRegistry { data: Permission[]; modules: string[] }
export type PermissionPresetKey = "cashier" | "supervisor" | "manager";
export interface PermissionPreset { key: PermissionPresetKey; name: string; codes: string[] }
/** GET/PUT /staff/:id/permissions */
export interface MembershipPermissions {
  membership_id: ID; mode: PermissionsMode; owner: boolean; granted: string[]; effective: string[];
  modules: { name: string; total: number; granted: number }[]; takes_effect: string;
}
/** GET /staff/sessions */
export interface UserSession {
  id: ID; membership_id: ID | null; user_id: ID | null; name: string | null; staff_type: StaffType | null; app: string | null;
  device_id: ID | null; device: string | null; ip: string | null; user_agent: string | null;
  signed_in_at: string; signed_out_at: string | null; expires_at: string | null; active: boolean;
}

export interface Device {
  id: ID; branch_id: ID; name: string; code: string; kind: string; station_id: ID | null; paired: boolean;
  paired_at: string | null; platform: string | null; app_version: string | null; last_sync_at: string | null;
  last_seen_at: string | null; revoked_at: string | null; pairing_code?: string | null; pairing_expires_at?: string | null;
}

export interface AuditLog {
  id: ID; action: string; table_name: string | null; record_id: ID | null; user_id: ID | null; device_id: ID | null;
  approved_by_user_id: ID | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null;
  ip: string | null; occurred_at: string;
  user_name?: string | null; approved_by_name?: string | null;
}

export interface AuditEntities { data: string[]; actions: string[] }
export interface AuditInsights {
  total: number; by_action: Record<string, number>; by_entity: Record<string, number>;
  by_actor: { user_id: ID | null; name: string; count: number }[]; by_day: Record<string, number>;
}

export interface ChecklistItem { id: ID; key: string; title: string; done: boolean; done_at: string | null; plan_feature_off: boolean; sort_order: number }

export interface BusinessRef { id: ID; name: string; slug: string; role: string; membership_id?: ID }

export interface Session {
  access_token: string; refresh_token: string; token_type: string; expires_in: number; app: string;
  user: User; business: Business; branch: Branch | null; membership: Membership; permissions: string[]; businesses: BusinessRef[];
}

// ---- Menu ----
export interface TaxRate { id: ID; name: string; rate: number; inclusive: boolean; authority: string | null; active: boolean; is_default: boolean }
export interface Station { id: ID; branch_id: ID; name: string; printer_name: string | null; display_device_id: ID | null; sort_order: number }
export interface Menu {
  id: ID; name: string; show_online: boolean; time_rules: Record<string, unknown> | null; sort_order: number; is_default: boolean;
  archived_at: string | null; category_count: number | null; created_at: string; available_now?: boolean; categories?: Category[];
}
export interface Category {
  id: ID; menu_id: ID; name: string; name_ur: string | null; image_key: string | null; sort_order: number; show_online: boolean;
  station_id: ID | null; product_count: number | null; archived_at: string | null;
}
export interface Variant { id: ID; product_id: ID; name: string; price_minor: number; sku: string | null; sort_order: number }
export interface ProductPrice { id?: ID; variant_id: ID | null; branch_id: ID | null; order_type: string; price_minor: number }
export interface Product {
  id: ID; category_id: ID; name: string; name_ur: string | null; description: string | null; sku: string | null; image_key: string | null;
  base_price_minor: number; tax_rate_id: ID | null; is_favourite: boolean; show_online: boolean; active: boolean; sold_by_weight: boolean;
  weight_unit: string | null; allergens: string[] | null; dietary_tags: string[] | null; station_id: ID | null; sort_order: number;
  archived_at: string | null; updated_at: string; variants?: Variant[]; prices?: ProductPrice[]; modifier_group_ids?: ID[];
}
export interface Modifier { id: ID; name: string; name_ur: string | null; price_minor: number; sort_order: number; active: boolean }
export interface ModifierGroup { id: ID; name: string; min_select: number; max_select: number | null; required: boolean; sort_order: number; modifiers: Modifier[] }
export interface DealItem { id?: ID; product_id: ID; variant_id: ID | null; quantity: number; choice_group: string | null }
export interface Deal {
  id: ID; name: string; description: string | null; image_key: string | null; price_minor: number; active: boolean; show_online: boolean;
  valid_from: string | null; valid_to: string | null; tax_rate_id: ID | null; sort_order: number; items: DealItem[];
}
export interface Promotion {
  id: ID; name: string; kind: string; value: number; coupon_code: string | null; applies_to: string | null; target_ids: ID[] | null; days: string[] | null;
  start_time: string | null; end_time: string | null; valid_from: string | null; valid_to: string | null; unit_limit: number | null; units_sold: number;
  sold_out: boolean; active: boolean; min_order_minor: number | null;
}

export interface Catalog {
  generated_at: string;
  business: { id: ID; name: string; currency: string; time_zone: string; settings: BusinessSettings };
  branch: Branch | null;
  tax_rates: TaxRate[]; stations: Station[]; menus: Menu[]; categories: Category[]; products: Product[];
  modifier_groups: ModifierGroup[]; deals: Deal[]; promotions: Promotion[]; since: string | null;
}

// ---- Orders ----
export type OrderType = "dine_in" | "takeaway" | "delivery" | "walk_in";
export type OrderStatus = "draft" | "held" | "placed" | "preparing" | "ready" | "served" | "dispatched" | "paid" | "closed" | "voided" | "refunded";
export const OPEN_STATUSES: OrderStatus[] = ["draft", "held", "placed", "preparing", "ready", "served", "dispatched"];

export interface OrderItemModifier { id?: ID; modifier_id: ID | null; name: string; price_minor: number; quantity: string | number }
export interface OrderItem {
  id: ID; product_id: ID | null; variant_id: ID | null; deal_id: ID | null; name: string; unit_price_minor: number; quantity: string;
  unit: string | null; modifiers_minor: number; line_subtotal_minor: number; line_discount_minor: number; line_tax_minor: number; line_total_minor: number;
  tax_rate: number; tax_inclusive: boolean; notes: string | null; station_id: ID | null; course: number; status: string; sent_at: string | null;
  bumped_at: string | null; cancelled_reason: string | null; open_item: boolean; price_overridden: boolean; deal_components: Record<string, unknown>[] | null;
  sort_order: number; modifiers: OrderItemModifier[];
}
export interface OrderSummary {
  id: ID; serial: number | null; label: string; till_serial: string | null; business_day: string; order_type: OrderType; source: string;
  status: OrderStatus; payment_status: string; table_id: ID | null; table_code: string | null; guest_name: string | null; covers: number | null;
  customer_id: ID | null; rider_id: ID | null; shift_id: ID | null; is_staff_meal: boolean;
  subtotal_minor: number; discount_minor: number; service_charge_minor: number; tax_minor: number; rounding_minor: number; tip_minor: number;
  delivery_charge_minor: number; total_minor: number; paid_minor: number; due_minor: number; item_count: number;
  placed_at: string | null; ready_at: string | null; served_at: string | null; paid_at: string | null; closed_at: string | null; voided_at: string | null;
  void_reason: string | null; notes: string | null; payment_method_summary: string | null; receipt_number: string | null;
  taken_by_membership_id: ID | null; device_id: ID | null; client_created_at: string | null; created_at: string; updated_at: string;
}
export interface OrderDiscount {
  id: ID; order_item_id: ID | null; promotion_id: ID | null; kind: string; value: number; amount_minor: number; reason: string | null;
  applied_by_membership_id: ID | null; approved_by_membership_id: ID | null;
}
export interface Order extends OrderSummary {
  items: OrderItem[];
  discounts: OrderDiscount[];
  events: { from: string | null; to: string; membership_id: ID | null; device_id: ID | null; reason: string | null; at: string }[];
  voids: { id: ID; reason: string; stock_action: string | null; amount_minor: number; by_membership_id: ID | null; approved_by_membership_id: ID | null; at: string }[];
  service_charge_percent: number; staff_meal_reason: string | null;
}
export interface KitchenOrder extends OrderSummary { items: OrderItem[]; elapsed_seconds: number }
export interface KitchenTicket {
  id: ID; order_id: ID; station_id: ID | null; kind: string; serial: number | null; order_type: OrderType; table_code: string | null;
  lines: Record<string, unknown>[]; printed_at: string | null; acknowledged_at: string | null; created_at: string;
}
export interface ReadyOrder { id: ID; serial: number | null; label: string; order_type: OrderType; ready_at: string | null }

export interface OrderLineInput {
  id?: ID; product_id?: ID; variant_id?: ID | null; deal_id?: ID; quantity: number; notes?: string | null; course?: number;
  modifiers?: { modifier_id: ID; quantity?: number }[]; open_item?: { name: string; price_minor: number }; price_override_minor?: number | null;
  deal_choices?: { product_id: ID; variant_id?: ID | null; quantity?: number }[];
}
export interface OrderInput {
  id?: ID; order_type: OrderType; source?: string; table_id?: ID | null; guest_name?: string | null; covers?: number | null; customer_id?: ID | null;
  notes?: string | null; client_created_at?: string; till_serial?: string | null; lines?: OrderLineInput[]; place?: boolean;
  is_staff_meal?: boolean; staff_meal_reason?: string | null; approver_pin?: string; delivery_charge_minor?: number; address_id?: ID | null;
}

export interface OrdersSummary {
  business_day: string; orders: number; paid_orders: number; open_orders: number; voided_orders: number; revenue_minor: number; open_minor: number;
  voided_minor: number; discount_minor: number; tax_minor: number; service_charge_minor: number; average_order_minor: number;
  by_type: Record<string, number>; by_status: Record<string, number>; by_source: Record<string, number>; staff_meals: number;
}

// ---- Payments ----
export interface PaymentMethod {
  id: ID; code: string; name: string; kind: string; payment_account_id: ID | null; active: boolean; works_offline: boolean; needs_reference: boolean; sort_order: number;
}
export interface Payment {
  id: ID; order_id: ID; method_code: string; amount_minor: number; tendered_minor: number | null; change_minor: number; tip_minor: number;
  reference: string | null; card_terminal_ref: string | null; status: string; received_by_membership_id: ID | null; shift_id: ID | null;
  business_day: string; received_at: string;
}
export interface PaymentInput { id?: ID; method_code: string; amount_minor: number; tendered_minor?: number; reference?: string; card_terminal_ref?: string; client_created_at?: string }
export interface Refund { id: ID; order_id: ID; method_code: string; amount_minor: number; reason: string; by_membership_id: ID | null; approved_by_membership_id: ID | null; business_day: string; refunded_at: string }
export interface PaymentAccount {
  id: ID; branch_id: ID | null; name: string; kind: string; is_default: boolean; cashier_membership_id: ID | null; shift_id: ID | null;
  opening_balance_minor: number; current_balance_minor: number; active: boolean; bank_name: string | null; account_no: string | null;
}
export interface AccountEntry {
  id: ID; payment_account_id: ID; kind: string; amount_minor: number; business_day: string; ref_table: string | null; ref_id: ID | null;
  description: string | null; by_membership_id: ID | null; shift_id: ID | null; reversed_by_entry_id: ID | null; occurred_at: string;
}
export interface CustomerPayment {
  id: ID; number: string; customer_id: ID; direction: string; amount_minor: number; method_code: string | null; reference: string | null;
  collected_by_membership_id: ID | null; business_day: string; received_at: string;
}

export interface Receipt {
  receipt_number: string | null; duplicate: boolean; printed_at: string;
  business: { name: string; legal_name: string | null; phone: string | null; logo_key: string | null; currency: string };
  branch: { name: string; address: string | null; city: string | null; phone: string | null; tax_registration: Record<string, string> | null };
  header: string | null; footer: string | null; language: string; paper: string;
  order: { id: ID; serial: number | null; label: string; order_type: OrderType; table: string | null; business_day: string; placed_at: string | null; paid_at: string | null;
    cashier: string | null; customer: { name: string; phone: string | null; khata_no: string | null } | null; guest_name: string | null; notes: string | null };
  lines: { name: string; quantity: string; unit_price_minor: number; modifiers: { name: string; price_minor: number }[]; line_total_minor: number; discount_minor: number; notes: string | null }[];
  totals: { subtotal_minor: number; discount_minor: number; service_charge_minor: number; tax_minor: number; tax_lines: { rate: number; inclusive: boolean; taxable_minor: number; tax_minor: number }[];
    delivery_charge_minor: number; rounding_minor: number; tip_minor: number; total_minor: number; paid_minor: number; due_minor: number };
  payments: { method: string; amount_minor: number; tendered_minor: number | null; change_minor: number; reference: string | null }[];
  refunds: { method: string; amount_minor: number; reason: string }[];
  khata: { balance_minor: number } | null;
  tax_invoice: { number: string | null; qr: string | null; status: string; authority?: string | null };
  feedback_whatsapp: string | null;
}

export interface PaymentResult { order: Order; payments: Payment[]; change_minor: number; receipt: Receipt | null }

// ---- Shifts ----
export interface CashMovement { id: ID; shift_id: ID; kind: string; amount_minor: number; reason: string | null; reference: string | null; by_membership_id: ID | null; approved_by_membership_id: ID | null; occurred_at: string }
export interface Shift {
  id: ID; branch_id: ID; device_id: ID | null; cashier_membership_id: ID; drawer_account_id: ID | null; business_day: string; status: string;
  settlement_status: string; opened_at: string; closed_at: string | null; opening_cash_minor: number; counted_cash_minor: number | null;
  approved_by_membership_id: ID | null; close_note: string | null; movements: CashMovement[]; expected_cash_minor?: number; over_short_minor?: number | null;
  cashier?: string | null; net_sales_minor?: number | null;
}
export interface ZReport {
  shift_id: ID; business_day: string; opened_at: string; closed_at: string; cashier: string | null;
  orders: { total: number; paid: number; voided: number; open: number; staff_meals: number };
  sales: { gross_minor: number; discount_minor: number; service_charge_minor: number; tax_minor: number; rounding_minor: number; tips_minor: number; net_minor: number };
  by_payment_method: Record<string, number>; by_order_type: Record<string, number>;
  refunds: { count: number; amount_minor: number }; voids: { count: number; amount_minor: number }; discounts: { count: number; amount_minor: number };
  cash: { opening_minor: number; cash_sales_minor: number; cash_in_minor: number; cash_out_minor: number; expected_minor: number; counted_minor: number | null; over_short_minor: number | null };
  khata: { collected_minor: number; on_account_minor: number };
  movements: { kind: string; amount_minor: number; reason: string | null; at: string }[];
}
export interface DayCloseStatus {
  business_day: string; locked: boolean; locked_at: string | null; reopened_at: string | null;
  shifts: { total: number; open: number; unsettled: number }; open_orders: number; drafts: number; ready: boolean;
  summary: { orders: number; paid: number; voided: number; net_sales_minor: number; discount_minor: number; tax_minor: number; by_payment_method: Record<string, number>; refunds_minor: number;
    shifts: { id: ID; cashier_membership_id: ID; over_short_minor: number | null; status: string }[] } | null;
}

// ---- Customers ----
export interface Address { id: ID; customer_id: ID; label: string | null; line1: string | null; line2: string | null; area: string | null; city: string | null; lat: number | null; lng: number | null; is_default: boolean; text: string }
export interface Customer {
  id: ID; khata_no: string | null; name: string; phone: string | null; email: string | null; company: string | null; group_id: ID | null; source: string; status: string;
  is_walk_in: boolean; credit_limit_minor: number | null; balance_minor: number; loyalty_points: number; birthday: string | null; whatsapp_opt_in: boolean;
  orders_count: number; net_spent_minor: number; last_order_at: string | null; notes: string | null; archived_at: string | null; created_at: string;
  addresses?: Address[]; group?: { id: ID; name: string; discount_percent: number } | null;
}
export interface CustomerGroup { id: ID; name: string; discount_percent: number; customer_count: number | null; archived_at: string | null }
export interface LedgerEntry {
  at: string; kind: string; amount_minor: number; order_id?: ID; order_label?: string; business_day: string; ref: ID; number?: string; method?: string | null; reference?: string | null; balance_minor: number;
}
export interface Aging { current: number; "31_60": number; "61_90": number; over_90: number; total: number }
export interface Ledger { customer: Customer; balance_minor: number; aging: Aging; entries: LedgerEntry[] }
export interface AgingReport { as_of: string; rows: { customer: Customer; aging: Aging }[]; totals: Aging; customers_with_due: number }
export interface CustomerLookup { found: boolean; phone?: string | null; customer?: Customer; last_order?: Order | null }

// ---- Tables ----
export interface DiningTable {
  id: ID; branch_id: ID; floor_id: ID | null; code: string; name: string | null; seats: number; location: string | null; status: string;
  position: { x?: number; y?: number; w?: number; h?: number } | null; qr_token: string | null; merged_into_table_id: ID | null; current_order_id: ID | null;
  waiter_membership_id: ID | null; current_order?: OrderSummary | null; archived_at: string | null;
}
export interface Floor { id: ID; branch_id: ID; name: string; sort_order: number; layout: Record<string, unknown> | null; tables?: DiningTable[] }

// ---- Sync ----
export type SyncRecordType = "order" | "order_update" | "payment" | "refund" | "void" | "shift_open" | "shift_close" | "cash_movement";
export interface SyncRecord { type: SyncRecordType; id: ID; membership_id?: ID; payload: Record<string, unknown> }
export interface SyncResult { id: ID; type: string; status: "accepted" | "duplicate" | "rejected"; code?: string; message?: string }
export interface SyncPushResponse { batch_id: ID; results: SyncResult[]; server_time: string }
export interface SyncRejection {
  id: ID; device_id: ID | null; record_type: string; record_id: ID; code: string; message: string; payload: Record<string, unknown>;
  resolved_at: string | null; resolution: string | null; created_at: string;
}
export interface SyncChanges {
  cursor: string; since: string | null; business: Business; branch: Branch; menus: Menu[]; categories: Category[]; products: Product[];
  modifier_groups: ModifierGroup[]; deals: Deal[]; promotions: Promotion[]; tax_rates: TaxRate[]; stations: Station[]; payment_methods: PaymentMethod[];
  floors: Floor[]; tables: DiningTable[]; customers: Customer[]; staff: unknown[]; settings: BusinessSettings; day_locked: boolean;
}

// ---- Tax invoices ----
export interface TaxInvoice {
  id: ID; order_id: ID; order_label: string; authority: string; status: string; invoice_number: string | null; qr_payload: string | null; attempts: number;
  last_error: string | null; next_attempt_at: string | null; sent_at: string | null; total_minor: number | null; created_at: string;
}
export interface TaxQueueSummary { queued: number; failed: number; accepted: number; oldest_pending_at: string | null; last_accepted_at: string | null; registered: boolean; registration: Record<string, string> }

// ---- Reports ----
export interface ReportOverview {
  from: string; to: string; orders: number; revenue_minor: number; subtotal_minor: number; discount_minor: number; tax_minor: number; service_charge_minor: number;
  tips_minor: number; refunds_minor: number; average_order_minor: number; voided: number; voided_minor: number; staff_meals: number; open: number; open_minor: number;
  by_payment_method: Record<string, number>; by_order_type: Record<string, number>; by_source: Record<string, number>; customers: number;
}
export interface ByDayRow { business_day: string; orders: number; revenue_minor: number; discount_minor: number; tax_minor: number }
export interface ByHourRow { hour: number; orders: number; revenue_minor: number }
export interface ItemRow { product_id: ID | null; deal_id: ID | null; name: string; quantity: number; revenue_minor: number; discount_minor: number; orders: number }
export interface CategoryRow { category_id: ID | null; name: string; quantity: number; revenue_minor: number }
export interface CashierRow { membership_id: ID | null; name: string | null; orders: number; revenue_minor: number; discount_minor: number; voids: number }
export interface VoidsReport { from: string; to: string; count: number; amount_minor: number; rows: { order_id: ID; label: string; amount_minor: number; reason: string; stock_action: string | null; by: string | null; approved_by: string | null; at: string }[] }
export interface DiscountsReport { from: string; to: string; count: number; amount_minor: number; by_reason: Record<string, number>; rows: { order_id: ID; label: string; kind: string; value: number; amount_minor: number; reason: string | null; by: string | null; approved_by: string | null; at: string }[] }
export interface ModifiedRow { order_id: ID; label: string; status: string; total_minor: number; tickets: { kind: string; at: string; lines: string[] }[] }
export interface CustomerRow { customer_id: ID; name: string | null; phone: string | null; orders: number; revenue_minor: number; last_order_at: string | null; balance_minor: number | null }
export interface GrandReport { from: string; to: string; overview: ReportOverview; by_day: ByDayRow[]; items: ItemRow[]; categories: CategoryRow[]; cashiers: CashierRow[]; voids: Omit<VoidsReport, "rows">; discounts: Omit<DiscountsReport, "rows">; shifts: Shift[] }
export interface Dashboard {
  business_day: string; today: ReportOverview; yesterday: { orders: number; revenue_minor: number }; same_day_last_week: { orders: number; revenue_minor: number };
  month_to_date: { orders: number; revenue_minor: number; discount_minor: number }; same_period_last_month: { orders: number; revenue_minor: number };
  change_vs_last_week_percent: number | null; change_vs_yesterday_percent: number | null; open_orders: number; open_minor: number; shifts_open: number; day_locked: boolean;
  tax_queue: { queued: number; failed: number }; needs_attention: number; khata_outstanding_minor: number; top_items: ItemRow[]; recent_orders: OrderSummary[];
  trend_7_days: ByDayRow[]; checklist: { key: string; done: boolean }[]; low_stock: unknown;
}

export interface Notification { id: ID; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }

// ---- Stock (Phase 2) ----
export type UnitKind = "weight" | "volume" | "count";
export interface Unit { id: ID; code: string; name: string; kind: UnitKind; factor_to_base: string; is_base: boolean; archived_at: string | null }
export interface StockSection { id: ID; branch_id: ID; name: string; sort_order: number; is_default: boolean; archived_at: string | null }
export interface StockLevelRef { section_id: ID; quantity: string; value_minor: number }
export interface StockItem {
  id: ID; name: string; name_ur: string | null; sku: string | null; category: string | null; barcode: string | null; base_unit: Unit; purchase_unit: Unit | null;
  minimum_qty: string; reorder_qty: string; avg_cost_minor_per_base: string; track_expiry: boolean; is_packaging: boolean; archived_at: string | null; created_at: string;
  levels?: StockLevelRef[]; quantity?: string; value_minor?: number;
}
export type StockDocumentKind = "receive" | "transfer" | "waste" | "adjustment" | "count" | "production" | "supplier_return";
export type StockDocumentStatus = "draft" | "posted" | "cancelled";
export interface StockDocumentLine {
  id: ID; stock_item_id: ID; item_name: string; unit_id: ID; unit_code: string; quantity: string; base_quantity: string; unit_cost_minor: number | null;
  batch_no: string | null; expires_on: string | null; counted_qty: string | null; expected_qty: string | null; note: string | null;
}
export interface StockDocument {
  id: ID; number: number; label: string; kind: StockDocumentKind; status: StockDocumentStatus; branch_id: ID; from_section_id: ID | null; to_section_id: ID | null;
  supplier_id: ID | null; goods_receipt_id: ID | null; reason: string | null; invoice_ref: string | null; note: string | null; business_day: string;
  posted_at: string | null; cancelled_at: string | null; by_membership_id: ID | null; posted_by_membership_id: ID | null; created_at: string;
  line_count: number; total_cost_minor: number; lines?: StockDocumentLine[];
}
export interface StockDocumentLineInput { stock_item_id: ID; unit_id?: ID; quantity?: number | string; unit_cost_minor?: number | null; batch_no?: string | null; expires_on?: string | null; counted_qty?: number | string; note?: string | null }
export interface StockDocumentInput {
  kind: StockDocumentKind; from_section_id?: ID | null; to_section_id?: ID | null; supplier_id?: ID | null; reason?: string | null; invoice_ref?: string | null; note?: string | null;
  client_id?: ID; lines: StockDocumentLineInput[]; post?: boolean;
}
export type StockLedgerKind = "sale" | "sale_return" | "receive" | "transfer_in" | "transfer_out" | "waste" | "adjustment" | "count" | "production_in" | "production_out" | "supplier_return" | "packaging" | "opening";
export interface StockLedgerEntry {
  id: ID; business_day: string; occurred_at: string; kind: StockLedgerKind; section_id: ID | null; section_name: string | null; stock_item_id: ID; item_name: string | null;
  unit_code: string | null; quantity: string; before_qty: string; after_qty: string; unit_cost_minor: string; value_minor: number; reason: string | null; ref_table: string | null;
  ref_id: ID | null; punched_by_membership_id: ID | null; completed_by_membership_id: ID | null; reversed_by_entry_id: ID | null; reverses_entry_id: ID | null;
}
export interface StockLevelRow { item: StockItem; quantity: string; value_minor: number; below_minimum: boolean; negative: boolean; sections: StockLevelRef[] }
export interface StockLevelsReport { rows: StockLevelRow[]; total_value_minor: number; negative_count: number; below_minimum_count: number }
export interface StockValuationRow { section: StockSection; value_minor: number; items: number }
export interface DailySheetRow { item: StockItem; opening: string; in: string; out: string; waste: string; sale: string; adjusted: string; closing: string; closing_value_minor: number }
export interface DailySheet { section: StockSection; business_day: string; rows: DailySheetRow[]; closing_value_minor: number }
export interface WasteRow { key: string; entries: number; quantity: string; value_minor: number; waste_value_minor: number }
export interface WasteReport { from: string; to: string; group_by: "reason" | "item"; rows: WasteRow[]; total_value_minor: number; entries: StockLedgerEntry[] }
export interface InventorySettings {
  day_lock_date: string | null; counting_open: boolean; allow_manual_below_zero: boolean; return_on_cancel: boolean; weight_display: "auto" | "g" | "kg"; volume_display: "auto" | "ml" | "l";
  food_cost_target_percent: number; require_recipe_to_live: boolean; deduct_stock_on_sale: boolean;
}
export interface StockImportRow { line: number; name: string; sku: string | null; category: string | null; unit: string; purchase_unit: string | null; minimum: string | null; reorder: string | null; opening_qty: string | null; cost: string | null; section: string | null; error: string | null }
export interface StockImportPreview { rows: StockImportRow[]; row_count: number; valid_count: number; error_rows: { line: number; name: string; error: string }[] }
export interface StockImportResult { created: number; updated: number; skipped: number; opening_documents: string[] }

// ---- Recipes (Phase 2) ----
export interface FoodCost { cost_minor: number; price_ex_tax_minor: number; percent: number | null; target_percent: number; over_target: boolean }
export interface RecipeLine {
  id: ID; stock_item_id: ID; item_name: string; unit_id: ID; unit_code: string; quantity: string; base_quantity: string; base_unit_code: string; waste_percent: number; cost_minor: number; sort_order: number;
}
export interface Recipe {
  id: ID; name: string; product_id: ID | null; variant_id: ID | null; product_name: string | null; variant_name: string | null; output_stock_item_id: ID | null; output_item_name: string | null;
  yield_qty: string; yield_unit: Unit | null; source_section_id: ID | null; cost_minor: number; unit_cost_minor: number; is_sub_recipe: boolean; line_count: number; notes: string | null;
  archived_at: string | null; updated_at: string; food_cost?: FoodCost | null; lines?: RecipeLine[];
}
export interface RecipeLineInput { stock_item_id: ID; unit_id?: ID; quantity: string | number; waste_percent?: string | number }
export interface RecipeInput {
  id?: ID; product_id?: ID | null; variant_id?: ID | null; output_stock_item_id?: ID | null; name: string; yield_qty?: string | number; yield_unit_id?: ID | null; source_section_id?: ID | null; notes?: string | null; lines: RecipeLineInput[];
}
export interface RecipeCoverage { products: number; with_recipe: number; percent: number; missing: { id: ID; name: string; category_id: ID | null }[] }
export interface RecipeFlag { recipe_id: ID; recipe: string; stock_item_id: ID; item: string; quantity: string; typical: string; unit: string; message: string }
export interface FoodCostRow extends FoodCost { recipe_id: ID; product_id: ID; variant_id: ID | null; name: string; product: string; variant: string | null }
export interface FoodCostReport { target_percent: number; over_target: number; data: FoodCostRow[] }
export interface ProductionBatch {
  id: ID; recipe_id: ID; recipe_name: string; stock_document_id: ID | null; document_label: string | null; stock_section_id: ID | null; quantity_produced: string; cost_minor: number; produced_at: string; by_membership_id: ID | null;
}
export interface PackagingRule { id: ID; branch_id: ID | null; order_type: OrderType; stock_item_id: ID; item_name: string; unit_code: string; quantity: string }
export type DeductionAuditStatus = "ok" | "missing" | "partial" | "reversed" | "waste" | "skipped" | "error";
export interface DeductionAudit {
  id: ID; order_id: ID; order_label: string; business_day: string; status: DeductionAuditStatus; entries: number; detail: { entries?: number; missing?: string[]; error?: string; [k: string]: unknown } | null; checked_at: string;
}
export interface ConsumptionReport { from: string; to: string; rows: { item: StockItem; quantity: string; value_minor: number }[]; total_value_minor: number }

// ---- Suppliers and purchasing (Phase 2) ----
export interface Supplier {
  id: ID; name: string; contact_name: string | null; phone: string | null; email: string | null; address: string | null; ntn: string | null; opening_balance_minor: number; balance_minor: number;
  payment_terms_days: number; notes: string | null; active: boolean; archived_at: string | null; created_at: string;
}
export type PurchaseOrderStatus = "draft" | "sent" | "partial" | "received" | "cancelled";
export interface PurchaseOrderLine {
  id: ID; stock_item_id: ID; item_name: string; unit_id: ID; unit_code: string; quantity: string; base_quantity: string; unit_cost_minor: number; line_total_minor: number;
  received_base_qty: string; outstanding_base_qty: string; base_unit_code: string;
}
export interface PurchaseOrder {
  id: ID; number: number; label: string; status: PurchaseOrderStatus; branch_id: ID; supplier_id: ID; supplier_name: string; expected_on: string | null; total_minor: number; note: string | null;
  sent_at: string | null; received_at: string | null; cancelled_at: string | null; created_at: string; line_count: number; lines?: PurchaseOrderLine[]; receipts?: GoodsReceipt[];
}
export interface PurchaseLineInput { stock_item_id: ID; unit_id?: ID; quantity: string | number; unit_cost_minor?: number | null; batch_no?: string | null; expires_on?: string | null; purchase_order_line_id?: ID }
export type GoodsReceiptStatus = "posted" | "cancelled";
export interface GoodsReceiptLine {
  id: ID; stock_item_id: ID; item_name: string; unit_id: ID; unit_code: string; quantity: string; base_quantity: string; unit_cost_minor: number; line_total_minor: number; batch_no: string | null;
  expires_on: string | null; purchase_order_line_id: ID | null;
}
export interface GoodsReceipt {
  id: ID; number: number; label: string; status: GoodsReceiptStatus; branch_id: ID; supplier_id: ID; supplier_name: string; purchase_order_id: ID | null; stock_document_id: ID | null; stock_section_id: ID | null;
  invoice_ref: string | null; received_on: string; business_day: string | null; total_minor: number; note: string | null; cancelled_at: string | null; created_at: string; line_count: number; lines?: GoodsReceiptLine[];
}
export type ReturnSettlement = "credit_note" | "cash_refund";
export interface PurchaseReturnLine { id: ID; stock_item_id: ID; item_name: string; unit_code: string; quantity: string; unit_cost_minor: number; line_total_minor: number }
export interface PurchaseReturn {
  id: ID; number: number; label: string; status: GoodsReceiptStatus; supplier_id: ID; supplier_name: string; goods_receipt_id: ID | null; stock_document_id: ID | null; reason: string | null;
  settlement: ReturnSettlement; amount_minor: number; payment_method_id: ID | null; returned_on: string; business_day: string | null; created_at: string; lines?: PurchaseReturnLine[];
}
export interface SupplierPayment {
  id: ID; number: number; label: string; supplier_id: ID; direction: "paid" | "received"; amount_minor: number; method_code: string | null; payment_account_id: ID | null; reference: string | null;
  note: string | null; goods_receipt_id: ID | null; paid_on: string; business_day: string; by_membership_id: ID | null; created_at: string;
}
export interface SupplierPrice { id: ID; supplier_id: ID; supplier_name: string; stock_item_id: ID; unit_code: string | null; unit_cost_minor: number; base_unit_cost_minor: string; observed_on: string; goods_receipt_id: ID | null }
export interface SupplierLedgerEntry {
  at: string; kind: "opening" | "receipt" | "return" | "refund_received" | "payment" | "received"; amount_minor: number; number?: string; ref?: ID; business_day?: string; description?: string | null; method?: string | null; balance_minor: number;
}
export interface SupplierLedger { supplier: Supplier; entries: SupplierLedgerEntry[]; aging: Aging }
export interface SupplierInsights {
  from: string; to: string; purchases_minor: number; receipts: number; returns_minor: number; paid_minor: number; payments: number; last_receipt_on: string | null; open_orders: number; balance_minor: number;
  top_items: { item: StockItem; receipts: number; quantity: string; value_minor: number; last_unit_cost_minor: number; unit_code: string }[];
}
export interface PurchasingSummary {
  payables_minor: number; receivables_minor: number; suppliers_with_due: number; suppliers: number; open_purchase_orders: number; open_purchase_orders_minor: number; received_this_month_minor: number; paid_this_month_minor: number;
}
export interface SupplierAgingReport { as_of: string; rows: { supplier: Supplier; aging: Aging }[]; totals: Aging; suppliers_with_due: number }
export interface ReorderSuggestion { item: StockItem; on_hand: string; minimum: string; suggested_qty: string; unit_code: string; supplier: Supplier | null; est_cost_minor: number }
export interface ForecastRow {
  item: StockItem; daily_usage: string; on_hand: string; days_left: number | null; needed: string; order_qty: string; unit_code: string; est_cost_minor: number; supplier: Supplier | null; within_budget?: boolean;
}
export interface Forecast { lookback_days: number; forecast_days: number; safety_percent: string | number; budget_minor: number | null; total_cost_minor: number; within_budget_minor: number; rows: ForecastRow[] }
export interface PurchasingReportRow { key: string; supplier?: Supplier; item?: StockItem; receipts: number; quantity?: string; value_minor: number }
export interface PurchasingReport { from: string; to: string; rows: PurchasingReportRow[]; total_minor: number; returns_minor: number }

// ---- Expenses, overheads, delivery, riders, QR, scheduled reports (Phase 2 admin) ----
export interface ExpenseCategory { id: ID; name: string; parent_id: ID | null; full_name: string; sort_order: number; archived_at: string | null; children: ExpenseCategory[] | null }
export interface Expense {
  id: ID; number: number; label: string; branch_id: ID; category_id: ID; category: string; amount_minor: number; method_code: string | null; payment_account_id: ID | null; shift_id: ID | null;
  receipt_key: string | null; paid_to: string | null; note: string | null; spent_on: string; business_day: string; source: string; by_membership_id: ID | null; voided_at: string | null; void_reason: string | null; created_at: string;
}
export type OverheadKind = "labor" | "gas" | "rent" | "utilities" | "other";
export type OverheadBasis = "per_order" | "per_month" | "per_day";
export interface Overhead { id: ID; branch_id: ID | null; name: string; kind: OverheadKind; amount_minor: number; basis: OverheadBasis; active: boolean }
export interface ExpenseSummary {
  from: string; to: string; days: number; paid_orders: number; total_minor: number; count: number;
  by_category: { category: string; count: number; amount_minor: number }[]; by_subcategory: { category: string; count: number; amount_minor: number }[];
  by_method: { method: string; count: number; amount_minor: number }[]; by_source: Record<string, number>;
  overheads: (Overhead & { allocated_minor: number })[]; overheads_minor: number; cost_per_order_minor: number | null;
}
export interface DeliveryZone { id: ID; branch_id: ID; name: string; areas: string[]; polygon: unknown[] | null; charge_minor: number; min_order_minor: number; eta_minutes: number | null; active: boolean; archived_at: string | null }
export interface ZoneQuote { zone: DeliveryZone | null; charge_minor: number; min_order_minor: number; eta_minutes: number | null }
export type RiderStatus = "available" | "busy" | "offline" | string;
export interface Rider {
  id: ID; branch_id: ID | null; membership_id: ID | null; name: string; phone: string | null; vehicle: string | null; vehicle_no: string | null; address: string | null; charge_per_delivery_minor: number;
  float_minor: number; status: RiderStatus; last_lat: number | null; last_lng: number | null; last_seen_at: string | null; active: boolean; archived_at: string | null; open_deliveries?: number;
}
export type DeliveryStatus = "unassigned" | "assigned" | "picked_up" | "on_the_way" | "arrived" | "delivered" | "failed";
export interface Delivery {
  id: ID; order_id: ID; order_label: string; order_status: OrderStatus; order_total_minor: number; payment_status: string; customer_id: ID | null; guest_name: string | null;
  rider_id: ID | null; rider_name: string | null; zone_id: ID | null; zone_name: string | null; address_id: ID | null; charge_minor: number; status: DeliveryStatus; failed_reason: string | null;
  cash_collected_minor: number | null; assigned_at: string | null; picked_up_at: string | null; delivered_at: string | null; settled_at: string | null; settlement_id: ID | null; created_at: string;
  address?: Address | null; customer?: { id: ID; name: string; phone: string | null } | null; items?: { name: string; quantity: string }[];
  events?: { status: string; lat: number | null; lng: number | null; note: string | null; by_membership_id: ID | null; occurred_at: string }[];
}
export type RiderMovementKind = "issue" | "return" | "spend" | "adjust" | "settle";
export interface RiderMovement { id: ID; rider_id?: ID; kind: RiderMovementKind; amount_minor: number; reason: string | null; expense_id: ID | null; settlement_id: ID | null; business_day: string; occurred_at: string; by_membership_id: ID | null; balance_minor?: number }
export interface RiderStatement { rider: Rider; float_minor: number; rows: RiderMovement[] }
export interface RiderSettlement {
  id: ID; number: number; label: string; rider_id: ID; rider_name: string; shift_id: ID | null; deliveries_count: number; cash_collected_minor: number; float_held_minor: number; spent_minor: number;
  expected_minor: number; handed_in_minor: number; difference_minor: number; note: string | null; settled_by_membership_id: ID | null; settled_at: string;
}
export interface SettlementPreview { rider: Rider; deliveries_count: number; cash_collected_minor: number; float_held_minor: number; expected_minor: number; deliveries: Delivery[] }
export interface QrOrder extends OrderSummary { qr_status: "pending" | "accepted" | "rejected" }
export interface TableRequest { id: ID; table_id: ID; table_code: string; kind: "call_waiter" | "ask_bill"; guest_name: string | null; note: string | null; requested_at: string; handled_at: string | null; handled_by_membership_id: ID | null }
export interface QrSettings { enabled: boolean; cashier_accept: boolean; call_waiter: boolean; ask_bill: boolean; running_bill: boolean; guest_name: boolean; welcome: string | null }
export interface TableQrCard { table_id: ID; code: string; token: string; url: string; enabled: boolean }
export type ReportScheduleKind = "daily_summary" | "sales" | "items" | "cashiers" | "grand" | "stock_sheet" | "expenses" | "payables" | "khata";
export interface ReportSchedule {
  id: ID; branch_id: ID | null; name: string; kind: ReportScheduleKind; cadence: "daily" | "weekly" | "monthly"; hour: number; weekday: number; day_of_month: number; channel: "whatsapp" | "email" | "both";
  recipients: string[]; active: boolean; last_run_at: string | null; next_run_at: string | null; last_error: string | null;
}
export interface QueueOrder { id: ID; serial: number | null; label: string; order_type: OrderType; guest_name: string | null; status: OrderStatus; placed_at: string | null; ready_at: string | null }
export interface KitchenQueue { preparing: QueueOrder[]; ready: QueueOrder[]; at: string }

// ---- Phase 3: loyalty, campaigns, reservations, commissions, checklists, finance, Foodpanda, payroll ----
export interface LoyaltySettings {
  loyalty_enabled: boolean | string; loyalty_rupees_per_point: number | string; loyalty_point_value_minor: number | string; loyalty_min_redeem_points: number | string;
  loyalty_max_redeem_percent: number | string; birthday_discount_percent: number | string; birthday_offer_days: number | string;
}
export type LoyaltyKind = "earn" | "redeem" | "refund" | "adjust";
export interface LoyaltyTransaction { id: ID; kind: LoyaltyKind | string; points: number; balance_after: number; order_id: ID | null; note: string | null; occurred_at: string }
export interface CustomerLoyalty { customer_id: ID; points: number; value_minor: number; transactions: LoyaltyTransaction[] }

export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "cancelled";
export type SegmentKind = "all" | "group" | "inactive" | "birthday_month" | "top_spenders" | "khata_due";
export interface CampaignSegment { kind: SegmentKind | string; group_id?: ID | null; days?: number | string | null; month?: number | string | null; limit?: number | string | null }
export interface CampaignStats { audience: number; sent: number; skipped: number; delivered: number; read: number; failed: number; redeemed: number; opted_out_after: number }
export interface Campaign {
  id: ID; name: string; body: string; segment: CampaignSegment; promotion_id: ID | null; coupon_code: string | null; status: CampaignStatus; scheduled_at: string | null; started_at: string | null;
  finished_at: string | null; audience_count: number; sent_count: number; skipped_count: number; created_at: string; stats?: CampaignStats;
}
export interface CampaignAudience { total: number; reachable: number; not_opted_in: number }

export type ReservationStatus = "booked" | "confirmed" | "seated" | "completed" | "no_show" | "cancelled";
export interface Reservation {
  id: ID; branch_id: ID; table_id: ID | null; table_code: string | null; customer_id: ID | null; guest_name: string; phone: string | null; party_size: number; starts_at: string; ends_at: string;
  deposit_minor: number; deposit_payment_id: ID | null; status: ReservationStatus; notes: string | null; reminder_sent_at: string | null; seated_at: string | null; order_id: ID | null; created_at: string;
}
export interface ReservationAvailability { starts_at: string; ends_at: string; tables: { id: ID; code: string; name: string | null; seats: number; location: string | null }[] }

export type CommissionAppliesTo = "order_taker" | "waiter" | "cashier" | "rider";
export type CommissionBasis = "percent_of_sales" | "per_order" | "per_item";
export interface CommissionRule { id: ID; name: string; applies_to: CommissionAppliesTo; role_key: string | null; membership_id: ID | null; basis: CommissionBasis; value: number; active: boolean }
export interface CommissionRow { membership_id: ID; applies_to: CommissionAppliesTo; orders: number; items: number; sales_minor: number; name: string; role: string; rules: string[]; commission_minor: number }
export interface CommissionReport { from: string; to: string; rows: CommissionRow[]; total_commission_minor: number }

export type ChecklistKind = "opening" | "closing";
export interface ChecklistTemplateItem { key: string; label: string }
export interface ChecklistTemplate { id: ID; kind: ChecklistKind; branch_id: ID | null; items: ChecklistTemplateItem[]; required_for_shift: boolean }
export interface ChecklistRunItem extends ChecklistTemplateItem { done: boolean; by_membership_id?: ID | null; at?: string | null }
export interface ChecklistRun { id: ID; kind: ChecklistKind; business_day: string; shift_id: ID | null; items: ChecklistRunItem[]; done_count: number; total_count: number; completed_at: string | null; completed_by_membership_id: ID | null }

export interface FinanceLedgerRow {
  id: ID; occurred_at: string; account_id: ID; account: string | null; account_kind: string | null; kind: string; amount_minor: number; description: string | null; ref_table: string | null; ref_id: ID | null;
  by_membership_id: ID | null; shift_id: ID | null; reversed: boolean;
}
export interface FinanceLedger { business_day: string; rows: FinanceLedgerRow[]; by_kind: Record<string, number>; by_account: { account_id: ID; account: string | null; kind: string | null; net_minor: number }[]; in_minor: number; out_minor: number }
export interface FinanceReconciliation {
  business_day: string; paid_orders: number; sales_minor: number; payments_minor: number; by_method: Record<string, number>; khata_minor: number; expected_posted_minor: number; posted_minor: number; difference_minor: number;
  refunds_minor: number; posted_refunds_minor: number; refund_difference_minor: number; balanced: boolean;
}
export interface FinanceIssue { kind: string; detail: string; order_id?: ID; label?: string; business_day?: string; payment_id?: ID; account_id?: ID; entry_id?: ID }
export interface FinanceIntegrity { from: string; to: string; ok: boolean; issues: FinanceIssue[]; checked_at: string }
export interface ProfitLoss {
  from: string; to: string; orders: number;
  revenue: { gross_sales_minor: number; discounts_minor: number; service_charge_minor: number; delivery_charge_minor: number; refunds_minor: number; net_sales_minor: number; tax_collected_minor: number };
  cost_of_goods_minor: number; gross_profit_minor: number; gross_margin_percent: number | null;
  operating: { expenses_minor: number; expenses_by_category: { category: string; count: number; amount_minor: number }[]; overheads_minor: number; overheads: (Overhead & { allocated_minor: number })[]; commissions_minor: number; aggregator_commission_minor: number; waste_minor: number; total_minor: number };
  net_profit_minor: number; net_margin_percent: number | null;
}
export interface BranchCompareRow {
  branch: Branch; orders: number; revenue_minor: number; average_order_minor: number; discounts_minor: number; voided: number; voided_minor: number; expenses_minor: number; cost_of_goods_minor: number; gross_profit_minor: number;
  khata_minor: number; by_type: Record<string, number>; share_percent: number;
}
export interface BranchCompare { from: string; to: string; rows: BranchCompareRow[]; total_revenue_minor: number; total_orders: number }
export interface FoodpandaReport { from: string; to: string; orders: number; paid_orders: number; voided: number; sales_minor: number; commission_minor: number; net_minor: number; by_day: Record<string, number> }
export interface AggregatorEvent { id: ID; external_id: string; event: string; status: string; order_id: ID | null; error: string | null; received_at: string }
export interface FoodpandaSettings { enabled: boolean | string; secret: string | null; secret_plain?: string | null; commission_percent: number | string; auto_accept: boolean | string; branch_id: ID | null; webhook_url?: string; events?: AggregatorEvent[] }

export interface Department { id: ID; name: string; employees?: number }
export type SalaryComponentKind = "earning" | "deduction";
export interface SalaryComponent { id: ID; name: string; kind: SalaryComponentKind; default_amount_minor: number | null; is_percent: boolean; percent: number | string | null }
export interface EmployeeComponent { id?: ID; salary_component_id: ID; name?: string; kind?: SalaryComponentKind; amount_minor: number | null; percent: number | null }
export interface Employee {
  id: ID; branch_id: ID | null; membership_id: ID | null; department_id: ID | null; department: string | null; name: string; phone: string | null; cnic: string | null; designation: string | null;
  base_salary_minor: number; pay_frequency: string; joined_on: string | null; left_on: string | null; fingerprint_enrolled: boolean; shares_tips: boolean; notes: string | null; archived_at: string | null; components: EmployeeComponent[];
}
export type AbsentRule = "calendar_days" | "fixed_26";
export interface AttendanceRule {
  id: ID; employee_id: ID | null; shift_start: string | null; shift_end: string | null; grace_minutes: number; late_fine_minor: number; late_fine_after_minutes: number; absent_rule: AbsentRule; working_days: number[]; require_fingerprint_to_close_shift: boolean;
}
export type LeaveKind = "paid" | "unpaid" | "sick";
export type LeaveStatus = "pending" | "approved" | "rejected";
export interface LeaveRequest { id: ID; employee_id: ID; employee_name: string; kind: LeaveKind; from_date: string; to_date: string; days: number; reason: string | null; status: LeaveStatus; approved_by_membership_id: ID | null; decided_at: string | null }
export interface Holiday { id: ID; branch_id: ID | null; name: string; on_date: string; paid: boolean }
export type AttendanceStatus = "present" | "absent" | "leave" | "holiday" | "half_day";
export interface Attendance {
  id: ID; employee_id: ID; employee_name: string; business_day: string; checked_in_at: string | null; checked_out_at: string | null; source: string; late_minutes: number; worked_minutes: number | null; fine_minor: number;
  status: AttendanceStatus; note: string | null; marked_by_membership_id: ID | null;
}
export interface AttendanceMonthSummary { present: number; half_days: number; absent: number; leave: number; unpaid_leave: number; holiday: number; late_minutes: number; late_days: number; fines_minor: number; worked_minutes: number }
export interface AttendanceSummary { month: string; data: { employee: { id: ID; name: string }; summary: AttendanceMonthSummary }[] }
export type AdvanceStatus = "pending" | "approved" | "rejected" | "paid" | "repaid";
export interface Advance {
  id: ID; number: number; label: string; employee_id: ID; employee_name: string; amount_minor: number; outstanding_minor: number; installment_minor: number | null; reason: string | null; status: AdvanceStatus;
  requested_on: string; approved_by_membership_id: ID | null; paid_at: string | null; expense_id: ID | null;
}
export type PayrollRunStatus = "generated" | "approved" | "paid" | "cancelled";
export interface PayrollRun {
  id: ID; label: string; branch_id: ID | null; month: string; status: PayrollRunStatus; notes: string | null; employees_count: number; gross_minor: number; deductions_minor: number; net_minor: number;
  generated_by_membership_id: ID | null; paid_at: string | null; created_at: string; payslips?: Payslip[];
}
export interface PayslipDetail {
  components?: { name: string; kind: SalaryComponentKind; amount_minor: number }[]; attendance?: AttendanceMonthSummary; advances?: { advance: string; taken_minor: number; outstanding_after_minor: number }[];
  active_days?: number; days_in_month?: number; absent_rule?: AbsentRule; absence_days?: number;
}
export interface Payslip {
  id: ID; payroll_run_id: ID; employee_id: ID; employee_name: string; designation: string | null; base_minor: number; earnings_minor: number; deductions_minor: number; absence_minor: number; late_fines_minor: number;
  advances_recovered_minor: number; tips_minor: number; commission_minor: number; net_minor: number; days_present: number; days_absent: number; days_leave: number; detail: PayslipDetail; paid_at: string | null; expense_id: ID | null;
}
