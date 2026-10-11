import type { MetadataRoute } from "next";
import { SITE_URL } from "./sitemap";

// The public site is crawlable; app surfaces (admin, owner panel, till, kitchen, rider, token, queue) are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/super", "/pos", "/kitchen", "/rider", "/token", "/queue", "/apps", "/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
