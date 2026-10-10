# Servio documentation

Servio is a cloud restaurant POS sold by subscription in Pakistan and internationally. These files are the build reference for the development team, written on 8 Oct 2026 from the build blueprint, an audit of 64 ArfaPOS admin screenshots, and the Servio Feature Specification v1.

| File | Contents |
|---|---|
| [01-features.md](01-features.md) | Every feature by module with source, phase and include status; open decisions; roles and permissions; business rules; data model additions |
| [02-technology.md](02-technology.md) | Architecture, stack, repositories, environments, API rules, data model, tenant isolation, security, integrations, hardware, development process, roadmap |
| [03-mobile-app.md](03-mobile-app.md) | Servio POS on tablet and waiter phone, rider app, stock count on phone, customer ordering site and QR, branded customer app, notifications |
| [04-offline-online.md](04-offline-online.md) | What works offline, how the till syncs, conflict rules, kitchen and rider behaviour, device data safety, test scenarios |
| [05-desktop-app.md](05-desktop-app.md) | Servio POS desktop till: screens, shortcuts, printing, performance, security, updates; kitchen display; customer display and token screen |
| [06-implementation-plan.md](06-implementation-plan.md) | How to build it: week 0 foundations, 10 Phase 1 sprints with goals and done criteria, working agreements, pilot launch, risks, first-week tasks |
| [07-design-system.md](07-design-system.md) | Colour scheme with light and dark tokens, colour by meaning, validated chart palette, typography, components, layouts, receipts, accessibility |
| [08-database-schema.md](08-database-schema.md) | PostgreSQL schema: conventions, Row-Level Security, 87 tables with columns in 9 groups, relationships, indexes and constraints |

Companion documents on claude.ai:

- Servio: ArfaPOS Feature Audit and Blueprint Corrections (audit, full ArfaPOS functionality, revised Part 1)
- Servio Feature Specification v1 (decisions and include dropdowns for verification before the build starts)

Open decisions are listed at the top of `01-features.md`. The build starts once they are set and the specification is verified.
