# EasAlpha API reference

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
| POST | /api/v1/devices/register | register: "Set up this device"; a signed-in owner or manager (devices.manage) creates and pairs the machine in one call; returns the pair payload plus `staff` (who can sign in on it, with has_pin) |
| POST | /api/v1/devices/pin_login | pin_login | After five wrong PINs on a device, pin.locked (401) for 15 minutes on that device only; manager approvals count wrong tries per asking member the same way.
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
| POST | /api/v1/expenses/:id/void | void (409 expense.wage for a paid wage's expense: void it with POST /wages/:id/void so a recovered advance is given back) |
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

## Phase 1 additions (10 Oct 2026, from SPEC.md)

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/roles/permissions | registry: 57 SPEC codes with module, surface, restriction and implied EasAlpha codes, plus the 46 EasAlpha codes |
| GET | /api/v1/roles/presets | Cashier, Supervisor, Manager presets |
| GET | /api/v1/staff/:id/permissions | mode (role or custom), granted, effective, granted-of-total per module, and apps (the apps the set opens) |
| PUT | /api/v1/staff/:id/permissions | body codes[] or preset or select_all or reset; takes effect at the next sign-in |
| GET | /api/v1/staff?staff_type=admin,cashier,order_taker,rider&cashier_role= | staff populations; phone, email, PIN state and sign-in times only for staff.manage or the member themself, the name and role for anyone else |
| GET | /api/v1/staff/sessions?active=&membership_id= | user sessions from refresh tokens |
| POST | /api/v1/staff/sessions/:id/revoke | sign a session out |
| PATCH | /api/v1/branches/:id | adds business_day_start; the business day is a window, default 06:01 to 02:01 |
| GET | /api/v1/settings | the five SPEC settings areas with every key, value and default |
| PATCH | /api/v1/settings | values: {key: value}; bumps the version |
| GET | /api/v1/settings/version | the version the POS compares against; user or device token |
| GET | /api/v1/audit_logs?from&to&user_id&action_name&table_name&record_id | every create, update and delete; append-only; rows carry entity (the table's label) and super_admin_id, and before and after come back with secrets redacted |
| GET | /api/v1/audit_logs/entities | entity types seen with entity_labels, and every action with action_labels |
| GET | /api/v1/audit_logs/insights?from&to | counts by action, entity, actor and day |

The access token now carries `perms`, the effective permission codes at sign-in.

## Phase 2 additions (10 Oct 2026, SPEC "Menu and catalog")

| Method | Path | Action |
|---|---|---|
| POST | /api/v1/uploads | image upload (PNG, JPG, WEBP, max 5 MB) → key used as image_key |
| GET | /api/v1/uploads/:id | public image by signed id |
| GET, PUT | /api/v1/products/:id/consumables | Order Inventory: consumables per order type and variant; copy_all_order_types |
| GET, PUT | /api/v1/products/codes | Product Codes panel: SKU and PCT code in bulk |
| GET, PUT | /api/v1/quick_add_items | Quick Add Menu; also in /catalog and /sync/changes |
| PATCH | /api/v1/products/:id | adds discount_value, discount_type (percent, amount), pct_code |
| PATCH | /api/v1/categories/:id | adds subtitle |
| PATCH | /api/v1/deals/:id | adds is_favourite |
| GET | /api/v1/qr/:token | hidden menus and categories are left out |
| GET | /api/v1/settings | adds the Display Settings keys catalog.display.* |

## Phase 3 additions (10 Oct 2026, SPEC "Orders, order taking and tables")

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/orders?status=&payment_status=&payment_method=&from=&to=&sort= | SPEC status and payment-status names, method, date range, sorts |
| GET | /api/v1/orders/pending | open orders across days: tiles, calendar, list |
| POST | /api/v1/orders/bulk_complete | Mark All Completed for a business day |
| POST | /api/v1/orders/sync_complimentary | settle complimentary orders at zero |
| POST | /api/v1/orders/:id/reopen | SPEC reopen (REOPEN_ORDER) |
| POST | /api/v1/orders/:id/complete | SPEC complete (COMPLETE_ORDER); Direct Unpaid Orders |
| POST | /api/v1/orders with complete: true | place and complete (PLACE_AND_COMPLETE_ORDER) |
| GET | /api/v1/orders/:id/cost_analysis | revenue, COGS, labour, profit, margin, ingredients |
| GET | /api/v1/reports/dashboard/spec?period= | SPEC KPI cards, charts, top selling, pills |
| GET | /api/v1/me | adds pills: open orders today and previous, low-stock items |

Orders carry spec_status, spec_payment_status, reopen_count, edit_count, reopened_at, unpaid_direct and a story block.

## Phase 4 additions (10 Oct 2026, SPEC "Inventory and recipes")

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/stock/deduction_health | safety-net status, buckets, problem orders |
| GET | /api/v1/stock/deduction_health/:order_id | one order's audits and movements |
| POST | /api/v1/stock/deduction_health/:order_id/retry | retry the deduction (never twice) |
| POST | /api/v1/stock/safety_net/run | run the safety net now |
| POST | /api/v1/stock/rebuild_balances | rebuild cached balances from the ledgers |
| GET | /api/v1/stock/demand?bucket=&section_id=&category= | Low, Critical, Out of stock; on order; transfer vs buy |
| POST | /api/v1/stock/reset | zero a section through an adjustment (PIN) |
| GET | /api/v1/stock/actual_vs_theoretical?from&to&section_id | counted against theoretical |
| GET | /api/v1/stock/valuation_cogs?from&to | stock value and COGS |
| GET, POST | /api/v1/unit_conversions | factors stored in each direction |
| POST | /api/v1/stock_documents/:id/submit, /approve, /dispatch, /receive | Awaiting approval and In transit flows |

Stock deducts at completion; `stock_documents` carry posting_date and nine kinds; sections carry slug, is_system and cogs_primary; items carry active and an auto SKU.

## Phase 5 additions (10 Oct 2026, SPEC "Purchasing, suppliers and expenses" and "Payments, charges, tax and the finance ledger")

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/suppliers | rows carry balance_label (to_pay, to_receive, settled), items_count, purchases_count |
| GET | /api/v1/suppliers/ranking?sort=purchased|paid|outstanding|name | Supplier Insights ranking |
| GET | /api/v1/suppliers/:id/ledger | tiles, Dr/Cr entries typed Opening, Purchase, Payment, Return, Adjustment with the PO link, aging |
| GET, POST | /api/v1/suppliers/:id/adjustments, /adjust | manual ledger adjustments |
| GET | /api/v1/purchase_orders/summary | KPI tiles |
| POST | /api/v1/purchase_orders/:id/pay | pay against a PO (PO_PAYMENT); list filter payment=unpaid|partial|paid |
| GET | /api/v1/purchasing/price_history?from&to&flagged&q | Purchase Price History with verdicts |
| GET | /api/v1/expenses/export | CSV with the list filters; summary adds average_minor, category_count, subcategory_count; filters subcategory_id, method_code |
| GET | /api/v1/payment_methods/catalogue | wallets and banks; POST /payment_methods { catalogue_code } creates the method and its account |
| POST | /api/v1/orders/:id/tax_choice | { none: true } or { tax_rate_id } |
| GET | /api/v1/finance/dashboard | total balance, Today In, Today Out, counts by source, recent activity |
| GET, POST, PATCH, DELETE | /api/v1/finance/accounts | chart of accounts (system rows protected); /:id/ledger; POST /seed |
| GET, POST | /api/v1/finance/journal | journal vouchers; POST /:id/reverse |
| GET | /api/v1/finance/trial_balance?from&to, /balance_sheet?as_of, /liabilities, /equity | statements |
| GET, POST, PATCH | /api/v1/finance/fixed_assets | assets; POST /:id/depreciate, /:id/dispose |

Permissions: PURCHASE_ORDERS, PO_CREATE, PO_EDIT, PO_DELETE, PO_RECEIVE, PO_RETURN, PO_PAYMENT, PO_ADD_ITEM (stock_items#create), PO_ADD_SUPPLIER (suppliers#create); SUPPLIERS, SUPPLIER_LEDGER, SUPPLIER_VIEW_LEDGER, SUPPLIER_RECORD_PAYMENT. Finance screens: finance.view to read, settings.manage to post.

## Phase 6 additions (11 Oct 2026, SPEC "Staff, attendance and payroll", "Riders", Cashier Till)

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/attendance/today | Today counters (scans, currently in, checked out, not checked in, late) and rows |
| GET | /api/v1/attendance/scans | Scan Log, every tap |
| POST | /api/v1/attendance/scan { fingerprint_id | employee_id } | kiosk intake: check in or out, "Already Marked" inside the gap |
| GET, POST | /api/v1/attendance/enrolled, /enrol, /revoke | fingerprint enrolment |
| GET | /api/v1/attendance/ledger?employee_id&month | month view per employee with the charges |
| GET | /api/v1/attendance/reports?month | per employee totals |
| POST | /api/v1/attendance/auto_close | close everyone still checked in |
| PUT | /api/v1/employees/rules | Defaults (no employee_id) or per-employee rules: master switch, thresholds, overtime, weekly offs, no-scan, allowances, penalties, fine cap, checkout gap, divisor |
| GET | /api/v1/payroll/overview, /ledger, /reports | payroll screens |
| GET, PATCH | /api/v1/payroll/settings | salary method with the worked example, require fingerprint to close shift |
| GET, POST | /api/v1/riders (temporary: true, lifetime_kind, lifetime_value, permissions) | temporary riders; rows carry assigned_count, completed_count, expired |
| GET | /api/v1/reports/riders, /reports/cashier_till | Rider Reports and Cashier Till |
| GET | /api/v1/shifts/my_till | My Till |
| GET, POST | /api/v1/day_end_settlements | Day-End Settlement |
| POST | /api/v1/devices { kind: "rider" } | a rider's phone as a device; PIN login issues a rider token |

Permissions: RIDERS, RIDER_VIEW, RIDER_CREATE, RIDER_EDIT, RIDER_DELETE, DUMMY_RIDER_VIEW, DUMMY_RIDER_CREATE, DUMMY_RIDER_EDIT, DUMMY_RIDER_DELETE; MY_TILL; PAYROLL.

## Phase 7 additions (11 Oct 2026, SPEC "Customers, credit, loyalty and feedback", "Settings and multi-outlet", report catalogue)

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/reports/grand_spec, /sales, /sales_calendar?month, /operations, /vouchers, /loyalty_points, /regular_discounts, /ai_pricing, /ai_stock_forecast (?refresh=true) | the SPEC report catalogue; /reports/grand carries `spec` too |
| GET, POST, PATCH, DELETE | /api/v1/regular_discount_tiers | recency tiers; settings marketing.regular_discounts.enabled and .blocked_customer_ids |
| GET, POST, PATCH, DELETE | /api/v1/voucher_batches; POST /:id/issue; GET /vouchers | batches, personal codes, redemptions |
| POST | /api/v1/orders/:id/discounts { voucher_code } | redeem a voucher (no cashier limit) |
| GET, POST, PATCH, DELETE | /api/v1/loyalty/redemption_options; POST /orders/:id/redeem_option | redemption options |
| GET, POST, PATCH /:id/rate, DELETE | /api/v1/reviews (+ /summary) | reviews with filters rating, source, order_type, pending |
| GET, POST, PATCH, DELETE | /api/v1/whatsapp/templates; GET /whatsapp/variables; POST /whatsapp/send; POST /whatsapp/bulk | account notifications |
| GET | /api/v1/customers/insights?sort=; GET /customer_payments; POST /customers/:id/send_statement | customer screens |
| GET, PATCH | /api/v1/website_config | the builder sections, slug, published |
| GET | /api/v1/public/storefront/:slug; POST .../reviews | the public storefront |

## Push notifications and WhatsApp by QR (11 Oct 2026)

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/push/public_key | VAPID public key |
| GET, POST, DELETE | /api/v1/push/subscriptions | this member's browser subscriptions (app admin, pos, kitchen, rider) |
| POST | /api/v1/push/test | a test push to the caller |
| GET | /api/v1/whatsapp/connection | provider, status (disconnected, qr, connecting, connected, unavailable), qr image, phone |
| POST | /api/v1/whatsapp/connection/start, /logout | begin pairing, unlink the phone |

Environment: `WHATSAPP_GATEWAY_URL`, `WHATSAPP_GATEWAY_TOKEN` (the gateway in `easalpha-whatsapp/`), optional `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Setting `whatsapp.provider` chooses web (linked phone) or cloud (Meta).

## Help and Support, Branding and the Super panel (11 Oct 2026)

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/platform | public: product name, support email, WhatsApp, phone, hours, docs link, powered-by line, announcement and its level, version. Read by every panel's Help box |
| GET, POST | /api/v1/support_requests { subject, message, category (question, problem, billing, feature, other), page } | the Help box: staff write to EasAlpha support; managers see the whole business, others their own; a reply arrives as `reply`, `replied_at`, status `answered`, plus a notification linking to /admin/support |
| GET | /api/v1/support_sessions; POST /:id/approve, /:id/deny, /:id/end | the owner's side of a EasAlpha support login (existing); end stops an approved session before its hour is up |
| PATCH | /api/v1/business { logo_key } | the business logo (an /uploads URL); returned on GET /business, the receipt, the storefront and QR ordering |
| POST | /api/v1/super/login; GET /super/me | the product owner's login (a `super` token, 8 hours) |
| GET | /api/v1/super/stats, /super/health | businesses by status, signups, orders today, open support requests, pending support sessions; database, jobs, failed tax invoices and WhatsApp |
| GET, PATCH | /api/v1/super/businesses (?q, ?status), /:id { status, trial_ends_on, plan_id } | every business; the detail carries branches, staff, devices, orders in 30 days, last order, open support requests and recent support sessions |
| GET | /api/v1/super/support_requests (?status, ?business_id); POST /:id/reply { reply }, /:id/close | the support inbox |
| GET | /api/v1/super/support_sessions; POST /super/support_sessions { business_id, reason }; POST /:id/token | request access to a business, then, once approved, a token that acts as the owner: only for the super admin who asked (403 support.not_yours), marked as support, refused sign-in, staff, device and billing changes, and ending with the session (existing) |
| GET | /api/v1/super/invoices (?status); POST /:id/confirm; POST /super/billing/run_lifecycle | billing (existing) |
| GET, PUT | /api/v1/super/feature_flags | global or per-business flags (existing) |
| GET | /api/v1/super/plans | the plan list for the business detail's plan selector (PATCH /super/businesses/:id { plan_id }) |
| GET, PUT | /api/v1/super/platform_settings { values } | EasAlpha's own branding: product_name, support_email, support_whatsapp, support_phone, support_hours, support_url, docs_url, powered_by, announcement, announcement_level, downloads_url (the installer folder and update feed), desktop_version (what the Download page offers). A blank value restores the default |

Tables: `support_requests` (tenant, RLS), `platform_settings` (key, jsonb value; not tenant data). Dev super admin from `db/seeds.rb`: admin@easalpha.com / admin12345; the panel is at /super.

## Online ordering from the storefront (11 Oct 2026)

| Method | Path | Action |
|---|---|---|
| POST | /api/v1/public/storefront/:slug/orders { lines: [{ product_id, variant_id, quantity }], order_type: delivery or takeaway, customer: { name, phone, address, area, city }, notes, client_id } | public: the cart becomes an order with source `online` that waits in the cashier's queue (`qr_status` pending); the order goes on the storefront's own customer for that phone (found or created, source online, with the delivery address saved on them), or on no customer when the phone belongs to any other customer, the guest's phone and typed address then staying on the order (guest_phone, delivery_address); the delivery charge is the zone's when the address is in a delivery zone, else the one from Charges & Tax, and is waived above the website's free-delivery threshold; the website's minimum order is enforced. Returns the guest view with a `guest_token` |
| GET | /api/v1/public/storefront/:slug/orders/:id?guest_token= | public tracking: `stage` is waiting, accepted, preparing, ready, on_the_way, done, rejected or cancelled, plus items, totals and the delivery ETA |
| GET | /api/v1/qr_orders (?source=qr or online) | the accept-or-reject queue now holds website orders beside QR table orders; rows carry `address_text` and `notes` |

Error codes: online.closed, online.maintenance, online.no_delivery, online.order_type, online.empty, online.name, online.phone, online.address, online.min_order. A new order raises a notification of kind `online_order`.

## Customer accounts, barcodes, wages and modules (12 Oct 2026)

Modules: `modules.customer_accounts` and `modules.payroll` in the settings store; only the owner may change them (403 `modules.owner_only`). Login and `GET /me` return `modules: { customer_accounts, payroll }`; `PATCH /settings` returns the new `modules`. While a module is off its endpoints answer 403 `module.disabled` and the till refuses khata payments.

| Method | Path | Action |
|---|---|---|
| GET | /api/v1/customers/duplicates?name=&phone=&member_no=&guardian_phone=&exclude_id= | possible duplicates with reasons |
| POST | /api/v1/customers | also room, member_no, guardian_name, guardian_phone, notify_guardian, opening_balance_minor, opening_reason, opening_on, approver_pin |
| POST | /api/v1/customers/import | CSV adds room, roll_no, guardian_name, guardian_phone, credit_limit, opening_balance |
| GET | /api/v1/customers/:id/ledger?from=&to= | entries with running balance; a period adds brought_forward_minor, totals, closing_balance_minor |
| GET | /api/v1/customers/:id/adjustments | adjustments and the open opening balance |
| POST | /api/v1/customers/:id/adjustments | { kind: opening or adjustment, amount_minor (signed), reason, effective_on?, approver_pin? } (khata.adjust or a manager PIN) |
| POST | /api/v1/customer_adjustments/:id/reverse | { reason, approver_pin? } |
| GET | /api/v1/customers/:id/bill?from=&to=&due_on= | bill JSON with the public link (default: last month) |
| GET | /api/v1/customers/:id/bill.pdf | the bill as an A4 PDF |
| POST | /api/v1/customers/:id/send_bill | WhatsApp to the customer (and guardian) with the PDF attached through a linked phone; 409 whatsapp.not_connected when no phone is linked (nothing is marked sent) |
| GET | /api/v1/customer_bills?from=&to=&min_balance_minor=&q=&all= | one summary row per customer |
| GET | /api/v1/customer_bills.pdf?from=&to=&customer_ids[]= | every bill in one PDF |
| GET | /api/v1/bill_runs | bill run history |
| GET | /api/v1/bill_runs/:id | one run with per-customer results |
| POST | /api/v1/bill_runs | send bills now { from, to, due_on?, customer_ids?, min_balance_minor? }; 409 whatsapp.not_connected when no phone is linked; a row is "sent" only when its message was queued; GET /bill_runs/:id shows live counts while a run is going; the month-end job sends from the bill day on and carries on a run cut short |
| GET | /api/v1/public/bills/:token | public bill (signed token, 120 days) |
| GET | /api/v1/public/bills/:token/pdf | public bill PDF |
| GET | /api/v1/products/barcodes?q= | every barcode with product, size, price and format |
| GET | /api/v1/products/barcode_lookup?code= | what a scanned code adds (404 barcode.unknown) |
| POST | /api/v1/products/:id/barcodes | attach a code { code, variant_id?, quantity?, approver_pin? } |
| DELETE | /api/v1/products/:id/barcodes/:barcode_id | remove a code |
| POST | /api/v1/products/barcodes/generate | { count } free in-store EAN-13 codes |
| PUT | /api/v1/products/:id | also barcodes: [{ code, variant_id? or variant_name?, quantity? }] (replaces) |
| GET | /api/v1/wages/due?day= | daily and weekly staff with suggested wage and what is paid; attendance entries carry `recorded` (false for a day filled by the payroll rules: holiday, approved leave, weekly off, else absent unless a no-scan day is not absent); an employee keeps attendance when fingerprint-enrolled or with a scanned or hand-marked day in the period or the 30 days before; working days after today are left out |
| GET | /api/v1/wages/preview?employee_id=&from=&to= | suggested wage for a period (same attendance rules as /wages/due) |
| GET | /api/v1/wages?employee_id=&from=&to=&status= | wage payments with totals |
| POST | /api/v1/wages | pay one wage |
| POST | /api/v1/wages/batch | pay a day's wages, row by row |
| POST | /api/v1/wages/:id/void | { reason } |
| GET | /api/v1/employees/:id/statement?from=&to= | employee statement (wage rows dated on the branch business day, never after the pay day) |
| POST | /api/v1/employees/:id/send_statement | WhatsApp the statement; 409 whatsapp.not_connected when no phone is linked (also for POST /whatsapp/bulk and customer send_statement) |
| POST | /api/v1/employees/:id/send_statement | WhatsApp the statement summary |

New settings keys: `khata.notify_each_sale`, `khata.notify_adjustments`, `khata.monthly_bills.enabled|day|due_days|min_balance (rupees)|attach_pdf`, `payroll.whatsapp.advance_paid|wage_paid|salary_paid`, `pos.barcode_scanning.prefix|suffix|terminator|min_length|max_key_interval_ms|beep|camera|unknown_code|scale_barcodes|scale_prefixes|scale_item_digits|scale_value|scale_decimals`. New permissions: `khata.adjust`, `wages.pay`. New job: `MonthlyBillsJob` daily at 09:30 Asia/Karachi.

## Fix rounds and final round (6 and 7 Nov 2026)

From fix round 2 and the final round's packages P1 to P11, merged on 6 and 7 Nov 2026. A manager's PIN now approves only what the till showed: an `approval.required` answer (403) names the codes in `details.permissions`, with their labels in `details.labels`, and the request goes again with `approver_pin` and `approval_codes` (those codes). The PIN grants only those codes, each to a holder of that PIN who has it. A PIN sent without `approval_codes` (a till from before 6 Nov 2026) keeps the old rule for one release and is logged `[approval.legacy]`. This holds for every endpoint that takes `approver_pin`, and for `approver_pin` and `approval_codes` on sync records.

| Method | Path | Action |
|---|---|---|
| POST | /api/v1/auth/signup { name, business_name, email and password or phone and otp_code, country?, currency?, time_zone?, locale? } | a missing country comes from the phone's dialling code, then the time zone, else PK; the currency and time zone follow the country unless given. A phone given with an email sign-up goes on the login unproven, and stays off it when another login holds it (the business keeps it as its phone); 409 signup.exists for an email already on a login, or a phone another login proved |
| POST | /api/v1/auth/login { email, password, app?, business_id? } | opens a membership whose role opens the app asked for, the one this person signed in to last; 404 business.not_member for a business_id the login is not in; 403 app.denied when none opens the app |
| POST | /api/v1/auth/otp/request { phone, purpose } | purpose login, signup or verify_phone (a new phone for PATCH /me); the same answer whether or not an account has the phone; a login code is sent only to a phone that has an account or a waiting staff invitation |
| POST | /api/v1/auth/otp/verify { phone, code, password?, new_login?, app?, business_id? } | the code proves the phone, not the login it sits on: a login that never proved it and has an email of its own needs its password once (403 phone.password_required with details.invitations; 401 login.invalid for a wrong one). Staff invitations waiting for the phone join the login the code opens, or a new login with new_login: true; a number nobody holds signs in only to join an invitation (404 otherwise). Joining a role that does not open the app answers 403 app.denied with details.joined |
| POST | /api/v1/auth/password/forgot { email } | a six-digit code by email, valid 15 minutes, at most five an hour; the same answer whether or not an account has the email; 400 email.invalid |
| POST | /api/v1/auth/password/reset { email, code, password } | sets the password, signs out every session of the login and confirms the email (a phone on a login whose email was unproven goes back to unproven); { reset: true }; 401 code.invalid |
| POST | /api/v1/auth/refresh | the refresh token spent in the last 30 seconds is answered with the same successor, so two tabs refreshing one session both carry on; 401 session.invalid once the membership is not active; a POS session also gets sync_key and sync_key_id |
| POST | /api/v1/auth/switch { business_id } | only a session the person opened themself: a till PIN session or a support token gets 403 session.switch_denied; the membership there must open the same app (403 app.denied) |
| GET | /api/v1/me | adds support { session_id, reason, expires_at, by: { name, email } } during an EasAlpha support session; user, here and in every session answer, carries phone_verified and email_verified |
| PATCH | /api/v1/me { name, locale, email, phone, password, current_password?, otp_code?, email_code? } | a new email or phone needs the current password, or the code sent to it (POST /auth/otp/request with purpose verify_phone, POST /me/email_code), which also proves it; a new password needs the current one; nothing is saved before every check passes. 400 password.current_wrong, 400 contact.verification_required, 409 phone.taken or email.taken when another login proved it (one that holds it unproven gives it up only to a code), 403 me.pin_session for anything but locale from a till PIN session |
| POST | /api/v1/me/email_code { email? } | a code to confirm that email (the login's own when none is given) for PATCH /me; { sent, email, expires_in }; 409 code.too_many after five in an hour; 400 email.invalid |
| GET | /api/v1/invitations/:token | public: business { name, logo_key }, role, name, proof (phone or email), to (masked), status (pending, accepted, cancelled or expired), expires_at; 404 invitation.not_found |
| POST | /api/v1/invitations/:token/code | a code to the invited phone by WhatsApp, or to the email; { sent, to, expires_in }; 409 code.too_many after five in an hour; 409 invitation.closed once it was cancelled, expired or accepted |
| POST | /api/v1/invitations/:token/accept { code, password?, new_login?, new_password? } | joins with the login that phone or email belongs to, or with a new login: 201 with a session and joined: true when the role opens the admin, else 201 { joined, business, role, has_pin, message }. 401 code.invalid; 409 invitation.sign_in (details.kind) when that login never proved it and has a way in of its own: send its password, or new_login: true; 401 login.invalid for a wrong password |
| GET | /api/v1/staff, /staff/:id | phone, email, PIN state and sign-in times only for staff.manage or the member themself; anyone else gets the name, role, status, branches and staff type |
| POST | /api/v1/staff | links an existing login only by a phone or email that login proved, or that is its only way in; the answer then carries linked_existing_user: true and the login keeps its own name and password. Any other match answers 202 { invited: true, invitation } and nothing is linked until the person proves it. 409 staff.exists when the person is already a member, 409 staff.invited when an invitation for the phone or email already waits, 409 pin.taken |
| PATCH | /api/v1/staff/:id { name } | renames only a login this business made; a linked login keeps its holder's name (403 staff.linked_user) |
| POST | /api/v1/staff/:id/reactivate | 409 pin.taken when another active member took the PIN meanwhile |
| GET | /api/v1/staff/:id/permissions | adds apps: the apps the set opens (admin, pos, kitchen, rider) |
| GET | /api/v1/staff/invitations | pending invitations: id, name, phone, email, role, staff_type, cashier_role, has_pin, status, expires_at, created_at, url (the link opens nothing without the code) and rider_id; staff.manage |
| POST | /api/v1/staff/invitations/:id/resend | sends the message again and gives 14 more days |
| DELETE | /api/v1/staff/invitations/:id | cancels the invitation (204) |
| POST, PATCH | /api/v1/staff, /staff/:id { role_id } | a member put on the system Rider role (added, moved onto it, or joining by an accepted invitation) gets an active rider profile, as POST /riders makes: their own rider brought back if it was deactivated, else a rider on the same phone that has no login, else a new one with the login's name and phone on the member's one branch (no branch, so every branch lists it, for a member on all branches or several) |
| POST | /api/v1/riders { create_login: true, pin } | answers linked_existing_user (true when a login of theirs was linked, false when one was made); a phone on a login that never proved it answers invited: true with the invitation (rider_id set, listed by GET /staff/invitations) and a rider with no login yet; 409 staff.exists when the phone is already on a member of this business |
| POST | /api/v1/invitations/:token/accept | for a role without the admin, the message names where to sign in with the PIN: the rider app for a rider, else the till |
| GET | /api/v1/exports/staff | needs staff.manage as well (phones and emails) |
| POST | /api/v1/support_sessions/:id/end | the owner (settings.manage) ends an approved session before its hour is up; its token stops at once (401 support.ended) |
| POST | /api/v1/super/support_sessions/:id/token | only for the super admin who asked and was approved (403 support.not_yours); the token acts as the owner, is marked as support and lasts until the session's expires_at; the answer adds expires_at and support |
| POST | /api/v1/devices/pin_login | the PIN's holder is found by an indexed lookup; a till sign-in also answers sync_key and sync_key_id, the same on every refresh of it |
| PATCH | /api/v1/settings | a value outside its range, or not a whole number where one is needed, is refused (400 bad_request) with a message that names the setting as the screen does; money keys take paisa; the secret keys are refused to EasAlpha support (403 support.denied) |
| PATCH | /api/v1/business | country (two letters), currency (three letters) and time_zone (an IANA zone) are checked (422); a time zone change moves the branches that were on the old zone; the setup item business_info needs the name, phone and logo |
| POST, PATCH | /api/v1/branches, /branches/:id | code is 1 to 8 of A-Z and 0-9, upper-cased (a code saved before the rule is kept); a new branch without time_zone takes the business's; tax_registration takes authority, ntn, strn, pos_id and token (a blank token keeps the saved one), and token_clear: true removes the token; the business-day fields complete the branch_hours setup item |
| GET | /api/v1/branches, /branches/:id | tax_registration carries authority, ntn, strn and pos_id only, and for settings.manage token_set and token_hint ("ends 1234"); the token never leaves the server (receipts, /me and session answers carry the public numbers only) |
| GET | /api/v1/health | adds rls: whether Row-Level Security binds the API's database role |
| GET | /api/v1/audit_logs | rows add entity (the table as a person reads it) and super_admin_id; a row EasAlpha support wrote has no user_id and user_name "EasAlpha support (name)"; before and after come back with secrets redacted |
| GET | /api/v1/audit_logs/entities | adds entity_labels (table to label) and action_labels (every action the API writes, with its label) |
| GET | /api/v1/audit_logs/insights | by_actor rows are { user_id, super_admin_id, name, count }: a support person's rows are named "EasAlpha support (name)" as in the list, apart from "System" (rows nobody signed in made) |
| GET | /api/v1/exports/audit_logs | times in the business's time zone, after redacted, and a support_admin_id column |
| GET | /api/v1/products?archived=true | the archived products on their own, so one can be found and restored |
| POST | /api/v1/products/:id/restore | an archived product back on the menu and the till, active, with its barcodes; 409 product.category_archived when its category is archived |
| PATCH | /api/v1/products/:id | active: true on an archived product restores it; a null discount_type and discount_value mean no discount (kept as 0 percent) |
| DELETE | /api/v1/products/:id | archives the product and keeps its barcodes; a code another product claims later moves to that product |
| POST | /api/v1/categories | menu_id is optional: without one the category goes into the default menu, made on first use |
| POST, PATCH | /api/v1/deals | valid_from and valid_to are days (YYYY-MM-DD) compared with the business's own date, and come back as days; valid_to before valid_from is refused (422) |
| GET | /api/v1/stations | a screen paired as a kitchen display reads its own branch's stations with its device token alone |
| GET | /api/v1/stock_items/categories | readable with stock.view, stock.actions, stock.waste, stock.count or menu.edit, as the items are |
| POST | /api/v1/orders (the id of a paid, closed, voided or refunded order), PATCH /orders/:id, POST /orders/:id/tax_choice | 409 order.closed with the order in details.order, so the till starts a new order instead of adding lines to a finished one |
| PATCH | /api/v1/orders/:id | client_created_at is ignored (only a create dates an order). A change of customer once khata was taken on the order is 409 order.customer_locked, online and at sync. address_id must be one of the order's customer's addresses (422 order.address; one kept through a customer change is dropped); a delivery to an address in a zone takes the zone's charge when the request names none, moving the address applies it again, and the delivery follows the order's address, zone and charge until it is delivered. The regular discount is updated in place and keeps its tier while the customer stays |
| GET | /api/v1/orders?q= | % and _ match themselves; a receipt number (yymmdd-CODE-serial) is an exact, case-insensitive match on any day |
| GET | /api/v1/orders/:id | adds address_text (the saved address, or what a storefront guest typed) and guest_phone; summaries carry address_id; lines carry label_price_minor |
| POST, PATCH | /api/v1/orders, /orders/:id lines[].label_price_minor | a scale label's printed price on a product sold by weight: the line charges that price and its weight is worked out at the unit price, kept through saves and order-type changes; null or a price override makes it an ordinary weighed line; 422 label.no_weight when the weight comes below 0.001 of the unit |
| POST | /api/v1/orders/:id/complete | 409 order.overpaid with details { refund_minor, paid_minor, total_minor } when the order was paid above its total: refund the excess first, which the open order takes; a staff meal or zero-total order completed here gets a receipt number and paid_at |
| POST | /api/v1/orders/bulk_complete | an overpaid order waits; the answer adds skipped_overpaid |
| POST | /api/v1/orders/:id/reopen { approver_pin?, approval_codes? } | a till user with orders.create but not REOPEN_ORDER reopens with a manager's PIN for REOPEN_ORDER |
| POST | /api/v1/orders/:id/payments { payments, tip_minor, approver_pin?, approval_codes? } | a role with orders.create but not payments.take (a waiter) pays with a manager's PIN for payments.take (403 approval.required names it; the approver is audited); a payment adds to what was already paid; each payment is dated by the business day the money moved; 422 payment.method_internal for the canteen's company subsidy or salary deduction method; a sale on account is refused while a bill is overdue beyond `khata.credit_hold_days` (409 khata.overdue), judged by what is still unpaid on it |
| POST | /api/v1/orders/:id/refunds | a part refund of a settled order corrects the sale: the order stays paid with nothing due. On an order never completed a part payment can go back (the order stays open and owes it; once it holds nothing it can be voided); a reopened order gives back only what it was paid above its total until it is completed again (409 refund.order_open). 409 refund.too_much with details.refundable_minor; 422 refund.method_internal; a refund is dated by the day the money goes back |
| POST | /api/v1/orders/:id/discounts | refused on a locked day (409 day.locked). A coupon: one per order (409 coupon.one_per_order); its minimum order checked now and on every recalculation (409 coupon.min_order with details.min_order_minor and order_minor); a product or category coupon needs one of its items on the order (409 coupon.no_items) and comes off those lines only, never a line the request names |
| DELETE | /api/v1/orders/:id/discounts/:discount_id | refused on an order that can no longer change (409 order.not_editable) or on a locked day (409 day.locked); a coupon taken off gives its use back |
| POST | /api/v1/orders/:id/void | 409 order.paid also while an open order still holds a part payment: give it back first |
| GET | /api/v1/orders/:id/receipt | header, footer, language and paper from the pos.receipt.* settings (a branch row over the business row); branch.tax_registration carries the public numbers only; lines carry unit and label_price_minor |
| POST | /api/v1/qr/:token/orders { ..., client_id } | one submit at a time per table; a retry with the same client_id answers the order it made or was added to, even once that is paid; on a table with an open order, a waiter's too, the round goes onto that order and waits for the cashier |
| GET | /api/v1/qr_orders | rows add guest_phone and waiting_items (the guest's round that waits); a round on a table a waiter opened at the till waits here too (?source=qr includes it); pending rows are listed from the previous business day on |
| POST | /api/v1/qr_orders/:id/reject | takes off that round's lines only |
| POST | /api/v1/public/storefront/:slug/orders | a guest attached to no customer keeps phone and address on the order (guest_phone, delivery_address), not in the notes; the delivery zone, and its charge, come from the typed address; two submits with the same client_id make one order |
| GET | /api/v1/deliveries, /deliveries/:id, /rider/deliveries | rows add address_text, customer_name and phone: the customer's, or a storefront guest's from the order |
| GET | /api/v1/rider/deliveries, /rider/float; POST /rider/deliveries/:id/status | 403 rider.none ("No rider profile is linked to this login") for a login with no active rider profile; the rider app shows "Your login has no rider profile yet" instead of loading |
| GET | /api/v1/riders/:id/settlement_preview | cash_collected_minor is the cash on delivery still owed (orders not paid yet); collected_total_minor is all the cash collected and paid_at_till_minor the part the till already took as those orders' payments |
| POST | /api/v1/riders/:id/settle | cash on delivery is taken as the order's cash payment, once; 409 settle.no_cash_method without an active cash method |
| GET | /api/v1/kitchen/orders | from the previous business day on by default, so an order still cooking at the day end stays; leaves out the customer's name and phone; an order stays while any line is cooking, whatever its status (a paid order stays until the kitchen bumps it) |
| POST | /api/v1/kitchen/orders/:id/bump { station_id? } | from a station's screen that station's lines go ready, and the order once every station's are; a bump on a paid or completed order marks its lines ready (ready_at set) and leaves its status |
| POST | /api/v1/kitchen/items/:id/bump | a line added to a ready order goes ready with the order left ready; an order past the kitchen keeps its status |
| GET | /api/v1/kitchen/queue, /kitchen/ready | follow the lines as the display does: preparing while a line cooks, ready once the kitchen bumped it (an order already paid, a takeaway paid at once, shows as ready for 15 minutes after the bump); readable with a till or tablet device token alone |
| GET | /api/v1/shifts | rows add cashier_name |
| GET | /api/v1/shifts/current | the shift open on this till, so a second cashier signed in there sees the shift their cash goes into |
| POST | /api/v1/shifts/:id/cash_movements { kind, amount_minor, reason, reference?, movement_id?, category_id?, paid_to?, approver_pin?, approval_codes? } | cash_in comes from the branch's safe as far as it holds; drop goes to the safe; payout is an expense in category_id (Petty cash when none) paid to paid_to; cash_out goes to Owner's Drawings (3020). Allowed on the member's own shift, on any shift with shifts.any, and on the shift open on this till; without cash.in_out, or above the role's cash.in_out limit (rupees), 403 approval.required for shifts.any |
| POST | /api/v1/shifts/:id/close | the count's over or short goes to 5195 Cash Over and Short and the float goes back to the safe |
| GET | /api/v1/shifts/:id/z_report | staff meals are out of the sales; cash lists every drawer row (opening_minor, cash_sales_minor, cash_refunds_minor, khata_collected_minor, khata_paid_out_minor, cash_in_minor, cash_out_minor, drops_minor, payouts_minor, expenses_minor, supplier_payments_minor, supplier_refunds_minor, rider_float_minor, other_minor), adding up to expected_minor, with counted_minor and over_short_minor |
| POST | /api/v1/shifts/:id/settle | moves the shift's own counted takings to the company cash account, not the whole drawer; 409 settle.no_cash_account when there is none |
| GET, POST | /api/v1/day_end_settlements | force-closed shifts are settled too; each shift's detail adds cashier, expected_minor, counted_minor, over_short_minor and float_to_safe_minor beside amount_minor |
| GET | /api/v1/day_close | shifts add cashier, settlement_status, expected_minor and counted_minor; net sales, discount and tax follow the one revenue rule |
| POST | /api/v1/payment_accounts { kind: "safe", branch_id? } | a branch's safe (under 1050 Cash in Safe), where drops go and floats come from; one made for no branch serves every branch without its own; it is banked with POST /payment_accounts/:id/transfer |
| POST | /api/v1/sync/push records: [{ signed, signed_by, sig, approver_pin?, approval_codes? }] | signed is the JSON text of { type, id, membership_id?, payload }; sig is the base64url (no padding) HMAC-SHA256 of those exact bytes with the sync_key of the session that queued the record, and signed_by is its sync_key_id (POST /devices/pin_login, POST /auth/refresh). A record naming another member than the signed-in cashier is taken only with that member's signature, from a sign-in on this till that was running at the record's time. A till build from before sends { type, id, membership_id?, approver_pin?, approval_codes?, payload } unsigned: until 1 Dec 2026 such a record naming another member is still taken under the old rule (signed in on this till within 60 days) and logged `[sync.unsigned]`; after that it is refused |
| POST | /api/v1/sync/push (record rules) | shift_open, shift_close and cash_movement records get the shift endpoints' checks (permission, own shift or shifts.any, branch, kind, fingerprint); a shift_close may carry its own id with payload.shift_id; payment records need payments.take on the member who took the money, or a manager's PIN on the record (approval.required otherwise); order_update records with client_seq are applied once per till and order (a re-send answers duplicate), and one with status placed places a draft the till sent to the kitchen; order lines are matched by the till's own line ids; a queued order a manager already made a staff meal can be edited without orders.staff_meal, which only switching the flag on needs; customer_payment records are refused on a locked day; an old till's tip on every split is taken once |
| POST | /api/v1/sync/rejections/:id/resolve | from a till (its Dismiss), :id may be the record's own id: that record's open refusals from this till are resolved, every member's for OFFLINE_ORDERS or settings.manage, the member's own for anyone else; from the admin it needs settings.manage, devices.manage, reports.view_all or reports.view_branch. A till has one open refusal per record, resolved when the record goes through |
| POST | /api/v1/customers | 409 customer.phone_exists also when two saves of one phone race |
| POST | /api/v1/attendance/check_in { pin } | the PIN's holder is found by lookup among staff with an employee record; wrong PINs count against this device or member (401 pin.locked after five) |
| POST | /api/v1/expenses, /suppliers/:id/payments, /purchase_orders/:id/pay, /purchase_returns, /customers/:id/payments | the canteen's internal methods are refused (400 expense.method, supplier_payment.method, purchase_return.method, khata.method); supplier payments, purchase returns and goods received are refused on a locked day (409 day.locked) |
| POST | /api/v1/finance/journal | 400 journal.future_date for a voucher dated after today |
| GET | /api/v1/finance/profit_loss?from&to | the books' own figure, equal to the balance sheet's current earnings: orders; revenue { revenue_minor, gross_sales_minor, discounts_minor, refunds_minor, service_charge_minor, delivery_charge_minor, rounding_minor, net_sales_minor, tax_collected_minor, tips_minor }; cost_of_goods_minor, gross_profit_minor, gross_margin_percent; operating { expenses_minor, expenses_by_category, waste_minor, stock_differences_minor, other_minor, other (every other income or expense entry, by account), total_minor }; net_profit_minor, net_margin_percent; books { income_minor, expenses_minor, net_minor }; not_booked { overheads_minor, overheads, commissions_minor, aggregator_commission_minor, total_minor, net_after_minor } |
| GET | /api/v1/reports/overview, /by_day, /by_hour, /items, /categories, /cashiers, /order_takers, /customers, /discounts, /grand, /sales, /sales_calendar, /cashier_till, /branches, /commissions, /dashboard | one revenue rule: a sale counts on its order's business day at its total (paid, closed, or refunded since; never a staff meal), a refund on its own day, and money handed back while an order was open is no refund; refunds take tax, charges, tips and rounding back in the journal's shares. Staff meals are out of items, categories, top sellers and commissions; by hour reads when an order was settled; the branch dashboard and Valuation & COGS value the branch's own stock |
| POST | /api/v1/stock_documents/:id/post, /receive, /dispatch, /approve, /submit, /cancel | the document is locked and its status checked under the lock, so a void and a receive, or two receives, never both move stock; waste, counts, transfers and production are refused on a closed business day (409 day.locked); a transfer whose dispatch day was locked since is received or voided into today, and cannot arrive before it left (409 stock.before_dispatch); a count line without a counted quantity is refused (422 stock.count_missing); a backdated count cannot go behind a later count (409 stock.later_count); a void books the revaluation it causes to 5210 Stock Revaluation |
| POST | /api/v1/production_batches | refused on a closed business day (409 day.locked) |
| POST | /api/v1/stock/deduction_health/:order_id/retry | lines already in step stay as they are; a line that found no recipe when it was checked is tried again. Every order line keeps the stock quantity its rows stand for, so an edited reopened order moves stock by the difference |
| POST | /api/v1/payroll/runs | a cancelled run no longer blocks generating that month again, for a branch too |
| POST | /api/v1/payroll/runs/:id/pay | the run is locked while it pays (a second Pay is 409 payroll.status); tips are shared once a month and commission counts every branch for an all-branches run |
| GET | /api/v1/employees, /employees/:id | base_salary_minor and components only for payroll.manage or PAYROLL; staff.manage alone gets the rest of the employee, pay_frequency and shares_tips included. The same for the employee in the answers of POST /attendance/enrol and /attendance/revoke |
| POST, PATCH | /api/v1/employees, /employees/:id | base_salary_minor, pay_frequency, shares_tips and components need payroll.manage or PAYROLL (403 permission.denied, the message naming the keys sent); without them a new employee starts on a monthly salary of 0 |
| GET, POST, DELETE | /api/v1/employees/components, /employees/components/:id | salary components: payroll.manage or PAYROLL, no longer staff.manage |
| GET | /api/v1/canteen/today | the day is the session's: a night session past the day end stays on the day it opened; adds business_day and branch { time_zone, day_end }; a staff session also gets counts.refused and refused (meals a kiosk took offline that the sync refused) |
| POST | /api/v1/canteen/refused/:id/resolve { resolution: fixed or dismissed } | a refused offline meal dealt with: put on the worker's account by hand, or let go (canteen.manage; 204) |
| GET | /api/v1/canteen/claims | with no date, every day still being served (dates in the answer), so a night session's tokens stay at the counter past the day end |
| GET | /api/v1/canteen/sync | adds dates, time_zone, day_end and fingerprint_salt; every worker is listed whatever `canteen.manual_lookup` says, with fingerprint_hash (SHA-256 of the salt and the reader id), never the reader id, phone or CNIC; plans of the next business day too when published |
| GET | /api/v1/canteen/workers | a paired device is refused while `canteen.manual_lookup` is off (403 canteen.manual_lookup); phone and CNIC only for canteen.manage |
| GET | /api/v1/canteen/workers/:id | canteen.manage only, no longer a kiosk call |
| POST | /api/v1/canteen/claims | a device's claim by employee_id is refused while `canteen.manual_lookup` is off (403 canteen.manual_lookup); a claim replayed from the sync queue is judged at its scan time within 72 hours (409 canteen.too_old after that); one meal per worker per session |
| GET | /api/v1/campaigns, /campaigns/:id, /campaigns/:id/stats | MARKETING, MARKETING_CAMPAIGN, MARKETING_CAMPAIGN_LOG or settings.manage; customers.manage no longer opens them |
| POST, PATCH, DELETE | /api/v1/campaigns, POST /campaigns/:id/send, GET /campaigns/audience | MARKETING_CAMPAIGN or settings.manage |
| POST | /api/v1/voucher_batches/:id/issue | settings.manage, MARKETING or MARKETING_CAMPAIGN; orders.create no longer sends vouchers |
| PATCH | /api/v1/website_config | slug, published and the identity, availability, signups, delivery, pricing, contact, whatsapp and system sections need settings.manage; menu.edit keeps the content sections |

Money at a till: cash moved at a till (a sale, a refund, a khata collection, an expense, a payout) lands in the shift open on that till, whoever is signed in, and every money row is dated by the business day the money moves; a reversal keeps the original's shift. The float comes from the branch's safe and goes back at the count, so it is no longer new capital every shift. New accounts in the chart: 5170 Staff Meals (the company's share of subsidised canteen meals), 5195 Cash Over and Short and 5210 Stock Revaluation; a safe account sits under 1050. The canteen's company subsidy is booked to Staff Meals and the salary deduction to Salaries; tips paid through payroll clear Tips Payable; supplier openings are journaled; a purchase return is booked at the stock value it takes out. Data tasks for records made before these rules (`finance:backfill_khata_refunds`, `finance:backfill_supplier_openings`, `finance:reclass_internal_methods`, `orders:repair_part_refunds`, `audit:redact`) are in docs/DEPLOY.md.

Error codes: 400 email.invalid, password.current_wrong, contact.verification_required, journal.future_date, purchase_return.method; 401 code.invalid, support.ended; 403 support.denied, support.not_yours, session.switch_denied, phone.password_required (details.invitations), me.pin_session, staff.linked_user; 404 invitation.not_found; 409 pin.taken, staff.invited, invitation.closed, invitation.sign_in (details.kind), code.too_many, phone.taken, email.taken, order.closed (details.order), order.overpaid (details.refund_minor, paid_minor, total_minor), order.customer_locked, coupon.one_per_order, coupon.min_order (details.min_order_minor, order_minor), coupon.no_items, product.category_archived, settle.no_cash_account, settle.no_cash_method, stock.before_dispatch, stock.later_count, canteen.too_old; 422 order.address, label.no_weight, payment.method_internal, refund.method_internal, stock.count_missing. Changed: approval.required and pin.required (403) carry details.permissions and details.labels; refund.too_much carries details.refundable_minor; app.denied carries details.joined after an invitation join. A sync record can be refused with sync.signed, actor.signature, actor.session_ended and, from 1 Dec 2026, actor.unsigned; a refusal is a result row in the push answer (status rejected, code, message, details), not an HTTP error.

Permission rules: the Manager template has no PAYROLL, which implies payroll.manage, and migration 20261107100000 takes it from existing Manager roles, and roles copied from them, that do not hold payroll.manage. Pay is payroll's too: an employee's salary or wage, pay type, tips sharing and salary components, and the salary components endpoints, need payroll.manage or PAYROLL, while staff.manage keeps the employee list and profile, departments, attendance rules, leave, holidays and fingerprints (wages.pay keeps the daily and weekly staff's rates on the wage screens). A role's EasAlpha codes no longer tick MARKETING_CAMPAIGN or MARKETING_CONTACTS (customers.manage), or DASHBOARD and VIEW_DAILY_SALES (app.pos, reports.view_own); the same migration takes the two campaign codes from custom sets the old editor saved for cashiers. The Cashier and Manager presets (GET /roles/presets) give exactly the access of those roles, and the Supervisor preset the Cashier's plus its own SPEC codes. A PIN another active member holds is refused wherever a PIN is set (409 pin.taken). An EasAlpha support token is refused (403 support.denied) for PATCH /me and POST /me/email_code, staff and role changes, staff invitations, device pairing and changes, billing choose_plan and report_payment, support session approve, deny and end, the secret settings keys, PATCH /integrations/foodpanda and the WhatsApp connection; it stops with its session (401 support.ended), and the audit rows it writes name the support person.

Settings keys: `khata.overdue.remind_after_days` defaults to 0, so no reminder goes out until the owner sets the days. `security.cashier_drawer` is no longer a setting: no code read it, and cash always lands in the drawer of the shift open on the till; a stored value is ignored and PATCH /settings answers 400 settings.unknown_key for it. `big_void_alert_minor` and `cash_short_alert_minor` are of type money (paisa; the screen shows rupees). Ranges: `khata.monthly_bills.day` 1 to 28; `khata.monthly_bills.due_days`, `khata.overdue.remind_after_days` and `khata.credit_hold_days` 0 to 365; `khata.monthly_bills.min_balance`, `charges.service_charge.value`, `charges.delivery_charge.value` and both alert amounts 0 or more; `pos.lock_minutes` 0 to 1440; `pos.kds.timeout_minutes` 1 to 1440; `pos.barcode_scanning.min_length` 1 to 64, `.max_key_interval_ms` 1 to 1000, `.scale_item_digits` 1 to 10 and `.scale_decimals` 0 to 4; `pos.pending_reminder.red_minutes_before_close` 0 to 1440; `catalog.display.columns` 3 to 6; `pos.print_server.port` 1 to 65535; `cash_rounding` and `total_rounding` 0 to 1000; `tax.rate_cash_percent` and `tax.rate_card_percent` 0 to 100.

Live updates (/cable): access is checked again when a channel is subscribed and every minute after, so a removed till or a deactivated member loses an open socket. The orders stream is for sessions that take orders (orders.create or kitchen.view) in the admin or on a till or tablet, never a device token alone; the kitchen stream for a kitchen screen, or a session with the kitchen display's permissions; the tokens stream for token, kitchen, till and tablet screens.

Rate limits: the login and OTP limits read the email or phone from a JSON body, a form or the query string alike; POST /invitations/* is limited to 20 a minute per address; QR table ordering is counted per table, 300 reads and 30 sends a minute, beside the address limit. A throttled request answers 429 rate_limited.
