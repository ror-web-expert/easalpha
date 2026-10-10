# Servio: Database Schema

Date: 8 Oct 2026. Sources: the blueprint data model and rules, plus the additions from the ArfaPOS audit. PostgreSQL 16.

> **10 Oct 2026: `SPEC.md` is the requirement.** Where this file differs from `SPEC.md`, `SPEC.md` wins. The differences are listed in `PDF-ALIGNMENT.md`; the extras in this file stay. The text before this change is kept in `archive/before-spec-2026-10-10/`.


About 110 tables in 9 groups plus the SPEC additions in section 13. **Sections 2 to 10 are the 8 Oct 2026 schema; where section 13 or an inline `(SPEC: …)` note says otherwise, SPEC wins.** Every business-owned table carries `business_id`; branch-level tables also carry `branch_id`. Row-Level Security is enabled on every tenant table.

---

## 1. Conventions

| Convention | Rule |
|---|---|
| Primary keys | `id uuid primary key default gen_random_uuid()` |
| Tenant columns | `business_id uuid not null references businesses`, indexed; `branch_id uuid references branches` where branch-level |
| Timestamps | `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` on every table |
| Money | `bigint` in the smallest unit (paisa, cents); the currency lives on `businesses.currency`; column names end in `_minor` |
| Quantities | `numeric(20,9)` in the item's base unit (SPEC: full precision; was `numeric(14,3)`) |
| Time | stored UTC; `business_day date` stored on orders, shifts, ledger and account entries, computed from the branch's business-day window (SPEC) |
| Archive | `archived_at timestamptz` instead of delete on menu, staff, customers, suppliers, stock items |
| Status columns | `text` with a check constraint listing the allowed values |
| Created on device | `device_id uuid`, `client_created_at timestamptz`; `id` is the device-generated UUID and the unique idempotency key |
| Naming | snake_case, plural table names, `_id` for foreign keys, `_at` for timestamps |

Row-Level Security policy applied to every tenant table:

```sql
alter table orders enable row level security;
create policy tenant_isolation on orders
  using (business_id = current_setting('app.current_business_id')::uuid);
```

The API sets `app.current_business_id` from the user's membership at the start of every request. Super admin code uses a separate role that bypasses RLS and is logged.

Serials: `order_serials (branch_id, business_day, last_serial)` is incremented inside the order insert transaction; offline tills send `till_serial` such as `T1-059` and receive the branch serial on sync.

---

## 2. Platform

```
businesses
  id, name, slug (unique), legal_name, country char(2), currency char(3), time_zone,
  phone, email, logo_key, plan_id, trial_ends_on date, status (trial|active|grace|read_only|deleted),
  deleted_at, settings jsonb, created_at, updated_at

branches
  id, business_id, name, code (unique per business), address, city, phone,
  time_zone, business_day_start time (default 06:01, SPEC), day_end_time time (default 02:01, SPEC; was 04:00), tax_registration jsonb,
  opening_hours jsonb, is_main boolean, archived_at, created_at, updated_at

users
  id, phone (unique, +92 format), email (unique), name, password_digest,
  otp_secret, two_factor_enabled boolean, locale (en|ur), last_login_at,
  archived_at, created_at, updated_at

memberships
  id, business_id, user_id, role_id, pin_digest, pin_failed_count int,
  pin_locked_until, status (invited|active|deactivated), invited_via (whatsapp|email),
  created_at, updated_at
  unique (business_id, user_id)

membership_branches
  membership_id, branch_id        -- which branches a member may work at

roles
  id, business_id (null for system defaults), name, copied_from_role_id,
  is_system boolean, created_at, updated_at

permissions                        -- SPEC: 58 codes; see section 13
  code text primary key            -- app.admin, app.pos, orders.void, ...
  description, module, surface (software|app|both), restriction boolean

role_permissions                   -- presets only (SPEC); grants live in user_permissions, section 13
  role_id, permission_code, limit_value numeric  -- e.g. discount limit 10

devices
  id, business_id, branch_id, name, code (T1, T2), kind (till|tablet|kitchen|customer_display|token_screen|kiosk),
  station_id, pairing_code, paired_at, token_digest, platform, app_version,
  last_sync_at, last_seen_at, revoked_at, created_at, updated_at

plans
  id, code (starter|pro|business), name, price_pkr_minor, price_usd_minor,
  limits jsonb (tills, staff, branches, whatsapp_utility_messages), features jsonb, active boolean

subscriptions
  id, business_id, plan_id, billing_cycle (monthly|yearly), status, current_period_start, current_period_end,
  provider (paddle|manual), provider_ref, grace_ends_on, created_at, updated_at

invoices                                 -- subscription invoices
  id, business_id, subscription_id, number, amount_minor, currency, due_on, status (open|paid|void), pdf_key

payments_received                         -- subscription payments
  id, business_id, invoice_id, amount_minor, method (jazzcash|easypaisa|bank|paddle), reference, received_on, confirmed_by_user_id

feature_flags
  id, key, business_id (null = global), enabled boolean

setup_checklist_items
  id, business_id, key, title, done_at, plan_feature_off boolean, created_at, updated_at
```

