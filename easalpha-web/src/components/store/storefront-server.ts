import "server-only";
import type { Storefront } from "@/lib/types";

// The API base from the build's environment, read here rather than imported from the client-side api module.
const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1").replace(/\/$/, "");

/** The published storefront for the page metadata, the app manifest and the app icon, cached five minutes; null when
 *  the slug is unknown, unpublished or the API is away (three seconds at most, so a page never stalls on it). */
export async function getStorefront(slug: string): Promise<Storefront | null> {
  try {
    const res = await fetch(`${API}/public/storefront/${encodeURIComponent(slug)}`, { next: { revalidate: 300 }, headers: { Accept: "application/json" }, signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return (await res.json()) as Storefront;
  } catch {
    return null;
  }
}
