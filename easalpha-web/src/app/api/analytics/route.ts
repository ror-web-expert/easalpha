import { NextResponse } from "next/server";
import { analyticsConfig } from "@/components/site/analytics";

// The public site's pages are prerendered, so the tracker config cannot be read from the environment at render time
// without a rebuild or a revalidation. This small route reads it per request instead; the browser caches the answer.
export const dynamic = "force-dynamic";

export function GET() {
  const cfg = analyticsConfig();
  return NextResponse.json(cfg ?? {}, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } });
}