---

## 3. Menu

```
menus
  id, business_id, name, show_online boolean, time_rules jsonb (days, start, end), sort_order, archived_at

categories
  id, business_id, menu_id, name, name_ur, image_key, sort_order, show_online boolean, station_id, archived_at

products
  id, business_id, category_id, name, name_ur, description, sku, image_key,
  base_price_minor, tax_rate_id, is_favourite boolean, show_online boolean, sold_by_weight boolean,
  weight_unit_id, allergens text[], dietary_tags text[], station_id, requires_recipe boolean,
  sort_order, archived_at

product_variants
  id, business_id, product_id, name (Small|Large), price_minor, sku, sort_order, archived_at

product_prices
  id, business_id, product_id, variant_id, branch_id (null = all), order_type (dine_in|takeaway|delivery|walk_in|online),
  price_minor
  unique (product_id, variant_id, branch_id, order_type)

price_overrides                           -- per branch base price
  id, business_id, branch_id, product_id, price_minor

modifier_groups
  id, business_id, name, min_select int, max_select int, required boolean, sort_order

modifiers
  id, business_id, modifier_group_id, name, name_ur, price_minor, stock_item_id, quantity numeric(14,3), sort_order

product_modifier_groups
  product_id, modifier_group_id, sort_order

deals
  id, business_id, name, description, image_key, price_minor, active boolean, show_online boolean,
  valid_from, valid_to, archived_at

deal_items
  id, deal_id, product_id, variant_id, quantity int, choice_group text  -- choice_group non-null = "choose any drink"

promotions
  id, business_id, name, kind (percent|fixed|happy_hour|coupon), value numeric, coupon_code,
  applies_to (order|category|product), target_ids uuid[], days int[], start_time, end_time,
  valid_from, valid_to, unit_limit int, units_sold int, sold_out boolean, active boolean

stations
  id, business_id, branch_id, name (BBQ|Karahi|Tandoor|Drinks), printer_id, display_device_id, sort_order
```

---

## 4. Dine-in

```
floors
  id, business_id, branch_id, name, sort_order, layout jsonb

tables
  id, business_id, branch_id, floor_id, code (R1-1), name, seats int, location,
  status (available|occupied|reserved|bill_requested), position jsonb (x, y, w, h),
  qr_token (unique), merged_into_table_id, archived_at

reservations
  id, business_id, branch_id, table_id, customer_id, party_size int, starts_at, ends_at,
  deposit_minor, status (booked|seated|no_show|cancelled), reminder_sent_at, notes

table_requests
  id, business_id, branch_id, table_id, kind (call_waiter|ask_bill), guest_name,
  requested_at, handled_by_user_id, handled_at
```

---

## 5. Orders

