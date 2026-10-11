import type { BadgeVariant } from "@/components/ui";
import type { SupportRequest, SupportRequestCategory, SupportRequestStatus, SupportSession } from "@/lib/types";

// Help & Support box: pure helpers for the sidebar button, the slide-over panel and /admin/support.
// The API shapes (PlatformInfo, SupportRequest, SupportSession) live in src/lib/types.ts.

export const CATEGORIES: SupportRequestCategory[] = ["question", "problem", "billing", "feature", "other"];

const CATEGORY_LABELS: Record<SupportRequestCategory, string> = {
  question: "Question",
  problem: "Something is not working",
  billing: "Billing and plan",
  feature: "Feature request",
  other: "Other",
};

export function categoryLabel(category: string | null | undefined): string {
  return CATEGORY_LABELS[category as SupportRequestCategory] ?? (category ? category.charAt(0).toUpperCase() + category.slice(1) : "Other");
}

/** https://wa.me/<digits>?text=<message>; null when the number has no digits (nothing to link to). */
export function whatsappHref(number: string | null | undefined, message?: string): string | null {
  const digits = (number ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const text = message?.trim();
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function supportStatusVariant(status: SupportRequestStatus | string | null | undefined): BadgeVariant {
  switch (status) {
    case "open": return "warning";
    case "answered": return "success";
    case "closed": return "neutral";
    default: return "neutral";
  }
}

export function supportStatusLabel(status: SupportRequestStatus | string | null | undefined): string {
  switch (status) {
    case "open": return "Open";
    case "answered": return "Answered";
    case "closed": return "Closed";
    default: return status ? status : "Open";
  }
}

export function sessionStatusVariant(status: SupportSession["status"] | string | null | undefined): BadgeVariant {
  switch (status) {
    case "requested": return "warning";
    case "approved": return "success";
    case "denied": return "danger";
    case "ended": case "expired": return "neutral";
    default: return "neutral";
  }
}

/** Answered requests whose id the user has not opened yet: what the orange dot on the sidebar button counts. */
export function unseenAnsweredCount(requests: readonly Pick<SupportRequest, "id" | "status">[] | null | undefined, seenIds: readonly string[] | null | undefined): number {
  if (!requests?.length) return 0;
  const seen = new Set(seenIds ?? []);
  return requests.filter((r) => r.status === "answered" && !seen.has(r.id)).length;
}

/** Ids worth remembering as seen: answered or closed requests (open ones have nothing to read yet). */
export function seenIdsAfterViewing(requests: readonly Pick<SupportRequest, "id" | "status">[], seenIds: readonly string[]): string[] {
  const next = new Set(seenIds);
  for (const r of requests) if (r.status !== "open") next.add(r.id);
  return Array.from(next);
}

/** Newest first (the API returns open first, the list reads better by time). */
export function sortNewestFirst<T extends { created_at: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function pendingSessionCount(sessions: readonly Pick<SupportSession, "status">[] | null | undefined): number {
  return sessions?.filter((s) => s.status === "requested").length ?? 0;
}

/** What the WhatsApp button pre-fills so support knows who is writing. */
export function whatsappMessage(productName: string | null | undefined, businessName: string | null | undefined): string {
  const product = productName?.trim() || "EasAlpha";
  return businessName?.trim() ? `Hello ${product} support, this is ${businessName.trim()}. ` : `Hello ${product} support. `;
}

// ---- localStorage, always wrapped: private windows and blocked storage must never break the panel ----
export const SEEN_KEY = "easalpha.support.seen";
export const ANNOUNCEMENT_KEY = "easalpha.announcement.dismissed";

export function readSeenIds(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
}

export function writeSeenIds(ids: readonly string[]) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-200))); } catch {}
}

export function isAnnouncementDismissed(text: string | null | undefined): boolean {
  if (!text) return true;
  try { return localStorage.getItem(ANNOUNCEMENT_KEY) === text; } catch { return false; }
}

export function dismissAnnouncement(text: string) {
  try { localStorage.setItem(ANNOUNCEMENT_KEY, text); } catch {}
}
