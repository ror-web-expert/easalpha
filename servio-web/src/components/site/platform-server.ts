import "server-only";
import { API_URL } from "@/lib/api";
import type { PlatformInfo } from "@/lib/types";
import { CONTACT, contactFromPlatform, type SiteContact } from "./site-helpers";

/** The product owner's platform settings for the public site, cached five minutes; the defaults when the API is away. */
export async function getPlatform(): Promise<PlatformInfo | null> {
  try {
    // Three seconds at most: a slow or absent API must never stall a build or a page, the defaults are fine.
    const res = await fetch(`${API_URL}/platform`, { next: { revalidate: 300 }, headers: { Accept: "application/json" }, signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return (await res.json()) as PlatformInfo;
  } catch {
    return null;
  }
}

export async function getSiteContact(): Promise<SiteContact> {
  const p = await getPlatform();
  return p ? contactFromPlatform(p) : CONTACT;
}