```
orders
  id (device UUID), business_id, branch_id, device_id, serial int, till_serial text, business_day date,
  order_type (dine_in|takeaway|delivery|walk_in), source (till|qr|online|phone|foodpanda|kiosk),
  status (pending|preparing|ready|dispatched|completed|cancelled | extras: held|served|refunded),   -- SPEC statuses
  table_id, guest_name, customer_id, address_id, rider_id, shift_id,
  taken_by_user_id, completed_by_user_id, is_staff_meal boolean, staff_meal_reason, approved_by_user_id,
  subtotal_minor, discount_minor, service_charge_minor, tax_minor, rounding_minor, tip_minor, delivery_charge_minor, total_minor,
  paid_minor, payment_status (paid|pending|unpaid|account|complimentary | extra: partial),   -- SPEC
  placed_at, ready_at, served_at, paid_at, closed_at, voided_at, void_reason, void_approved_by_user_id,
  aggregator_ref, aggregator_commission_minor, notes, client_created_at, created_at, updated_at
  index (business_id, branch_id, business_day), index (business_id, status), unique (branch_id, business_day, serial)

order_items
  id (device UUID), business_id, order_id, product_id, variant_id, deal_id,
  name_snapshot, price_minor_snapshot, tax_rate_snapshot numeric, recipe_cost_minor_snapshot,
  quantity numeric(14,3), unit_id, line_total_minor, notes, station_id, course int,
  status (pending|sent|preparing|ready|served|cancelled), sent_at, bumped_at, cancelled_reason,
  open_item boolean, price_overridden boolean, override_by_user_id, created_at, updated_at

order_item_modifiers
  id, business_id, order_item_id, modifier_id, name_snapshot, price_minor_snapshot, quantity numeric(14,3)

order_status_events
  id, business_id, order_id, from_status, to_status, user_id, device_id, reason, occurred_at

discounts_applied
  id, business_id, order_id, order_item_id, promotion_id, kind, value numeric, amount_minor,
  applied_by_user_id, approved_by_user_id

payments                                  -- order payments
  id (device UUID), business_id, branch_id, order_id, shift_id, payment_method_id, payment_account_id,
  amount_minor, tendered_minor, change_minor, tip_minor, reference, card_terminal_ref,
  status (pending|captured|failed|voided), received_by_user_id, received_at, business_day, created_at

refunds
  id (device UUID), business_id, order_id, payment_id, amount_minor, method_id, account_id, reason,
  by_user_id, approved_by_user_id, refunded_at, business_day

voids
  id, business_id, order_id, order_item_id, reason, stock_action (returned|waste|none),
  by_user_id, approved_by_user_id, voided_at

deliveries
  id, business_id, branch_id, order_id, rider_id, zone_id, address_id, charge_minor,
  status (unassigned|assigned|picked_up|on_the_way|arrived|delivered|failed), failed_reason,
  cash_collected_minor, settled_at, settlement_id, assigned_at, delivered_at

delivery_status_events
  id, business_id, delivery_id, status, lat numeric, lng numeric, occurred_at, synced_at

delivery_zones
  id, business_id, branch_id, name, polygon jsonb, charge_minor, min_order_minor, active boolean
```

---

## 6. Money

