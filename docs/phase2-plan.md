# Phase 2: Catalog, plus the desktop application (started 10 Oct 2026)

Gate: the menu renders in the POS. Scope is the Phase 2 row of `PDF-ALIGNMENT-SHORT.md` section 3, read against `SPEC.md` "Menu and catalog". The owner also asked for a desktop application in this phase.

| # | Step | Deliverable | Tests |
|---|---|---|---|
| 1 | Product fields | `products.discount_value`, `discount_type` (percent or amount), `pct_code`; `categories.subtitle`; `deals.is_favourite` | Request spec |
| 2 | Image upload | `POST /uploads` (PNG, JPG, WEBP, max 5 MB) through Active Storage; `image_key` holds the served path; used by products, categories and deals | Spec: type and size refused |
| 3 | Order Inventory per product | `order_type_consumables` (product, variant, order type, item, quantity, unit); `GET/PUT /products/:id/consumables` with `copy_all_order_types`; deducted with the sale beside the branch packaging rules | Spec: copy, deduction |
| 4 | Quick Add Menu | `quick_add_items` (product, variant, position); `GET/PUT /quick_add_items`; in the catalog sync | Spec |
| 5 | Online visibility | A hidden menu or category keeps its products off the QR menu while staff can still sell them | Spec |
| 6 | Display Settings and Product Codes | Settings keys `catalog.display.*` (images on tiles, columns, show prices, show inactive); `GET /products/codes` and `PUT /products/codes` for SKU and PCT in bulk | Spec |
| 7 | Web: three-tab product form | Basic Info (image, name, description, base price, discount with %/Rs switch, PCT code, variant rows), Ingredients (recipe per variant), Order Inventory (per order type and variant, Copy all order types) | Vitest for the discount and copy helpers; Playwright |
| 8 | Web: Arrange and Quick Add | Drag-and-drop Arrange mode for categories and products; Quick Add Menu screen; deal favourite; category subtitle; Download Menu, Import JSON, Display Settings and Product Codes panels on the Catalog page | Vitest; Playwright |
| 9 | POS | Quick Add bar on the running order; favourited deals in Favourites; discount on the product applied at pricing; images from the upload path | Playwright: till tiles |
| 10 | Desktop application | `servio-desktop/` Electron app: loads the POS, direct ESC/POS printing to network and USB printers, the print server tablets print through (SPEC Print Server), printer setup behind PRINTERS; Windows installer and Linux build | Unit tests for the ESC/POS encoder; a packaged Linux build |
| 11 | Gate | Menu renders in the POS with images, quick add and deals; full suites green; screenshots; build log | Full suite |
