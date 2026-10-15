import type { MetadataRoute } from "next";
import { SITE_URL } from "./sitemap";

// The public site is crawlable; app surfaces (admin, owner panel, till, kitchen, rider, token, queue) customer bill links and table QR pages are not.
// Disallow matches by prefix, so each app path is written as the exact page ($) plus its sub-paths (/): a bare /kitchen
// would also block the /kitchen-display-system guide, and a bare /pos the /pos-... pages.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin$", "/admin/", "/super$", "/super/", "/pos$", "/pos/", "/kitchen$", "/kitchen/", "/rider$", "/rider/", "/token$", "/token/", "/queue$", "/queue/", "/apps$", "/api/", "/bill/", "/q/", "/setup$", "/login$", "/store/", "/version$"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