```
shifts
  id (device UUID), business_id, branch_id, device_id, cashier_user_id, business_day,
  opened_at, opening_cash_minor, closed_at, expected_cash_minor, counted_cash_minor, over_short_minor,
  count_detail jsonb (denominations), approved_by_user_id, status (open|closed|force_closed),
  settlement_status (pending|settled), z_report jsonb, created_at, updated_at
  index (business_id, cashier_user_id, status)

cash_movements
  id (device UUID), business_id, shift_id, kind (cash_in|cash_out|payout|float_issue|float_return),
  amount_minor, reason, reference, by_user_id, approved_by_user_id, occurred_at

payment_methods
  id, business_id, code (cash|card|easypaisa|jazzcash|bank|khata|raast|account_custom), name,
  payment_account_id, active boolean, works_offline boolean, sort_order

payment_accounts
  id, business_id, branch_id, name, kind (cash|wallet|bank|drawer|custom), is_default boolean,
  cashier_user_id (for drawer kind), opening_balance_minor, current_balance_minor, active boolean, archived_at
  check: active = false only when current_balance_minor = 0

account_entries
  id, business_id, branch_id, payment_account_id, business_day,
  kind (order_payment|refund|expense|supplier_payment|customer_payment|transfer_in|transfer_out|deposit|withdrawal|adjustment|rider_float),
  amount_minor (signed), ref_table, ref_id, description, by_user_id, verified_by_user_id, verified_at,
  reversed_by_entry_id, occurred_at
  index (business_id, payment_account_id, business_day)

tax_rates
  id, business_id, name, rate numeric(6,3), inclusive boolean, authority (fbr|pra|srb|kpra|bra|vat), active boolean

tax_invoices
  id, business_id, branch_id, order_id, authority, request_payload jsonb, response_payload jsonb,
  invoice_number, qr_payload, status (queued|sent|accepted|failed), attempts int, last_error, sent_at

expense_categories
  id, business_id, name, parent_id, archived_at

expenses
  id (device UUID), business_id, branch_id, category_id, amount_minor, payment_method_id, payment_account_id,
  shift_id, receipt_key, note, spent_on date, by_user_id, source (admin|till|payroll_sync), created_at

customer_payments
  id, business_id, branch_id, customer_id, number int, direction (received|paid), amount_minor,
  payment_method_id, payment_account_id, reference, collected_by_user_id, shift_id, received_at, business_day

supplier_payments
  id, business_id, supplier_id, number int, amount_minor, payment_method_id, payment_account_id,
  reference, purchase_order_id, paid_on, by_user_id

overheads
  id, business_id, branch_id, name (labor|gas|rent|other), amount_minor, basis (per_order|per_month), active boolean
```

---

## 7. Stock

```
units
  id, business_id (null = system), code (g|kg|ml|l|pcs|box|dz), name, kind (weight|volume|count), is_base boolean

unit_conversions
  id, business_id, from_unit_id, to_unit_id, factor numeric(18,9)
  unique (from_unit_id, to_unit_id)     -- both directions stored (SPEC)

stock_sections
  id, business_id, branch_id, name (Kitchen|Warehouse), sort_order, archived_at

stock_items
  id, business_id, name, name_ur, sku (unique per business), category, base_unit_id, purchase_unit_id,
  minimum_qty numeric(14,3), reorder_qty numeric(14,3), avg_cost_minor_per_base bigint,
  track_expiry boolean, barcode, is_packaging boolean, archived_at

stock_levels
  business_id, stock_section_id, stock_item_id, quantity numeric(14,3), value_minor bigint, updated_at
  primary key (stock_section_id, stock_item_id)

stock_documents
  id, business_id, branch_id, number int, kind (receive|po_receipt|transfer|waste|adjustment|count|opening_balance|production|supplier_return),   -- SPEC kinds
  status (draft|awaiting_approval|in_transit|posted|voided),   -- SPEC statuses from_section_id, to_section_id, supplier_id, goods_receipt_id,
  reason, invoice_ref, note, posted_at, by_user_id, posted_by_user_id, business_day

stock_document_lines
  id, business_id, stock_document_id, stock_item_id, quantity numeric(14,3), unit_id,
  unit_cost_minor, batch_no, expires_on, counted_qty numeric(14,3), expected_qty numeric(14,3)

stock_ledger_entries
  id, business_id, branch_id, stock_section_id, stock_item_id, business_day,
  kind (sale|sale_return|receive|transfer_in|transfer_out|waste|adjustment|count|production_in|production_out|supplier_return|packaging),
  quantity numeric(14,3) (signed), before_qty numeric(14,3), after_qty numeric(14,3), unit_cost_minor,
  ref_table, ref_id (order_id or stock_document_id), punched_by_user_id, completed_by_user_id,
  reversed_by_entry_id, occurred_at
  index (business_id, stock_item_id, occurred_at), index (business_id, ref_id)

recipes
  id, business_id, product_id (null for sub-recipe), variant_id, name, yield_qty numeric(14,3), yield_unit_id,
  output_stock_item_id (for sub-recipes), source_section_id, cost_minor (computed), archived_at

recipe_lines
  id, business_id, recipe_id, stock_item_id, quantity numeric(14,3), unit_id, waste_percent numeric(5,2)

production_batches
  id, business_id, branch_id, recipe_id, stock_document_id, quantity_produced numeric(14,3), produced_at, by_user_id

packaging_rules                           -- items deducted per order type
  id, business_id, branch_id, order_type, stock_item_id, quantity numeric(14,3)

inventory_settings
  business_id primary key, branch_id, day_lock_date date, counting_open boolean,
  allow_manual_below_zero boolean, return_on_cancel boolean, weight_display (auto|g|kg),
  volume_display (auto|ml|l), food_cost_target_percent numeric(5,2), require_recipe_to_go_live boolean

demand_rules
  id, business_id, branch_id, stock_item_id (null = all), category, lookback_days int, forecast_days int,
  safety_percent numeric(5,2), budget_cap_minor

deduction_audits
  id, business_id, order_id, status (ok|missing|partial|reversed), ledger_entry_ids uuid[], checked_at
```

