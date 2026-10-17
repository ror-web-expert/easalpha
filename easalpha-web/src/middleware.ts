import { NextResponse } from "next/server";

/**
 * Appendix A.4 (17 Oct 2026): signed-in screens are never stored by a shared cache. Next prerenders the admin shell and
 * sent it with `s-maxage=300, stale-while-revalidate`, which invites a CDN to keep it. The shell holds no account data
 * (every figure is fetched in the browser with the user's token), but an authenticated route should still say
 * `private, no-store`. Only document and RSC requests for these paths pass through here; static assets do not.
 */
export function middleware() {
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export const config = { matcher: ["/admin", "/admin/:path*", "/super", "/super/:path*", "/pos", "/pos/:path*", "/login"] };
