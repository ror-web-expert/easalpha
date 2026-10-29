# EasAlpha documentation

EasAlpha is a cloud restaurant POS sold by subscription in Pakistan and internationally. These files are the build reference for the development team, written on 8 Oct 2026 from the build blueprint, an audit of 64 ArfaPOS admin screenshots, and the EasAlpha Feature Specification v1.

| File | Contents |
|---|---|
| [DEPLOY.md](DEPLOY.md) | **Production**: easalpha.com on the shared server, GitHub pipeline (push = deploy), DNS and Caddy, daily operations, backup |
| [SETUP.md](SETUP.md) | **Install and run**: developer machine on Ubuntu or Mac, Docker server, shop LAN, desktop installers for Linux, Windows and Mac, automatic builds on GitHub, update and backup |
| [RUNBOOK.md](RUNBOOK.md) | Services, environment variables, tests, where things are, production notes |
| [PRODUCT-READY.md](PRODUCT-READY.md) | What is built, test counts, how to run |
| [TESTING-GUIDE.md](TESTING-GUIDE.md) | Demo logins, pairing codes and a suggested walk-through |
| [SPEC.md](SPEC.md) | **The requirement, top priority from 10 Oct 2026.** The PDF "ARFAPOS Clone — Functional Spec & Build Plan" as text; the PDF itself is [SPEC.pdf](SPEC.pdf) |
| [PDF-ALIGNMENT-SHORT.md](PDF-ALIGNMENT-SHORT.md) | One-page version: rules, numbers, the 16 conflicts, what to build per phase, extras, open questions |
| [PDF-ALIGNMENT.md](PDF-ALIGNMENT.md) | Every SPEC feature against these docs and the app; the conflicts, now settled the SPEC way; the EasAlpha extras that stay and why each was added; testing and open questions |
| [01-features.md](01-features.md) | Every feature by module with source, phase and include status; open decisions; roles and permissions; business rules; data model additions |
| [02-technology.md](02-technology.md) | Architecture, stack, repositories, environments, API rules, data model, tenant isolation, security, integrations, hardware, development process, roadmap |
| [03-mobile-app.md](03-mobile-app.md) | EasAlpha POS on tablet and waiter phone, rider app, stock count on phone, customer ordering site and QR, branded customer app, notifications |
| [04-offline-online.md](04-offline-online.md) | What works offline, how the till syncs, conflict rules, kitchen and rider behaviour, device data safety, test scenarios |
| [05-desktop-app.md](05-desktop-app.md) | EasAlpha POS desktop till: screens, shortcuts, printing, performance, security, updates; kitchen display; customer display and token screen |
| [06-implementation-plan.md](06-implementation-plan.md) | How to build it: week 0 foundations, the 7 SPEC phases (the original 10-sprint plan is kept for reference), working agreements, pilot launch, risks, first-week tasks |
| [07-design-system.md](07-design-system.md) | Colour scheme with light and dark tokens, colour by meaning, validated chart palette, typography, components, layouts, receipts, accessibility |
| [08-database-schema.md](08-database-schema.md) | PostgreSQL schema: conventions, Row-Level Security, about 110 tables with columns in 9 groups, the SPEC additions, relationships, indexes and constraints |
| [09-canteen.md](09-canteen.md) | **Canteen (factory mess), 29 Oct 2026**: fingerprint kiosk, meal sessions and daily plans, tokens and the counter, worker accounts and payroll deduction, offline behaviour, API |

Companion documents on claude.ai:

- EasAlpha: ArfaPOS Feature Audit and Blueprint Corrections (audit, full ArfaPOS functionality, revised Part 1)
- EasAlpha Feature Specification v1 (decisions and include dropdowns for verification before the build starts)
- [EasAlpha: PDF Spec vs EasAlpha Docs](https://claude.ai/code/artifact/5830de61-ca3f-49eb-9998-f837c6596a09) (live copy of `PDF-ALIGNMENT.md`)

Order of authority: `SPEC.md`, then `PDF-ALIGNMENT.md`, then `01` to `08`. The 7 decisions in `01-features.md` are settled by `SPEC.md`. The text of `01` to `08` before 10 Oct 2026 is kept in `archive/before-spec-2026-10-10/`.