---

## 8. Purchasing

```
suppliers
  id, business_id, name, contact_name, phone, email, address, opening_balance_minor, current_balance_minor,
  payment_terms_days int, active boolean, archived_at

purchase_orders
  id, business_id, branch_id, supplier_id, number int, status (draft|sent|received|partial|cancelled),
  expected_on date, total_minor, note, by_user_id, received_at

purchase_order_lines
  id, business_id, purchase_order_id, stock_item_id, quantity numeric(14,3), unit_id, unit_cost_minor, received_qty numeric(14,3)

goods_receipts
  id, business_id, branch_id, purchase_order_id, supplier_id, stock_document_id, number int,
  invoice_ref, invoice_key (photo), received_on, total_minor, by_user_id

goods_receipt_lines
  id, business_id, goods_receipt_id, stock_item_id, quantity numeric(14,3), unit_id, unit_cost_minor, batch_no, expires_on

purchase_returns
  id, business_id, branch_id, supplier_id, goods_receipt_id, stock_document_id, number int,
  reason, settlement (credit_note|cash_refund), amount_minor, payment_account_id, returned_on, by_user_id

purchase_return_lines
  id, business_id, purchase_return_id, stock_item_id, quantity numeric(14,3), unit_id, unit_cost_minor

supplier_price_history
  id, business_id, supplier_id, stock_item_id, unit_cost_minor, unit_id, observed_on, goods_receipt_id
```

---

## 9. People

