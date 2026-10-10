# Decisions the spec did not settle

Running log, as `SPEC.md` asks. One line per choice, newest last. Each says what SPEC left open and what Servio does.

| Date | Area | SPEC leaves open | Servio does |
|---|---|---|---|
| 2026-10-10 | Tenancy | Calls the tenant an outlet with `outlet_id` on every table | Keeps `business_id` and `branch_id` (owner's answer: yes). A branch is the SPEC outlet. |
| 2026-10-10 | Apps | Names a rider app and an order-taker tablet app, no technology | Both are installable pages inside the web app, like the POS (owner's answer: yes). |
| 2026-10-10 | Tools | Sidekiq, Devise, Zod, Vitest, one repo | Keeps Solid Queue and the own JWT login (owner: "best and fast, just the features"). Adds Zod and Vitest. Two folders stay. |
| 2026-10-10 | Permission codes | Lists 57 named codes and says 58; one Orders code is unnamed and the fourth Suppliers code is only described as Record Supplier Payment | Registry holds the 57 named codes plus `SUPPLIER_RECORD_PAYMENT` for the described one. The unnamed Orders code is added when the owner names it. |
| 2026-10-10 | Permission codes | SPEC codes are UPPER_SNAKE; Servio's 46 existing codes are dotted | Both live in one registry. Each SPEC code lists the Servio codes it implies, so existing checks keep working; the 46 Servio-only codes show in the editor as a "Servio extras" module. |
| 2026-10-10 | Permissions per user | Presets are shortcuts; grants are per user | A membership is in `role` mode (codes come from its role, as before) until its grants are edited; then it is in `custom` mode and `user_permissions` is the whole truth. Presets fill the editor. |
| 2026-10-10 | Next sign-in | A change takes effect at next sign-in | The access token carries the granted codes and lives 15 minutes; refresh re-reads the database. So a change applies at the next refresh or sign-in, within 15 minutes. |
| 2026-10-10 | Surface | Software = desktop POS, App = tablet | Desktop POS = the web POS on a non-tablet device; App = the web POS on a device paired as a tablet. Admin requests ignore the surface. |
| 2026-10-10 | Business day | Default 06:01 to 02:01 | New branches get that default. Existing branches keep their saved end time until changed on the Business Hours screen. |
| 2026-10-10 | Audit log | Every create, update and delete | A model concern on every tenanted model except caches and tokens (stock levels, refresh tokens, OTP codes, sync batches, notifications, audit logs). |
