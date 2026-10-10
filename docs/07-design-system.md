# Servio: Design System and Colour Scheme

Date: 8 Oct 2026. Source: the blueprint's UI and UX guidelines, the ArfaPOS audit, and a validated chart palette.

> **10 Oct 2026: `SPEC.md` is the requirement.** Where this file differs from `SPEC.md`, `SPEC.md` wins. The differences are listed in `PDF-ALIGNMENT.md`; the extras in this file stay. The text before this change is kept in `archive/before-spec-2026-10-10/`.

> `SPEC.md` does not change Servio's design: the PDF says the clone keeps its own look. It asks for one chart library and one palette everywhere, and these shared admin patterns: a filter bar with its state in the URL, a KPI tile row, a data table with server-side paging, sorting and CSV or PDF export, a right-hand detail drawer with tabs, a multi-step form with a section rail, and an empty state with a primary action.
>
> Colours: on 10 Oct 2026 the owner chose Material Design 3 with a blue primary (seed #1A73E8, primary #005BBF) and Roboto, and the app uses it. The teal palette and Inter font below are out of date.


One design system serves two very different screens: the till is built for speed and touch, the admin panel for clarity. Both use the same tokens, so a colour means the same thing everywhere.

---

## 1. Principles

- One primary colour, one accent. Green is money in, red is money out and alerts. Nothing else is coloured for decoration.
- Numbers you can trust: PKR with thousands separators, at most 3 decimals, units always shown, one formatter for money, dates and phones.
- Colour never carries meaning alone: every status has an icon or a word beside it.
- Touch targets at least 48 px on the till; text at least 14 px in the admin and 16 px on the till.
- Every page tested at 1366 px laptop, 1024 px tablet and 390 px phone.

---

## 2. Colour scheme (superseded on 10 Oct 2026 by Material Design 3, blue primary; kept as the original proposal)

Brand primary is **teal 600**, chosen over indigo so Servio does not look like ArfaPOS, which is indigo and purple. The accent is **amber 500**, used for highlights and the order-type switch, never for buttons.

### 2.1 Brand

| Token | Light | Dark | Use |
|---|---|---|---|
| `--primary` | `#0d9488` teal 600 | `#2dd4bf` teal 400 | Primary buttons, active sidebar item, links, focus ring |
| `--primary-hover` | `#0f766e` teal 700 | `#5eead4` teal 300 | Hover and pressed |
| `--primary-soft` | `#ccfbf1` teal 100 | `#134e4a` teal 900 | Selected rows, active chips, soft badges |
| `--primary-fg` | `#ffffff` | `#042f2e` | Text on primary |
| `--accent` | `#f59e0b` amber 500 | `#fbbf24` amber 400 | Order-type switch, highlights, the "most popular" plan |
| `--accent-soft` | `#fef3c7` amber 100 | `#78350f` amber 900 | Soft highlight backgrounds |

Full teal ramp for reference: 50 `#f0fdfa`, 100 `#ccfbf1`, 200 `#99f6e4`, 300 `#5eead4`, 400 `#2dd4bf`, 500 `#14b8a6`, 600 `#0d9488`, 700 `#0f766e`, 800 `#115e59`, 900 `#134e4a`.

### 2.2 Semantic

| Token | Light | Dark | Use |
|---|---|---|---|
| `--success` | `#16a34a` green 600 | `#4ade80` green 400 | Money in, paid, completed, online badge |
| `--danger` | `#dc2626` red 600 | `#f87171` red 400 | Money out, voids, refunds, negative stock, errors, destructive buttons |
| `--warning` | `#d97706` amber 600 | `#fbbf24` amber 400 | Pending, unassigned rider, offline badge, low stock |
| `--info` | `#2563eb` blue 600 | `#60a5fa` blue 400 | Syncing badge, informational banners, preparing |
| soft variants | 100-step of each hue | 900-step of each hue | Badge backgrounds |

### 2.3 Neutrals and surfaces (slate)

| Token | Light | Dark |
|---|---|---|
| `--bg-page` | `#f8fafc` slate 50 | `#0f172a` slate 900 |
| `--bg-card` | `#ffffff` | `#1e293b` slate 800 |
| `--bg-sidebar` | `#0f172a` slate 900 | `#020617` slate 950 |
| `--bg-muted` | `#f1f5f9` slate 100 | `#334155` slate 700 |
| `--border` | `#e2e8f0` slate 200 | `#334155` slate 700 |
| `--text-primary` | `#0f172a` slate 900 | `#f8fafc` slate 50 |
| `--text-secondary` | `#475569` slate 600 | `#cbd5e1` slate 300 |
| `--text-muted` | `#94a3b8` slate 400 | `#64748b` slate 500 |
| `--sidebar-text` | `#cbd5e1` slate 300 | `#cbd5e1` |
| `--sidebar-active` | `--primary` on `#134e4a` | `--primary` on `#134e4a` |

The sidebar is dark in both modes, as the ArfaPOS one is, so the active teal item stands out.

### 2.4 CSS variables

```css
:root {
  color-scheme: light;
  --primary: #0d9488; --primary-hover: #0f766e; --primary-soft: #ccfbf1; --primary-fg: #ffffff;
  --accent: #f59e0b; --accent-soft: #fef3c7;
  --success: #16a34a; --danger: #dc2626; --warning: #d97706; --info: #2563eb;
  --success-soft: #dcfce7; --danger-soft: #fee2e2; --warning-soft: #fef3c7; --info-soft: #dbeafe;
  --bg-page: #f8fafc; --bg-card: #ffffff; --bg-muted: #f1f5f9; --bg-sidebar: #0f172a;
  --border: #e2e8f0; --text-primary: #0f172a; --text-secondary: #475569; --text-muted: #94a3b8;
  --radius: 8px; --radius-lg: 12px; --shadow-card: 0 1px 2px rgba(15, 23, 42, 0.06);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { color-scheme: dark;
    --primary: #2dd4bf; --primary-hover: #5eead4; --primary-soft: #134e4a; --primary-fg: #042f2e;
    --accent: #fbbf24; --accent-soft: #78350f;
    --success: #4ade80; --danger: #f87171; --warning: #fbbf24; --info: #60a5fa;
    --success-soft: #14532d; --danger-soft: #7f1d1d; --warning-soft: #78350f; --info-soft: #1e3a8a;
    --bg-page: #0f172a; --bg-card: #1e293b; --bg-muted: #334155; --bg-sidebar: #020617;
    --border: #334155; --text-primary: #f8fafc; --text-secondary: #cbd5e1; --text-muted: #64748b; }
}
:root[data-theme="dark"] { /* same values as the dark block above */ }
```

Tailwind: map `primary`, `accent`, `success`, `danger`, `warning`, `info`, `page`, `card`, `muted`, `border` to these variables in `tailwind.config` so components use `bg-primary`, `text-danger` and never raw hex.

### 2.5 Colour by meaning in the product

| Thing | Colour | Also shown as |
|---|---|---|
| Order type: dine-in | teal | Icon of a plate |
| Order type: takeaway | amber | Icon of a bag |
| Order type: delivery | blue | Icon of a motorbike |
| Order type: walk-in | slate | Icon of a cup |
| Status: Pending or Preparing (SPEC) | blue | Word and timer |
| Status: Ready (SPEC) | green | Word and sound on the token screen |
| Status: Dispatched (SPEC) | amber | Word and rider |
| Status: Completed (SPEC) | teal | Word |
| Status: Cancelled (SPEC) | red | Word and reason |
| Extras: Held | slate | Word |
| Extras: Refunded | red | Word and reason |
| Payment: unpaid | amber | Word |
| Payment: paid | green | Method name |
| Rider: unassigned | amber | Word |
| Sync badge: online, offline, syncing | green, amber, blue | Word and pending count |
| Table: available, occupied, reserved, maintenance (SPEC); bill requested (extra) | green, amber, blue, slate; teal | Word on the table card |
| Stock: below zero or low | red, amber | Number with SHORT or LOW |
| Money in, money out | green, red | Sign and arrow |

### 2.6 Chart palette, validated

Categorical colours are assigned in this fixed order and never cycled. The palette passed the lightness, chroma, colour-blind separation, normal-vision separation and contrast checks in both modes (validator run 8 Oct 2026 on surfaces `#ffffff` light and `#1e293b` dark).

| Slot | Hue | Light | Dark |
|---|---|---|---|
| 1 | teal | `#0d9488` | `#0d9488` |
| 2 | orange | `#eb6834` | `#d95926` |
| 3 | blue | `#2a78d6` | `#3987e5` |
| 4 | yellow | `#eda100` | `#c98500` |
| 5 | magenta | `#e87ba4` | `#d55181` |
| 6 | green | `#008300` | `#008300` |
| 7 | violet | `#4a3aa7` | `#9085e9` |
| 8 | red | `#e34948` | `#e66767` |

Rules:

- Yellow and magenta sit under 3:1 contrast on the light surface, and green sits at 2.96:1 on the dark card, so any chart using slots 4, 5 or 6 shows direct labels or a table view.
- Scatter, bubble and small-multiple charts use at most the first three slots; more series fold into "Other".
- Sequential ramps use one hue, teal, light to dark: `#ccfbf1`, `#99f6e4`, `#5eead4`, `#2dd4bf`, `#14b8a6`, `#0d9488`, `#0f766e`, `#115e59`.
- Diverging charts use blue to red with a neutral grey midpoint `#f0efec` light, `#383835` dark.
- Status colours in charts are the semantic tokens with an icon and label, never a series colour.
- Text in charts uses text tokens, never the series colour. One y-axis per chart, never two. Axis units always correct: the ArfaPOS "Weekly Orders" chart labelled counts as Rs; the review checklist for every chart is title, axis unit, legend for two or more series, today vs same day last week.

---

## 3. Typography

| Use | Font | Size and weight |
|---|---|---|
| English UI | Roboto (Material Design 3; was Inter) | Admin base 14 px regular, headings 20 and 24 semibold; till base 16 px, item names 18 semibold, totals 32 bold |
| Urdu UI and receipts | Noto Nastaliq Urdu | 1.25 times the English size for the same line; line height 1.9; right-to-left layout |
| Numbers | Roboto with `font-variant-numeric: tabular-nums` | Columns of money align; never proportional digits in tables |
| Code and IDs | JetBrains Mono | SKUs, order ids, invoice numbers |

Money format: `Rs 1,487,366` in Pakistan, `AED 1,250.00`, `£12.50`; negative as `-Rs 5,037` in red. Dates: `7 Oct 2026, 12:59 pm` everywhere; ISO only in exports. Phones: `+92 301 4840243`.

---

## 4. Spacing, shape, elevation

- Spacing scale: 4, 8, 12, 16, 24, 32, 48 px. Page gutter 24 px on desktop, 16 px on phone.
- Corner radius 8 px for controls and cards, 12 px for dialogs, full round for badges and avatars.
- Borders 1 px `--border`; cards use a border plus a 1 px shadow, never heavy shadows or gradients.
- Icons: Lucide, 20 px in the admin, 24 px on the till, stroke 1.75.

---

## 5. Components

| Component | Rules |
|---|---|
| Primary button | Teal fill, white text, 40 px tall in the admin, 48 px on the till, 56 px for Pay. One per screen. |
| Secondary button | Card background, border, text primary. |
| Destructive button | Red fill only for void, refund and delete-type actions; always opens a confirm dialog. No bulk destructive buttons anywhere. |
| Summary card | Label 12 px muted, number 24 px semibold, sub-label 12 px, icon in a soft tint on the right. 3 to 6 per row, wrapping on narrow screens. |
| Badge | Soft background, 12 px semibold text, icon or word. Status, payment, role, source. |
| Table | 48 px rows in the admin, sticky header, sortable columns with arrows, right-aligned numbers, zebra off, hover highlight. Never clipped on the right: columns collapse into a details drawer below 1024 px. |
| Filter bar | Search with a placeholder naming the fields, date preset, dropdowns, in one row; wraps on phone. |
| Empty state | Icon, one-line headline, one-line hint, one primary button for the first action, optional sample-data button. |
| PIN dialog | Large numeric keypad, 4 dots, who is approving and what, both names saved on confirm. |
| Toast | Bottom right, 4 seconds, success green, error red with a retry action. |
| Order card on the till | Serial large, type icon and colour band on the left, status badge, customer, total; no delete icon. |
| Item tile on the till | Photo or illustrated category placeholder, name on two lines max, price; 48 px minimum, 96 px on a tablet. |

---

## 6. Layouts

Admin panel: sidebar with the SPEC layout: Dashboard, Orders, Expenses and Tables, then the groups Products, Inventory, Inventory Reports, Purchasing, Suppliers, Customers, Staff, Finance, Payroll, Reports, Riders and Settings; modules not switched on hidden; page header with icon, title, one-line description and actions on the right; then summary cards, filter bar, list. Global search with Ctrl K.

Till: three columns, categories left, item grid centre, order and Pay right; order-type switch across the top; shift and sync badges in the title bar; keyboard shortcuts listed in `05-desktop-app.md`.

Kitchen display: one column per order in station colour, timer turning red after the store's order timeout in minutes (SPEC; off by default), with a one-shot sound when it first turns red, bump button the full card width.

Customer site: single column, menu categories as a sticky horizontal scroller, cart as a bottom sheet, primary button pinned to the bottom.

---

## 7. Dark mode and high contrast

- Dark mode is a selected set of tokens, not an inverted palette; chart colours are re-stepped for the dark surface as in section 2.6.
- High-contrast mode for bright counters raises text to pure black on white, borders to slate 500 and removes soft tints.
- Both are per device on the till and per user in the admin.

---

## 8. Receipts and kitchen tickets

- 58 mm: 32 characters per line; 80 mm: 48 characters. Monospace layout generated server side, Urdu rendered as a bitmap.
- Receipt order: logo, restaurant name and branch, serial and date, cashier, items with modifiers and quantities, subtotal, discounts, service charge, tax lines, rounding, total, payments and change, FBR or PRA invoice number and QR, khata balance when on account, WhatsApp number for feedback, "DUPLICATE" on reprints.
- Kitchen ticket: station name, serial, order type and table, time, items with modifiers and notes in large type; CHANGED or CANCELLED banner when applicable.

---

## 9. Accessibility checklist

- [ ] Text contrast at least 4.5:1, UI elements at least 3:1, in both modes
- [ ] Touch targets at least 48 px on the till
- [ ] Visible focus ring in teal on every control
- [ ] No status by colour alone: icon or word always present
- [ ] Urdu right-to-left layout tested on every screen
- [ ] Charts have a legend for two or more series and a table view