```
customers
  id, business_id, khata_no int (unique per business), name, phone (unique per business), email, company,
  group_id, source (in_store|online|qr|phone|import), status (active|pending_approval|deactivated),
  is_walk_in boolean (exactly one true per business), credit_limit_minor, balance_minor, loyalty_points int,
  birthday date, whatsapp_opt_in boolean, opt_in_at, opt_in_source, opted_out_at, notes, archived_at

customer_groups
  id, business_id, name, discount_percent numeric(5,2), archived_at

customer_addresses
  id, business_id, customer_id, label, line1, line2, area, city, lat, lng, is_default boolean

loyalty_transactions
  id, business_id, customer_id, order_id, points int (signed), kind (earn|redeem|adjust|expire), occurred_at

riders
  id, business_id, branch_id, user_id, name, phone, vehicle, vehicle_no, address, charge_per_delivery_minor,
  active boolean, archived_at

rider_cash_movements
  id, business_id, rider_id, kind (issue|return|spend|adjust|settle), amount_minor, reason,
  payment_account_id, shift_id, by_user_id, occurred_at

rider_settlements
  id, business_id, rider_id, shift_id, deliveries_count int, cash_collected_minor, float_held_minor,
  spent_minor, handed_in_minor, difference_minor, settled_by_user_id, settled_at

departments
  id, business_id, name

employees
  id, business_id, branch_id, user_id, name, phone, cnic, designation, department_id,
  base_salary_minor, pay_frequency (monthly), joined_on, left_on, fingerprint_enrolled boolean, archived_at

salary_components
  id, business_id, name, kind (earning|deduction), default_amount_minor, is_percent boolean

employee_salary_components
  employee_id, salary_component_id, amount_minor

attendance
  id, business_id, branch_id, employee_id, business_day, checked_in_at, checked_out_at,
  source (fingerprint|selfie|manual), late_minutes int, status (present|absent|leave|holiday)

leave_requests
  id, business_id, employee_id, kind (paid|unpaid|sick), from_date, to_date, status (pending|approved|rejected), approved_by_user_id

holidays
  id, business_id, branch_id, name, on_date, paid boolean

attendance_rules                   -- SPEC adds the fields in section 13
  id, business_id, employee_id (null = default), rules_enabled boolean, shift_start time, shift_end time,
  late_after_min, half_day_after_min, absent_after_min, overtime_enabled, weekly_offs, no_scan_is_absent,
  free_lates, free_half_days, free_absents, penalty_late, penalty_half_day, penalty_absent, fine_minor, fine_cap_minor,
  checkout_gap_min, absent_rule (calendar_days|fixed_26), require_fingerprint_to_close_shift boolean

payroll_runs
  id, business_id, month date, status (generated|paid), notes, generated_by_user_id, paid_at

payslips
  id, business_id, payroll_run_id, employee_id, base_minor, earnings_minor, deductions_minor,
  advances_recovered_minor, tips_minor, commission_minor, net_minor, paid_at, payment_account_id, detail jsonb

advances
  id, business_id, employee_id, amount_minor, reason, status (pending|approved|rejected|repaid),
  requested_on, approved_by_user_id, repay_from_payroll_run_id, outstanding_minor, payment_account_id
```

---

## 10. System

```
audit_logs
  id, business_id, branch_id, user_id, device_id, approved_by_user_id,
  action (create|update|void|refund|discount|price_change|permission_change|login|export|settings_change),
  table_name, record_id, before jsonb, after jsonb, ip, occurred_at
  index (business_id, table_name, record_id), index (business_id, occurred_at)

whatsapp_templates
  id, business_id (null = shared), name, language (en|ur|ar), category (authentication|utility|marketing),
  body, variables text[], meta_template_id, approval_status (draft|pending|approved|rejected)

whatsapp_messages
  id, business_id, customer_id, user_id, to_phone, template_id, variables jsonb, kind,
  status (queued|sent|delivered|read|failed), provider_message_id, error, sent_at, delivered_at, read_at,
  counted_against_plan boolean, credits_used int

notifications
  id, business_id, user_id, kind, title, body, link, read_at, created_at

import_jobs
  id, business_id, kind (menu|stock_items|customers|suppliers|employees), source (csv|xlsx|arfapos_json),
  file_key, status (uploaded|previewed|applied|failed), row_count int, error_rows jsonb, by_user_id

sync_batches
  id, business_id, device_id, direction (push|pull), record_count int, accepted int, duplicates int, rejected int,
  cursor_before, cursor_after, started_at, finished_at, error

sync_rejections                           -- the needs-attention list
  id, business_id, device_id, sync_batch_id, table_name, record_id, code, message, resolved_at, resolved_by_user_id

order_serials
  branch_id, business_day, last_serial int
  primary key (branch_id, business_day)
```

---

## 11. Key relationships

```
businesses 1--* branches 1--* devices
businesses 1--* memberships *--1 users ; memberships *--1 roles *--* permissions
menus 1--* categories 1--* products 1--* product_variants ; products *--* modifier_groups 1--* modifiers
orders 1--* order_items 1--* order_item_modifiers ; orders 1--* payments ; orders 1--* order_status_events
orders *--1 shifts ; payments *--1 payment_accounts 1--* account_entries
orders --> stock_ledger_entries (via recipes and recipe_lines, at completion per SPEC)
stock_documents 1--* stock_document_lines --> stock_ledger_entries --> stock_levels
purchase_orders 1--* goods_receipts 1--* purchase_returns
customers 1--* customer_payments ; customers 1--* orders (khata)
riders 1--* deliveries 1--* delivery_status_events ; riders 1--* rider_cash_movements
employees 1--* payslips *--1 payroll_runs ; employees 1--* advances
```

