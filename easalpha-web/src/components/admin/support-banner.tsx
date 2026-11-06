"use client";
import { useEffect, useState } from "react";
import { LifeBuoy } from "lucide-react";
import { format } from "date-fns";
import type { BusinessRef, SupportInfo } from "@/lib/types";
import { useAuthStore } from "@/store/auth";

/** The line at the top of every admin page while EasAlpha support works in the business (QA of 6 Nov 2026, P3). */
export function supportBannerText(s: SupportInfo, businessName: string, now: number = Date.now()): string {
  const who = s.by?.name ? `EasAlpha support (${s.by.name})` : "EasAlpha support";
  const ends = s.expires_at ? Date.parse(s.expires_at) : NaN;
  const left = Number.isFinite(ends) ? Math.max(0, Math.ceil((ends - now) / 60000)) : null;
  const until = left === null ? "" : left === 0 ? " Access has ended." : ` Access ends at ${format(ends, "HH:mm")} (${left} min left).`;
  return `You are in ${businessName} as ${who}.${until} Everything you do is logged for the owner; sign-in details, staff, devices and billing cannot be changed.`;
}

export function SupportBanner() {
  const support = useAuthStore((s) => s.session?.support);
  const business = useAuthStore((s) => s.session?.business.name ?? "this business");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!support) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [support]);
  if (!support) return null;
  return (
    <div role="status" data-support-banner className="no-print flex items-start gap-2 bg-warning-soft px-4 py-2 text-sm text-warning-ink md:px-6">
      <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{supportBannerText(support, business, now)}</span>
    </div>
  );
}

/**
 * The businesses the switcher offers: those whose membership opens the admin (BusinessRef.apps, QA P4: a till job in a
 * second business locked a manager out). A list from before the API said which apps (no apps field) is offered whole.
 */
export function switchableBusinesses(list: BusinessRef[]): { business: BusinessRef; admin: boolean }[] {
  return list.map((b) => ({ business: b, admin: !b.apps || b.apps.includes("admin") }));
}
