import type { NextConfig } from "next";

const API_ORIGIN = (() => { try { return new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1").origin; } catch { return "http://localhost:3001"; } })();
// Cloudflare, in front of easalpha.com, injects its Web Analytics beacon into every page; the policy allows that one
// script and the address it reports to, as Cloudflare documents, so the browser no longer logs a blocked-script error
// on every page (which also cost the Lighthouse best-practices score).
const CLOUDFLARE_BEACON = "https://static.cloudflareinsights.com";
const CLOUDFLARE_RUM = "https://cloudflareinsights.com";
type Extra = { script?: string; style?: string; img?: string; font?: string; connect?: string; frame?: string };
const add = (base: string, more?: string) => (more ? `${base} ${more}` : base);
/** One policy, with extra sources per surface. Scripts and styles come from this origin (Next's own inline bootstrap
 *  needs 'unsafe-inline'; a per-request nonce would make every page dynamic), and pages talk to the API. */
function policy(x: Extra = {}): string {
  return [
    "default-src 'self'",
    add(`script-src 'self' 'unsafe-inline' ${CLOUDFLARE_BEACON}`, x.script),
    add("style-src 'self' 'unsafe-inline'", x.style),
    add("img-src 'self' data: blob:", x.img),
    add("font-src 'self' data:", x.font),
    add(`connect-src 'self' ${API_ORIGIN} ${API_ORIGIN.replace(/^http/, "ws")} ${CLOUDFLARE_RUM}`, x.connect),
    ...(x.frame ? [`frame-src 'self' ${x.frame}`] : []),
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/** Google Tag Manager runs on the public pages only (components/site/tag-manager.tsx). These are the hosts Google lists
 *  for Tag Manager, Google Analytics 4 and Tag Manager's preview mode (Tag Assistant). A tag added in Tag Manager that
 *  loads from elsewhere (an ads pixel, a chat widget) needs its hosts here too, or the browser blocks it. */
const GOOGLE_TAGS: Extra = {
  script: "https://www.googletagmanager.com https://*.googletagmanager.com https://tagmanager.google.com",
  style: "https://tagmanager.google.com https://fonts.googleapis.com",
  img: "https://*.google-analytics.com https://*.googletagmanager.com https://ssl.gstatic.com https://www.gstatic.com",
  font: "https://fonts.gstatic.com",
  connect: "https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
  frame: "https://www.googletagmanager.com https://tagassistant.google.com",
};
const CSP = policy(GOOGLE_TAGS);

/** Appendix A.1: the admin, the platform console and the login page get the policy without Google's hosts, with images
 *  also allowed from the API (uploaded logos and product pictures) and over https. The till is left out for now: it
 *  talks to the print server on the shop's own network (http://<lan address>), which a policy would have to allow
 *  wholesale. */
const APP_CSP = policy({ img: `${API_ORIGIN} https:` }) + "; worker-src 'self'";
const APP_HEADERS = [
  { key: "Content-Security-Policy", value: APP_CSP },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

/** The marketing pages and the sign-up page; app screens are everything else. */
const PUBLIC_PAGES = "/(features|pricing|download|contact|privacy|terms|signup|guides|restaurant-pos-pakistan|fbr-pos-integration|offline-pos-system|kitchen-display-system|restaurant-inventory-software)";
const PUBLIC_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// Old admin paths (before the SPEC sidebar, 10 Oct 2026) keep working through redirects.
const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  // Metadata always in <head>, for every visitor: by default Next streams async metadata (the restaurant storefront's
  // generateMetadata) into <body> for browsers that are not known bots, and Chrome only reads the app manifest from
  // <head>, so a restaurant's site could not be installed. Every other page has static metadata and is unaffected.
  htmlLimitedBots: /.*/,
  // NEXT_DIST_DIR lets a second build (for the browser gate) sit beside the one a running `next start` is serving.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // WebP only: an AVIF encode of one 1440x900 screenshot took the production server (2 CPUs) tens of seconds when
  // several cold sizes were asked for at once, and it held the page's load event with it. The screenshots never
  // change under one name, so optimised copies are kept for 30 days instead of the 60-second default.
  images: { formats: ["image/webp"], minimumCacheTTL: 60 * 60 * 24 * 30 },
  // Rewrite barrel imports from these packages to direct module imports so each page only bundles the pieces it uses.
  experimental: { optimizePackageImports: ["lucide-react", "recharts", "date-fns"] },
  // Browser protections on every page: HTTPS only (a year, with subdomains), no MIME sniffing, no framing by other sites,
  // a tight referrer, and the camera only for this site (the till's barcode scanner). The API sends its own set.
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // geolocation for this site only: the rider app records where each delivery is picked up and delivered.
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=()" },
      ],
    }, {
      // The public site only: a Content-Security-Policy and a same-origin opener policy. Scripts and styles come from
      // this origin (Next's own inline bootstrap needs 'unsafe-inline'; a per-request nonce would make every page
      // dynamic), the sign-up form talks to the API, and the analytics script and collector are first-party under
      // /stats. The admin, the platform console and the login page follow with APP_HEADERS (Appendix A.1); the till,
      // kitchen, rider and storefront screens are still left out (cameras, the print server, guest payment pages).
      source: "/",
      headers: PUBLIC_HEADERS,
    }, {
      source: PUBLIC_PAGES,
      headers: PUBLIC_HEADERS,
    }, ...["/admin", "/admin/:path*", "/super", "/super/:path*", "/login"].map((source) => ({ source, headers: APP_HEADERS }))];
  },
  // The self-hosted Umami (deploy/docker-compose.yml) answers at /stats: its UI, its tracker script and its collector,
  // all first-party, so no DNS, certificate or Caddy change is needed and ad blockers leave it alone.
  async rewrites() {
    const umami = (process.env.UMAMI_INTERNAL_URL || "http://umami:3000").replace(/\/$/, "");
    return [{ source: "/stats", destination: `${umami}/stats` }, { source: "/stats/:path*", destination: `${umami}/stats/:path*` }];
  },
  async redirects() {
    return [
      // Review 5.1: a sidebar section's own address opens its first page instead of a 404 (temporary, so a page added
      // at that address later is not hidden behind a cached redirect).
      { source: "/admin/products", destination: "/admin/products/catalog", permanent: false },
      { source: "/admin/finance", destination: "/admin/finance/dashboard", permanent: false },
      { source: "/admin/inventory", destination: "/admin/inventory/stock-in-hand", permanent: false },
      { source: "/admin/inventory-reports", destination: "/admin/inventory-reports/daily-stock-sheet", permanent: false },
      { source: "/admin/riders", destination: "/admin/riders/manage", permanent: false },
      // The ArfaPOS comparison page was taken down on 17 Oct 2026 at the owner's request; links already shared or
      // indexed land on the plans instead of a 404.
      { source: "/arfapos-alternative", destination: "/pricing", permanent: true },
      // One hostname for search engines: www is a permanent redirect to the apex, path and query kept.
      { source: "/:path*", has: [{ type: "host", value: "www.easalpha.com" }], destination: "https://easalpha.com/:path*", permanent: true },
      { source: "/admin/stock/deduction-audits", destination: "/admin/inventory-reports/deduction-health", permanent: true },
      { source: "/admin/stock/deduction-audits/:path*", destination: "/admin/inventory-reports/deduction-health/:path*", permanent: true },
      { source: "/admin/menu/modifier-groups", destination: "/admin/products/modifier-groups", permanent: true },
      { source: "/admin/menu/modifier-groups/:path*", destination: "/admin/products/modifier-groups/:path*", permanent: true },
      { source: "/admin/purchasing/suppliers", destination: "/admin/suppliers", permanent: true },
      { source: "/admin/purchasing/suppliers/:path*", destination: "/admin/suppliers/:path*", permanent: true },
      { source: "/admin/purchasing/receipts", destination: "/admin/purchasing/goods-received", permanent: true },
      { source: "/admin/purchasing/receipts/:path*", destination: "/admin/purchasing/goods-received/:path*", permanent: true },
      { source: "/admin/purchasing/reorder", destination: "/admin/inventory/demand", permanent: true },
      { source: "/admin/purchasing/reorder/:path*", destination: "/admin/inventory/demand/:path*", permanent: true },
      { source: "/admin/purchasing/returns", destination: "/admin/purchasing/purchase-returns", permanent: true },
      { source: "/admin/purchasing/returns/:path*", destination: "/admin/purchasing/purchase-returns/:path*", permanent: true },
      { source: "/admin/stock/consumption", destination: "/admin/inventory-reports/consumption", permanent: true },
      { source: "/admin/stock/consumption/:path*", destination: "/admin/inventory-reports/consumption/:path*", permanent: true },
      { source: "/admin/purchasing/orders", destination: "/admin/purchasing/purchase-orders", permanent: true },
      { source: "/admin/purchasing/orders/:path*", destination: "/admin/purchasing/purchase-orders/:path*", permanent: true },
      { source: "/admin/purchasing/report", destination: "/admin/purchasing/purchases-report", permanent: true },
      { source: "/admin/purchasing/report/:path*", destination: "/admin/purchasing/purchases-report/:path*", permanent: true },
      { source: "/admin/settings/branches", destination: "/admin/settings/store-management", permanent: true },
      { source: "/admin/settings/branches/:path*", destination: "/admin/settings/store-management/:path*", permanent: true },
      { source: "/admin/stock/production", destination: "/admin/inventory/production", permanent: true },
      { source: "/admin/stock/production/:path*", destination: "/admin/inventory/production/:path*", permanent: true },
      { source: "/admin/menu/categories", destination: "/admin/products/categories", permanent: true },
      { source: "/admin/menu/categories/:path*", destination: "/admin/products/categories/:path*", permanent: true },
      { source: "/admin/menu/promotions", destination: "/admin/products/promotions", permanent: true },
      { source: "/admin/menu/promotions/:path*", destination: "/admin/products/promotions/:path*", permanent: true },
      { source: "/admin/stock/documents", destination: "/admin/inventory/stock-actions", permanent: true },
      { source: "/admin/stock/documents/:path*", destination: "/admin/inventory/stock-actions/:path*", permanent: true },
      { source: "/admin/stock/food-cost", destination: "/admin/inventory/food-cost", permanent: true },
      { source: "/admin/stock/food-cost/:path*", destination: "/admin/inventory/food-cost/:path*", permanent: true },
      { source: "/admin/stock/packaging", destination: "/admin/inventory/order-inventory", permanent: true },
      { source: "/admin/stock/packaging/:path*", destination: "/admin/inventory/order-inventory/:path*", permanent: true },
      { source: "/admin/customers/aging", destination: "/admin/customers/ar-aging", permanent: true },
      { source: "/admin/customers/aging/:path*", destination: "/admin/customers/ar-aging/:path*", permanent: true },
      { source: "/admin/delivery/riders", destination: "/admin/riders/manage", permanent: true },
      { source: "/admin/delivery/riders/:path*", destination: "/admin/riders/manage/:path*", permanent: true },
      { source: "/admin/menu/tax-rates", destination: "/admin/products/tax-rates", permanent: true },
      { source: "/admin/menu/tax-rates/:path*", destination: "/admin/products/tax-rates/:path*", permanent: true },
      { source: "/admin/stock/sections", destination: "/admin/inventory/sections", permanent: true },
      { source: "/admin/stock/sections/:path*", destination: "/admin/inventory/sections/:path*", permanent: true },
      { source: "/admin/stock/settings", destination: "/admin/inventory/settings", permanent: true },
      { source: "/admin/stock/settings/:path*", destination: "/admin/inventory/settings/:path*", permanent: true },
      { source: "/admin/delivery/zones", destination: "/admin/riders/zones", permanent: true },
      { source: "/admin/delivery/zones/:path*", destination: "/admin/riders/zones/:path*", permanent: true },
      { source: "/admin/menu/products", destination: "/admin/products/catalog", permanent: true },
      { source: "/admin/menu/products/:path*", destination: "/admin/products/catalog/:path*", permanent: true },
      { source: "/admin/menu/stations", destination: "/admin/products/stations", permanent: true },
      { source: "/admin/menu/stations/:path*", destination: "/admin/products/stations/:path*", permanent: true },
      { source: "/admin/stock/recipes", destination: "/admin/inventory/recipes", permanent: true },
      { source: "/admin/stock/recipes/:path*", destination: "/admin/inventory/recipes/:path*", permanent: true },
      { source: "/admin/tax-invoices", destination: "/admin/finance/tax-invoices", permanent: true },
      { source: "/admin/tax-invoices/:path*", destination: "/admin/finance/tax-invoices/:path*", permanent: true },
      { source: "/admin/reservations", destination: "/admin/customers/reservations", permanent: true },
      { source: "/admin/reservations/:path*", destination: "/admin/customers/reservations/:path*", permanent: true },
      { source: "/admin/stock/items", destination: "/admin/inventory/items", permanent: true },
      { source: "/admin/stock/items/:path*", destination: "/admin/inventory/items/:path*", permanent: true },
      { source: "/admin/stock/sheet", destination: "/admin/inventory-reports/daily-stock-sheet", permanent: true },
      { source: "/admin/stock/sheet/:path*", destination: "/admin/inventory-reports/daily-stock-sheet/:path*", permanent: true },
      { source: "/admin/stock/waste", destination: "/admin/inventory-reports/waste-adjustments", permanent: true },
      { source: "/admin/stock/waste/:path*", destination: "/admin/inventory-reports/waste-adjustments/:path*", permanent: true },
      { source: "/admin/stock/units", destination: "/admin/inventory/units", permanent: true },
      { source: "/admin/stock/units/:path*", destination: "/admin/inventory/units/:path*", permanent: true },
      { source: "/admin/menu/menus", destination: "/admin/products/menus", permanent: true },
      { source: "/admin/menu/menus/:path*", destination: "/admin/products/menus/:path*", permanent: true },
      { source: "/admin/menu/deals", destination: "/admin/products/deals", permanent: true },
      { source: "/admin/menu/deals/:path*", destination: "/admin/products/deals/:path*", permanent: true },
      { source: "/admin/purchasing", destination: "/admin/purchasing/payables-aging", permanent: true },
      { source: "/admin/day-close", destination: "/admin/finance/day-close", permanent: true },
      { source: "/admin/day-close/:path*", destination: "/admin/finance/day-close/:path*", permanent: true },
      { source: "/admin/campaigns", destination: "/admin/customers/campaigns", permanent: true },
      { source: "/admin/campaigns/:path*", destination: "/admin/customers/campaigns/:path*", permanent: true },
      { source: "/admin/qr-orders", destination: "/admin/orders/qr", permanent: true },
      { source: "/admin/qr-orders/:path*", destination: "/admin/orders/qr/:path*", permanent: true },
      { source: "/admin/accounts", destination: "/admin/finance/payment-accounts", permanent: true },
      { source: "/admin/accounts/:path*", destination: "/admin/finance/payment-accounts/:path*", permanent: true },
      { source: "/admin/delivery", destination: "/admin/riders/delivery-board", permanent: true },
      { source: "/admin/devices", destination: "/admin/settings/devices", permanent: true },
      { source: "/admin/devices/:path*", destination: "/admin/settings/devices/:path*", permanent: true },
      { source: "/admin/loyalty", destination: "/admin/settings/loyalty-points", permanent: true },
      { source: "/admin/loyalty/:path*", destination: "/admin/settings/loyalty-points/:path*", permanent: true },
      { source: "/admin/shifts", destination: "/admin/finance/shifts", permanent: true },
      { source: "/admin/shifts/:path*", destination: "/admin/finance/shifts/:path*", permanent: true },
      { source: "/admin/audit", destination: "/admin/settings/audit-logs", permanent: true },
      { source: "/admin/audit/:path*", destination: "/admin/settings/audit-logs/:path*", permanent: true },
      { source: "/admin/stock", destination: "/admin/inventory/stock-in-hand", permanent: true },
      { source: "/admin/staff", destination: "/admin/staff/admin-staff", permanent: true },
      { source: "/admin/sync", destination: "/admin/settings/needs-attention", permanent: true },
      { source: "/admin/sync/:path*", destination: "/admin/settings/needs-attention/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