---

## 12. Indexes and constraints to not forget

- Unique `(business_id, sku)` on products and stock_items; unique `(business_id, phone)` on customers; unique `(business_id, khata_no)`.
- Partial unique index on `customers (business_id) where is_walk_in` so only one walk-in exists.
- Check on `payment_accounts`: cannot set `active = false` while `current_balance_minor <> 0`.
- Check on `shifts`: one row per `cashier_user_id` with `status = 'open'` (partial unique index).
- `stock_ledger_entries` and `account_entries` are insert-only: a trigger blocks UPDATE and DELETE; corrections insert a reversing row.
- `orders.id` is the device UUID; the unique primary key is the idempotency guarantee for sync.
- Every money column is `bigint`; a check constraint rejects `numeric` or `float` by review, not by the database.

---

## 13. Changes required by SPEC.md (10 Oct 2026)

| Area | Change |
|---|---|
| Permissions | `permissions` gains module, label, surface (software, app, both) and restriction; new `role_presets` and `role_preset_permissions` (Cashier, Supervisor, Manager); new `user_permissions` (membership, permission_code, granted_at); the access token carries the granted codes |
| Staff | Separate record types and screens for admin staff, cashiers, order takers, riders and employees; `user_sessions` with device, signed in, signed out |
| Branch (the PDF's outlet) | `business_day_start` beside `day_end_time`, default 06:01 to 02:01 |
| Settings | `settings` table: branch, key, value jsonb, version, seeded defaults |
| Catalog | `categories.subtitle`; `products.discount_value`, `discount_type` (percent, amount), `pct_code`; `deals.is_favourite`; `quick_add_items` (product, position); `order_type_consumables` (product, variant, order_type, stock item, quantity, unit) |
| Orders | Statuses pending, preparing, ready, dispatched, completed, cancelled (held, served, refunded kept as extras); payment status adds account and complimentary; `order_events` (event_type punched, reopened, edited, completed, cancelled; user, role, occurred_at, diff jsonb, amount_before, amount_after); a reopen count; `tables.status` adds maintenance |
| Riders | temporary, lifetime_rule (one_order, n_orders, today, n_hours), lifetime_value, expires_at |
| Money | Payment method catalogue rows; tax rate linked to a payment account; `chart_of_accounts` (code, name, type, normal_side, is_system, opening_balance) seeded from 1000; `journal_entries` and `journal_lines`; fixed assets, liabilities and equity read from them |
| Stock | `stock_sections.is_system`, `cogs_primary`, `slug` (Kitchen and Warehouse seeded); `stock_items.active`, `purchase_category`, auto SKU; `unit_conversions` stored in both directions; document kinds add po_receipt and opening_balance; statuses draft, awaiting_approval, in_transit, posted, voided; unique (ref_table, ref_id, stock_item_id) on sale entries; a task that rebuilds `stock_levels` from the ledger |
| Attendance | `attendance_scans` (employee, scanned_at, device, direction); each day stores status, late_minutes, overtime_minutes, fine and a rules snapshot; `attendance_rules` add the master switch, late, half-day and absent thresholds, weekly offs, the no-scan rule, free allowances, penalties per status, the fine cap and the checkout gap |
| Payroll | `payroll_runs.divisor_method` and `divisor` |
| Customers | `regular_discount_tiers` (within_days, discount_type, value, exclusions, active) and a blocked list; `voucher_batches` (kind personal or public, value, minimum_spend, expires_at, usage_limit) and `voucher_codes` (code, customer, used_at, order); `reviews` (order, customer, rating 1 to 5, comment, source) |
| Audit | `audit_logs` written for every create, update and delete from a model concern; actions add bulk update, bulk delete, cancel, receive, status change, ledger debit and ledger credit |
