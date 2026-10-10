# Phase 1: Foundation (SPEC phases, started 10 Oct 2026)

Gate: login and permissions work end to end. Scope is section 3 of `PDF-ALIGNMENT-SHORT.md`, Phase 1 row. Each step ends with green tests and a commit. Nothing already built is removed.

| # | Step | Deliverable | Tests |
|---|---|---|---|
| 1 | Permission registry | The 57 named SPEC codes with module, label, description, surface (software, app, both) and restriction, beside the 46 Servio codes; each SPEC code lists the Servio codes it implies | Model spec: registry counts, implies, expansion |
| 2 | Presets | Cashier, Supervisor, Manager presets (SPEC) beside the 7 role templates; `GET /roles/presets` | Request spec |
| 3 | Per-user grants | `user_permissions` table; membership `permissions_mode` role or custom; `GET/PUT /staff/:id/permissions` with preset apply and select all; effective codes = granted set expanded with implied codes | Happy, denied, edge (owner cannot lose access; unknown code) |
| 4 | Token | Access token carries `perms`; base controller reads them from the token, so a change applies at the next refresh or sign-in | Spec: old token keeps old set, new login gets new set |
| 5 | Surface | Badge on each SPEC code; a software-only code is refused on a tablet-paired device and an app-only code on a desktop POS | Spec with a tablet device |
| 6 | Staff types | `memberships.staff_type` admin, cashier, order_taker; `cashier_role` cashier, supervisor, kitchen_display; filter on `/staff` | Spec |
| 7 | User sessions | `GET /staff/sessions` from refresh tokens (user, app, device, IP, signed in, signed out, active), `POST /staff/sessions/:id/revoke` | Spec |
| 8 | Business day | `branches.business_day_start` (default 06:01) and end default 02:01 for new branches; serializers and `PATCH /branches/:id` | Spec: order at 01:30 belongs to the previous day |
| 9 | Settings store | `settings` table (business, branch, key, value, version); registry of keys grouped as SPEC's five areas with defaults; `GET /settings`, `PATCH /settings`, `GET /settings/version`; `Business#setting` reads it first; sync payload carries the version | Spec |
| 10 | Audit everything | `Audited` concern on every tenanted model (except caches and tokens); SPEC action names; append-only trigger; filters by date, actor, action, entity; CSV export | Spec: create, update, delete rows; update to a log row is refused |
| 11 | Web: sidebar and routes | NAV in the SPEC layout (4 standalone + 12 groups, SPEC screen names); folders moved to the SPEC route roots with redirects from the old paths | Vitest on nav; Playwright smoke on every moved page |
| 12 | Web: screens | Permission editor (module list with granted-of-total, Software/App/Both badges, RESTRICTION, 3 presets, Select all); Admin Staff, Cashiers, Order Takers, User Sessions; Business Hours; Settings in five areas; audit log filters and export | Vitest for the editor; Playwright for the gate |
| 13 | Gate | Log in, change a user's permissions, sign in again, see the new menu; run the full suite; screenshots; BUILD-LOG | Full suite green |
