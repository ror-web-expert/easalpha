"use client";
// Stock Actions register pieces shared by the list, the form and the detail page: kind and status badges and the status timeline.
import type { BadgeVariant } from "@/components/ui";
import type { Membership, StockDocument, StockDocumentKind, StockDocumentStatus } from "@/lib/types";
import { formatDateTime } from "@/lib/dates";
import { staffName } from "@/components/admin/phase3";
import { DOC_KIND_LABELS, docStatusBadge, docStatusLabel, documentTimeline } from "@/components/admin/inventory-helpers";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

export function docKindBadge(kind: StockDocumentKind | string | null | undefined): BadgeVariant {
  switch (kind) {
    case "receive": case "po_receipt": case "opening_balance": return "success";
    case "transfer": return "info";
    case "waste": return "danger";
    case "adjustment": case "count": return "warning";
    case "supplier_return": return "accent";
    case "production": return "primary";
    default: return "neutral";
  }
}

export function DocKindBadge({ kind, className }: { kind: StockDocumentKind | string; className?: string }) {
  return <Badge variant={docKindBadge(kind)} className={className}>{DOC_KIND_LABELS[kind] ?? kind}</Badge>;
}

export function DocStatusBadge({ status, className }: { status: StockDocumentStatus | string | null | undefined; className?: string }) {
  return <Badge variant={docStatusBadge(status)} className={className}>{docStatusLabel(status)}</Badge>;
}

/** Created, submitted, approved by, dispatched, received, posted, voided: only the steps that happened. */
export function DocumentTimeline({ doc, staff, staffUnavailable }: { doc: StockDocument; staff: Membership[] | undefined; staffUnavailable?: boolean }) {
  const steps = documentTimeline(doc);
  const who = (id: string | null) => (id && !staffUnavailable ? staffName(staff, id) : null);
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const by = who(s.by);
        return (
          <li key={s.key} className="relative flex gap-3 pl-5">
            <span className={cn("absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full", last ? (s.key === "voided" ? "bg-danger" : "bg-primary") : "bg-border-strong")} />
            {!last ? <span className="absolute left-[4px] top-4 h-[calc(100%+4px)] w-0.5 bg-border" /> : null}
            <div className="min-w-0 text-sm">
              <div className={cn("font-medium", last ? "" : "text-fg-secondary")}>{s.label}{by && by !== "…" && by !== "-" ? <span className="font-normal text-fg-secondary"> by {by}</span> : null}</div>
              <div className="text-xs text-fg-muted">{s.at ? formatDateTime(s.at) : s.key === "submitted" || s.key === "approved" ? "Time not recorded" : ""}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
