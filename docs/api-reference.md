# Servio API reference

Generated from the Rails routes on 9 Oct 2026 (482 endpoints). Base path /api/v1. Authentication: Bearer access token (15 min) plus refresh token; device token for paired tills; super admin token for /super; /qr/:token and /webhooks/* are public. Errors: {"error":{"code","message","details"}}. Money in minor units; stock quantities as decimal strings in base units. Cursor pagination: ?cursor=&limit= (max 200), responses {data, next_cursor}.

## health

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/health | show |

## auth

| Method | Path | Action |
|---|---|---|
| POST | /api/v1/auth/signup | signup |
| POST | /api/v1/auth/login | login |
| POST | /api/v1/auth/otp/request | otp_request |
| POST | /api/v1/auth/otp/verify | otp_verify |
| POST | /api/v1/auth/refresh | refresh |
| POST | /api/v1/auth/logout | logout |
| POST | /api/v1/auth/switch | switch |

## me

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/me | show |
| PATCH | /api/v1/me | update |

## business

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/business | show |
| PATCH | /api/v1/business | update |

## branches

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/branches | index |
| POST | /api/v1/branches | create |
| GET | /api/v1/branches/:id | show |
| PATCH | /api/v1/branches/:id | update |
| PUT | /api/v1/branches/:id | update |
| DELETE | /api/v1/branches/:id | destroy |

## staff

| Method | Path | Action |
|---|---|---|
| POST | /api/v1/staff/:id/set_pin | set_pin |
| POST | /api/v1/staff/:id/deactivate | deactivate |
| POST | /api/v1/staff/:id/reactivate | reactivate |
| GET | /api/v1/staff | index |
| POST | /api/v1/staff | create |
| GET | /api/v1/staff/:id | show |
| PATCH | /api/v1/staff/:id | update |
| PUT | /api/v1/staff/:id | update |

## roles

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/roles/permissions | permissions |
| GET | /api/v1/roles | index |
| POST | /api/v1/roles | create |
| GET | /api/v1/roles/:id | show |
| PATCH | /api/v1/roles/:id | update |
| PUT | /api/v1/roles/:id | update |
| DELETE | /api/v1/roles/:id | destroy |

## devices

| Method | Path | Action |
|---|---|---|
| POST | /api/v1/devices/:id/regenerate_code | regenerate_code |
| POST | /api/v1/devices/pair | pair |
| POST | /api/v1/devices/pin_login | pin_login |
| POST | /api/v1/devices/heartbeat | heartbeat |
| GET | /api/v1/devices | index |
| POST | /api/v1/devices | create |
| PATCH | /api/v1/devices/:id | update |
| PUT | /api/v1/devices/:id | update |
| DELETE | /api/v1/devices/:id | destroy |

## audit_logs

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/audit_logs | index |

## setup_checklist

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/setup_checklist | index |
| POST | /api/v1/setup_checklist/:key/complete | complete |

## notifications

| Method | Path | Action |
|---|---|---|
| POST | /api/v1/notifications/:id/read | read |
| GET | /api/v1/notifications | index |

## menus

| Method | Path | Action |
|---|---|---|
| POST | /api/v1/menus/reorder | reorder |
| GET | /api/v1/menus | index |
| POST | /api/v1/menus | create |
| GET | /api/v1/menus/:id | show |
| PATCH | /api/v1/menus/:id | update |
| PUT | /api/v1/menus/:id | update |
| DELETE | /api/v1/menus/:id | destroy |

## categories

| Method | Path | Action |
|---|---|---|
| POST | /api/v1/categories/reorder | reorder |
| GET | /api/v1/categories | index |
| POST | /api/v1/categories | create |
| PATCH | /api/v1/categories/:id | update |
| PUT | /api/v1/categories/:id | update |
| DELETE | /api/v1/categories/:id | destroy |

## products

| Method | Path | Action |
|---|---|---|
| POST | /api/v1/products/reorder | reorder |
| POST | /api/v1/products/:id/favourite | favourite |
| GET | /api/v1/products | index |
| POST | /api/v1/products | create |
| GET | /api/v1/products/:id | show |
| PATCH | /api/v1/products/:id | update |
| PUT | /api/v1/products/:id | update |
| DELETE | /api/v1/products/:id | destroy |

## modifier_groups

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/modifier_groups | index |
| POST | /api/v1/modifier_groups | create |
| GET | /api/v1/modifier_groups/:id | show |
| PATCH | /api/v1/modifier_groups/:id | update |
| PUT | /api/v1/modifier_groups/:id | update |
| DELETE | /api/v1/modifier_groups/:id | destroy |

## deals

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/deals | index |
| POST | /api/v1/deals | create |
| GET | /api/v1/deals/:id | show |
| PATCH | /api/v1/deals/:id | update |
| PUT | /api/v1/deals/:id | update |
| DELETE | /api/v1/deals/:id | destroy |

## promotions

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/promotions/check | check |
| GET | /api/v1/promotions | index |
| POST | /api/v1/promotions | create |
| GET | /api/v1/promotions/:id | show |
| PATCH | /api/v1/promotions/:id | update |
| PUT | /api/v1/promotions/:id | update |
| DELETE | /api/v1/promotions/:id | destroy |

## tax_rates

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/tax_rates | index |
| POST | /api/v1/tax_rates | create |
| PATCH | /api/v1/tax_rates/:id | update |
| PUT | /api/v1/tax_rates/:id | update |
| DELETE | /api/v1/tax_rates/:id | destroy |

## stations

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/stations | index |
| POST | /api/v1/stations | create |
| PATCH | /api/v1/stations/:id | update |
| PUT | /api/v1/stations/:id | update |
| DELETE | /api/v1/stations/:id | destroy |

## menu_transfer

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/menu/export | export |
| POST | /api/v1/menu/import/preview | import_preview |
| POST | /api/v1/menu/import/apply | import_apply |

## catalog

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/catalog | show |

## orders

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/orders/summary | summary |
| POST | /api/v1/orders/:id/place | place |
| POST | /api/v1/orders/:id/hold | hold |
| POST | /api/v1/orders/:id/resume | resume |
| POST | /api/v1/orders/:id/serve | serve |
| POST | /api/v1/orders/:id/close | close |
| POST | /api/v1/orders/:id/void | void |
| POST | /api/v1/orders/:id/discounts | add_discount |
| DELETE | /api/v1/orders/:id/discounts/:discount_id | remove_discount |
| GET | /api/v1/orders | index |
| POST | /api/v1/orders | create |
| GET | /api/v1/orders/:id | show |
| PATCH | /api/v1/orders/:id | update |
| PUT | /api/v1/orders/:id | update |

## payments

| Method | Path | Action |
|---|---|---|
| POST | /api/v1/orders/:id/payments | create |
| POST | /api/v1/orders/:id/refunds | refund |
| GET | /api/v1/payments | index |

## receipts

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/orders/:id/receipt | show |
| POST | /api/v1/orders/:id/receipt/reprint | reprint |
| POST | /api/v1/orders/:id/receipt/printed | printed |
| POST | /api/v1/orders/:id/receipt/send | send_receipt |

## shifts

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/shifts/current | current |
| POST | /api/v1/shifts/:id/close | close |
| POST | /api/v1/shifts/:id/approve | approve |
| POST | /api/v1/shifts/:id/settle | settle |
| POST | /api/v1/shifts/:id/cash_movements | cash_movement |
| GET | /api/v1/shifts/:id/z_report | z_report |
| GET | /api/v1/shifts | index |
| POST | /api/v1/shifts | create |
| GET | /api/v1/shifts/:id | show |

## day_closes

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/day_close | show |
| POST | /api/v1/day_close/lock | lock |
| POST | /api/v1/day_close/reopen | reopen |

## reports

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/reports/dashboard | dashboard |
| GET | /api/v1/reports/overview | overview |
| GET | /api/v1/reports/by_day | by_day |
| GET | /api/v1/reports/by_hour | by_hour |
| GET | /api/v1/reports/items | items |
| GET | /api/v1/reports/categories | categories |
| GET | /api/v1/reports/cashiers | cashiers |
| GET | /api/v1/reports/order_takers | order_takers |
| GET | /api/v1/reports/voids | voids |
| GET | /api/v1/reports/discounts | discounts |
| GET | /api/v1/reports/modified | modified |
| GET | /api/v1/reports/customers | customers |
| GET | /api/v1/reports/shifts | shifts |
| GET | /api/v1/reports/grand | grand |

## sync

| Method | Path | Action |
|---|---|---|
| POST | /api/v1/sync/push | push |
| GET | /api/v1/sync/changes | changes |
| GET | /api/v1/sync/rejections | rejections |
| POST | /api/v1/sync/rejections/:id/resolve | resolve |
| GET | /api/v1/sync/batches | batches |

## tax_invoices

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/tax_invoices/summary | summary |
| POST | /api/v1/tax_invoices/:id/retry | retry |
| GET | /api/v1/tax_invoices | index |
| GET | /api/v1/tax_invoices/:id | show |

## customer_ledger

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/customers/:id/ledger | show |
| GET | /api/v1/customers/aging | aging |
| GET | /api/v1/customers/ledger_summary | summary |

## webhooks

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/webhooks/whatsapp | whatsapp_verify |
| POST | /api/v1/webhooks/whatsapp | whatsapp |
| POST | /api/v1/webhooks/foodpanda/:slug | foodpanda |

## payment_methods

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/payment_methods | index |
| POST | /api/v1/payment_methods | create |
| PATCH | /api/v1/payment_methods/:id | update |
| PUT | /api/v1/payment_methods/:id | update |

## payment_accounts

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/payment_accounts/:id/entries | entries |
| POST | /api/v1/payment_accounts/:id/transfer | transfer |
| POST | /api/v1/payment_accounts/:id/adjust | adjust |
| GET | /api/v1/payment_accounts | index |
| POST | /api/v1/payment_accounts | create |
| GET | /api/v1/payment_accounts/:id | show |
| PATCH | /api/v1/payment_accounts/:id | update |
| PUT | /api/v1/payment_accounts/:id | update |

## customers

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/customers/lookup | lookup |
| POST | /api/v1/customers/import | import |
| GET | /api/v1/customers/:id/orders | orders |
| POST | /api/v1/customers/:id/approve | approve |
| POST | /api/v1/customers/:id/addresses | add_address |
| DELETE | /api/v1/customers/:id/addresses/:address_id | remove_address |
| GET | /api/v1/customers | index |
| POST | /api/v1/customers | create |
| GET | /api/v1/customers/:id | show |
| PATCH | /api/v1/customers/:id | update |
| PUT | /api/v1/customers/:id | update |
| DELETE | /api/v1/customers/:id | destroy |

## customer_payments

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/customers/:id/payments | index |
| POST | /api/v1/customers/:id/payments | create |

## customer_groups

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/customer_groups | index |
| POST | /api/v1/customer_groups | create |
| PATCH | /api/v1/customer_groups/:id | update |
| PUT | /api/v1/customer_groups/:id | update |
| DELETE | /api/v1/customer_groups/:id | destroy |

## tables

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/tables/floors | floors |
| PUT | /api/v1/tables/layout | layout |
| POST | /api/v1/tables/floors | create_floor |
| PATCH | /api/v1/tables/floors/:id | update_floor |
| DELETE | /api/v1/tables/floors/:id | destroy_floor |
| POST | /api/v1/tables/:id/move | move |
| POST | /api/v1/tables/:id/merge | merge |
| POST | /api/v1/tables/:id/assign_waiter | assign_waiter |
| POST | /api/v1/tables/:id/regenerate_qr | regenerate_qr |
| GET | /api/v1/tables | index |
| POST | /api/v1/tables | create |
| PATCH | /api/v1/tables/:id | update |
| PUT | /api/v1/tables/:id | update |
| DELETE | /api/v1/tables/:id | destroy |
| GET | /api/v1/tables/:id/qr | qr_card |

## kitchen

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/kitchen/orders | orders |
| GET | /api/v1/kitchen/tickets | tickets |
| POST | /api/v1/kitchen/tickets/:id/printed | ticket_printed |
| POST | /api/v1/kitchen/orders/:id/start | start |
| POST | /api/v1/kitchen/orders/:id/bump | bump |
| POST | /api/v1/kitchen/items/:id/bump | bump_item |
| GET | /api/v1/kitchen/ready | ready |
| GET | /api/v1/kitchen/queue | queue |

## employees

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/employees/departments | departments |
| POST | /api/v1/employees/departments | create_department |
| DELETE | /api/v1/employees/departments/:id | destroy_department |
| GET | /api/v1/employees/components | components |
| POST | /api/v1/employees/components | create_component |
| DELETE | /api/v1/employees/components/:id | destroy_component |
| GET | /api/v1/employees/rules | rules |
| PUT | /api/v1/employees/rules | upsert_rule |
| GET | /api/v1/employees/leaves | leaves |
| POST | /api/v1/employees/leaves | create_leave |
| POST | /api/v1/employees/leaves/:id/decide | decide_leave |
| GET | /api/v1/employees/holidays | holidays |
| POST | /api/v1/employees/holidays | create_holiday |
| DELETE | /api/v1/employees/holidays/:id | destroy_holiday |
| GET | /api/v1/employees | index |
| POST | /api/v1/employees | create |
| GET | /api/v1/employees/:id | show |
| PATCH | /api/v1/employees/:id | update |
| PUT | /api/v1/employees/:id | update |
| DELETE | /api/v1/employees/:id | destroy |

## attendance

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/attendance | index |
| GET | /api/v1/attendance/summary | summary |
| POST | /api/v1/attendance/check_in | check_in |
| POST | /api/v1/attendance/check_out | check_out |
| POST | /api/v1/attendance/mark | mark |
| POST | /api/v1/attendance/fill_absences | fill_absences |

## payroll

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/payroll/runs | runs |
| POST | /api/v1/payroll/runs | generate |
| GET | /api/v1/payroll/runs/:id | show_run |
| POST | /api/v1/payroll/runs/:id/pay | pay |
| POST | /api/v1/payroll/runs/:id/cancel | cancel_run |
| GET | /api/v1/payroll/payslips/:id | payslip |
| GET | /api/v1/payroll/advances | advances |
| POST | /api/v1/payroll/advances | create_advance |
| POST | /api/v1/payroll/advances/:id/decide | decide_advance |
| POST | /api/v1/payroll/advances/:id/pay | pay_advance |

## finance

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/finance/ledger | ledger |
| GET | /api/v1/finance/reconciliation | reconciliation |
| GET | /api/v1/finance/integrity | integrity |
| GET | /api/v1/finance/profit_loss | profit_loss |
| GET | /api/v1/finance/export | export |
| GET | /api/v1/reports/branches | branches |
| GET | /api/v1/reports/foodpanda | foodpanda_report |
| GET | /api/v1/integrations/foodpanda | foodpanda |
| PATCH | /api/v1/integrations/foodpanda | update_foodpanda |

## loyalty

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/loyalty/settings | settings |
| PATCH | /api/v1/loyalty/settings | update_settings |
| GET | /api/v1/customers/:id/loyalty | customer |
| POST | /api/v1/customers/:id/loyalty/adjust | adjust |
| POST | /api/v1/orders/:id/redeem_points | redeem |

## campaigns

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/campaigns/audience | audience |
| POST | /api/v1/campaigns/:id/send | send_now |
| GET | /api/v1/campaigns/:id/stats | stats |
| GET | /api/v1/campaigns | index |
| POST | /api/v1/campaigns | create |
| GET | /api/v1/campaigns/:id | show |
| PATCH | /api/v1/campaigns/:id | update |
| PUT | /api/v1/campaigns/:id | update |
| DELETE | /api/v1/campaigns/:id | destroy |

## reservations

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/reservations/availability | availability |
| POST | /api/v1/reservations/:id/seat | seat |
| POST | /api/v1/reservations/:id/confirm | confirm |
| POST | /api/v1/reservations/:id/no_show | no_show |
| POST | /api/v1/reservations/:id/cancelled | cancelled |
| POST | /api/v1/reservations/:id/completed | completed |
| GET | /api/v1/reservations | index |
| POST | /api/v1/reservations | create |
| GET | /api/v1/reservations/:id | show |
| PATCH | /api/v1/reservations/:id | update |
| PUT | /api/v1/reservations/:id | update |

## commission_rules

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/commission_rules | index |
| POST | /api/v1/commission_rules | create |
| PATCH | /api/v1/commission_rules/:id | update |
| PUT | /api/v1/commission_rules/:id | update |
| DELETE | /api/v1/commission_rules/:id | destroy |
| GET | /api/v1/reports/commissions | report |

## checklists

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/checklists/templates | templates |
| PUT | /api/v1/checklists/templates/:kind | update_template |
| GET | /api/v1/checklists/today | today |
| GET | /api/v1/checklists/runs | runs |
| POST | /api/v1/checklists/runs/:id/tick | tick |
| POST | /api/v1/checklists/runs/:id/complete | complete |

## qr

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/qr/:token | show |
| GET | /api/v1/qr/:token/bill | bill |
| POST | /api/v1/qr/:token/orders | create_order |
| GET | /api/v1/qr/:token/orders/:id | order |
| POST | /api/v1/qr/:token/requests | create_request |

## qr_orders

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/qr_orders | index |
| POST | /api/v1/qr_orders/:id/accept | accept |
| POST | /api/v1/qr_orders/:id/reject | reject |
| GET | /api/v1/qr_orders/requests | requests |
| POST | /api/v1/qr_orders/requests/:id/handle | handle_request |

## report_schedules

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/report_schedules/:id/preview | preview |
| POST | /api/v1/report_schedules/:id/run | run |
| GET | /api/v1/report_schedules | index |
| POST | /api/v1/report_schedules | create |
| PATCH | /api/v1/report_schedules/:id | update |
| PUT | /api/v1/report_schedules/:id | update |
| DELETE | /api/v1/report_schedules/:id | destroy |

## expenses

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/expenses/categories | categories |
| POST | /api/v1/expenses/categories | create_category |
| PATCH | /api/v1/expenses/categories/:id | update_category |
| DELETE | /api/v1/expenses/categories/:id | destroy_category |
| GET | /api/v1/expenses/summary | summary |
| POST | /api/v1/expenses/:id/void | void |
| GET | /api/v1/expenses | index |
| POST | /api/v1/expenses | create |
| GET | /api/v1/expenses/:id | show |
| PATCH | /api/v1/expenses/:id | update |
| PUT | /api/v1/expenses/:id | update |

## overheads

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/overheads | index |
| POST | /api/v1/overheads | create |
| PATCH | /api/v1/overheads/:id | update |
| PUT | /api/v1/overheads/:id | update |
| DELETE | /api/v1/overheads/:id | destroy |

## delivery_zones

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/delivery_zones/quote | quote |
| GET | /api/v1/delivery_zones | index |
| POST | /api/v1/delivery_zones | create |
| PATCH | /api/v1/delivery_zones/:id | update |
| PUT | /api/v1/delivery_zones/:id | update |
| DELETE | /api/v1/delivery_zones/:id | destroy |

## riders

| Method | Path | Action |
|---|---|---|
| POST | /api/v1/riders/:id/float | float |
| GET | /api/v1/riders/:id/statement | statement |
| GET | /api/v1/riders/:id/settlement_preview | settlement_preview |
| POST | /api/v1/riders/:id/settle | settle |
| GET | /api/v1/riders/:id/settlements | settlements |
| GET | /api/v1/riders/:id/deliveries | deliveries |
| GET | /api/v1/riders | index |
| POST | /api/v1/riders | create |
| GET | /api/v1/riders/:id | show |
| PATCH | /api/v1/riders/:id | update |
| PUT | /api/v1/riders/:id | update |
| DELETE | /api/v1/riders/:id | destroy |

## deliveries

| Method | Path | Action |
|---|---|---|
| POST | /api/v1/deliveries/:id/assign | assign |
| POST | /api/v1/deliveries/:id/unassign | unassign |
| POST | /api/v1/deliveries/:id/status | status |
| POST | /api/v1/deliveries/:id/cash | cash |
| GET | /api/v1/deliveries | index |
| GET | /api/v1/deliveries/:id | show |
| GET | /api/v1/orders/:order_id/delivery | show |
| POST | /api/v1/orders/:order_id/delivery/assign | assign |
| POST | /api/v1/orders/:order_id/delivery/status | status |
| GET | /api/v1/rider/deliveries | mine |
| POST | /api/v1/rider/deliveries/:id/status | mine_status |
| GET | /api/v1/rider/float | mine_float |

## suppliers

| Method | Path | Action |
|---|---|---|
| POST | /api/v1/suppliers/import | import |
| GET | /api/v1/suppliers/aging_report | aging_report |
| GET | /api/v1/suppliers/summary | summary |
| GET | /api/v1/suppliers/:id/ledger | ledger |
| GET | /api/v1/suppliers/:id/aging | aging |
| GET | /api/v1/suppliers/:id/insights | insights |
| GET | /api/v1/suppliers/:id/payments | payments |
| POST | /api/v1/suppliers/:id/payments | pay |
| GET | /api/v1/suppliers | index |
| POST | /api/v1/suppliers | create |
| GET | /api/v1/suppliers/:id | show |
| PATCH | /api/v1/suppliers/:id | update |
| PUT | /api/v1/suppliers/:id | update |
| DELETE | /api/v1/suppliers/:id | destroy |

## purchase_orders

| Method | Path | Action |
|---|---|---|
| POST | /api/v1/purchase_orders/:id/send | send_order |
| POST | /api/v1/purchase_orders/:id/cancel | cancel |
| POST | /api/v1/purchase_orders/:id/receive | receive |
| GET | /api/v1/purchase_orders | index |
| POST | /api/v1/purchase_orders | create |
| GET | /api/v1/purchase_orders/:id | show |
| PATCH | /api/v1/purchase_orders/:id | update |
| PUT | /api/v1/purchase_orders/:id | update |
| DELETE | /api/v1/purchase_orders/:id | destroy |

## goods_receipts

| Method | Path | Action |
|---|---|---|
| POST | /api/v1/goods_receipts/:id/cancel | cancel |
| GET | /api/v1/goods_receipts | index |
| POST | /api/v1/goods_receipts | create |
| GET | /api/v1/goods_receipts/:id | show |

## purchase_returns

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/purchase_returns | index |
| POST | /api/v1/purchase_returns | create |
| GET | /api/v1/purchase_returns/:id | show |

## purchasing

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/purchasing/summary | summary |
| GET | /api/v1/purchasing/aging | aging |
| GET | /api/v1/purchasing/suggestions | suggestions |
| GET | /api/v1/purchasing/forecast | forecast |
| GET | /api/v1/purchasing/prices | prices |
| GET | /api/v1/purchasing/report | report |

## units

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/units | index |
| POST | /api/v1/units | create |
| PATCH | /api/v1/units/:id | update |
| PUT | /api/v1/units/:id | update |
| DELETE | /api/v1/units/:id | destroy |

## stock_sections

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/stock_sections | index |
| POST | /api/v1/stock_sections | create |
| PATCH | /api/v1/stock_sections/:id | update |
| PUT | /api/v1/stock_sections/:id | update |
| DELETE | /api/v1/stock_sections/:id | destroy |

## stock_items

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/stock_items/categories | categories |
| POST | /api/v1/stock_items/import/preview | import_preview |
| POST | /api/v1/stock_items/import | import |
| GET | /api/v1/stock_items/:id/ledger | ledger |
| GET | /api/v1/stock_items | index |
| POST | /api/v1/stock_items | create |
| GET | /api/v1/stock_items/:id | show |
| PATCH | /api/v1/stock_items/:id | update |
| PUT | /api/v1/stock_items/:id | update |
| DELETE | /api/v1/stock_items/:id | destroy |

## stock_documents

| Method | Path | Action |
|---|---|---|
| POST | /api/v1/stock_documents/:id/post | post |
| POST | /api/v1/stock_documents/:id/cancel | cancel |
| GET | /api/v1/stock_documents | index |
| POST | /api/v1/stock_documents | create |
| GET | /api/v1/stock_documents/:id | show |
| PATCH | /api/v1/stock_documents/:id | update |
| PUT | /api/v1/stock_documents/:id | update |
| DELETE | /api/v1/stock_documents/:id | destroy |

## recipes

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/recipes/coverage | coverage |
| GET | /api/v1/recipes/flags | flags |
| GET | /api/v1/recipes/food_cost | food_cost |
| POST | /api/v1/recipes/recost | recost |
| GET | /api/v1/recipes | index |
| POST | /api/v1/recipes | create |
| GET | /api/v1/recipes/:id | show |
| PATCH | /api/v1/recipes/:id | update |
| PUT | /api/v1/recipes/:id | update |
| DELETE | /api/v1/recipes/:id | destroy |

## production_batches

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/production_batches | index |
| POST | /api/v1/production_batches | create |

## packaging_rules

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/packaging_rules | index |
| POST | /api/v1/packaging_rules | create |
| PATCH | /api/v1/packaging_rules/:id | update |
| PUT | /api/v1/packaging_rules/:id | update |
| DELETE | /api/v1/packaging_rules/:id | destroy |

## stock

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/stock/consumption | consumption |
| GET | /api/v1/stock/deduction_audits | deduction_audits |
| GET | /api/v1/stock/levels | levels |
| GET | /api/v1/stock/valuation | valuation |
| GET | /api/v1/stock/daily_sheet | daily_sheet |
| GET | /api/v1/stock/waste | waste |
| GET | /api/v1/stock/ledger | ledger |

## inventory_settings

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/inventory_settings | show |
| PATCH | /api/v1/inventory_settings | update |
| POST | /api/v1/inventory_settings/counting | counting |

## exports

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/exports | index |
| GET | /api/v1/exports/:kind | show |

## billing

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/billing | show |
| POST | /api/v1/billing/choose_plan | choose_plan |
| POST | /api/v1/billing/invoices/:id/report_payment | report_payment |
| POST | /api/v1/billing/export | export |

## billing_webhooks

| Method | Path | Action |
|---|---|---|
| POST | /api/v1/webhooks/paddle | paddle |

## support_sessions

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/support_sessions | index |
| POST | /api/v1/support_sessions/:id/approve | approve |
| POST | /api/v1/support_sessions/:id/deny | deny |
| POST | /api/v1/super/support_sessions | request_access |
| POST | /api/v1/super/support_sessions/:id/token | token |

## onboarding

| Method | Path | Action |
|---|---|---|
| POST | /api/v1/onboarding/sample_menu | sample_menu |
| GET | /api/v1/onboarding/status | status |

## whatsapp

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/whatsapp/templates | templates |
| GET | /api/v1/whatsapp/messages | messages |
| GET | /api/v1/whatsapp/usage | usage |

## super/feature_flags

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/super/feature_flags | index |
| PUT | /api/v1/super/feature_flags | upsert |
| GET | /api/v1/super/health | health |

## super/billing

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/super/invoices | invoices |
| POST | /api/v1/super/invoices/:id/confirm | confirm |
| POST | /api/v1/super/billing/run_lifecycle | run_lifecycle |

## super/sessions

| Method | Path | Action |
|---|---|---|
| POST | /api/v1/super/login | create |

## super/businesses

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/super/stats | stats |
| GET | /api/v1/super/businesses | index |
| GET | /api/v1/super/businesses/:id | show |
| PATCH | /api/v1/super/businesses/:id | update |
| PUT | /api/v1/super/businesses/:id | update |
