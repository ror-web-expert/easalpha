// Pure helpers for the SPEC "Inventory and recipes" admin screens: the Stock Actions register (nine document types,
// five statuses, numbered like GRN-000023), items with read-only quantities, and unit conversions stored per direction.
// No React here so the rules can be unit tested.
import type { BadgeVariant } from "@/components/ui";
import type { StockDocument, StockDocumentKind, StockDocumentStatus } from "@/lib/types";

// ---- Document kinds ----
export interface DocKindMeta {
  value: StockDocumentKind;
  label: string;
  /** Number prefix the API uses: GRN-000023. */
  prefix: string;
  hint: string;
  /** Which sections the kind needs. "from" is the source, "to" the destination; a transfer needs both. */
  from: boolean;
  to: boolean;
  /** Lines carry a unit cost (goods in and upward adjustments value the stock). */
  cost: boolean;
}

export const DOC_KIND_META: DocKindMeta[] = [
  { value: "receive", label: "Goods Receipt", prefix: "GRN", from: false, to: true, cost: true, hint: "Goods in from a supplier without a purchase order. Needs a destination section and unit costs." },
  { value: "po_receipt", label: "PO Receipt", prefix: "POR", from: false, to: true, cost: true, hint: "Goods in against a purchase order. Normally written by the purchase order's Receive step." },
  { value: "transfer", label: "Transfer", prefix: "TRF", from: true, to: true, cost: false, hint: "Move stock between two sections. Dispatching takes it from the source; receiving lands it in the destination." },
  { value: "waste", label: "Waste", prefix: "WST", from: true, to: false, cost: false, hint: "Spoiled, dropped or burnt. Needs a reason. Always allowed below zero." },
  { value: "adjustment", label: "Adjustment", prefix: "ADJ", from: true, to: false, cost: true, hint: "Correct a quantity up or down. A positive quantity adds stock, a negative one removes it." },
  { value: "count", label: "Stock Count", prefix: "CNT", from: true, to: false, cost: false, hint: "Enter counted quantities; the difference posts as an adjustment. Only while counting is open." },
  { value: "opening_balance", label: "Opening Balance", prefix: "OPB", from: false, to: true, cost: true, hint: "The stock on hand when the section starts being tracked, with its unit cost." },
  { value: "production", label: "Production", prefix: "PRD", from: false, to: true, cost: true, hint: "A prep batch landing in a section. Standalone recipes produce these from the Production screen." },
  { value: "supplier_return", label: "Supplier Return", prefix: "RET", from: true, to: false, cost: false, hint: "Send goods back to the supplier." },
];

export const DOC_KIND_LABELS: Record<string, string> = Object.fromEntries(DOC_KIND_META.map((k) => [k.value, k.label]));

export function docKindMeta(kind: StockDocumentKind | string): DocKindMeta {
  return DOC_KIND_META.find((k) => k.value === kind) ?? DOC_KIND_META[0];
}

/** Which sections a document of this kind must carry. */
export function sectionsRequiredByKind(kind: StockDocumentKind | string): { from: boolean; to: boolean } {
  const m = DOC_KIND_META.find((k) => k.value === kind);
  return m ? { from: m.from, to: m.to } : { from: false, to: false };
}

/** The label the API prints: prefix plus the number zero-padded to six digits. GRN-000023. */
export function formatDocLabel(kind: StockDocumentKind | string, number: number | string | null | undefined): string {
  const prefix = DOC_KIND_META.find((k) => k.value === kind)?.prefix ?? "DOC";
  const n = Math.max(0, Math.trunc(Number(number ?? 0)) || 0);
  return `${prefix}-${String(n).padStart(6, "0")}`;
}

// ---- Statuses ----
export const DOC_STATUSES: { value: Exclude<StockDocumentStatus, "cancelled">; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "awaiting_approval", label: "Awaiting approval" },
  { value: "in_transit", label: "In transit" },
  { value: "posted", label: "Posted" },
  { value: "voided", label: "Voided" },
];

/** "cancelled" is how older rows spell voided. */
export function normalizeStatus(status: StockDocumentStatus | string | null | undefined): Exclude<StockDocumentStatus, "cancelled"> {
  if (status === "cancelled") return "voided";
  const known = DOC_STATUSES.find((s) => s.value === status);
  return known ? known.value : "draft";
}

export function docStatusLabel(status: StockDocumentStatus | string | null | undefined): string {
  return DOC_STATUSES.find((s) => s.value === normalizeStatus(status))?.label ?? "Draft";
}

export function docStatusBadge(status: StockDocumentStatus | string | null | undefined): BadgeVariant {
  switch (normalizeStatus(status)) {
    case "posted": return "success";
    case "voided": return "danger";
    case "awaiting_approval": return "warning";
    case "in_transit": return "info";
    default: return "neutral";
  }
}

// ---- Actions by status and kind ----
export type DocAction = "submit" | "approve" | "dispatch" | "receive" | "post" | "void" | "delete";

/**
 * What a document can do next. Mirrors Stock::Posting on the API: a draft is submitted, posted or (if a transfer)
 * dispatched; awaiting approval is approved (a transfer goes in transit, anything else posts); in transit is received;
 * anything not yet voided can be voided, except a draft, which is simply deleted. Permission trimming happens in the UI.
 */
export function allowedActions(status: StockDocumentStatus | string | null | undefined, kind: StockDocumentKind | string): DocAction[] {
  const isTransfer = kind === "transfer";
  switch (normalizeStatus(status)) {
    case "draft": return isTransfer ? ["submit", "dispatch", "post", "delete"] : ["submit", "post", "delete"];
    case "awaiting_approval": return ["approve", "void"];
    case "in_transit": return ["receive", "void"];
    case "posted": return ["void"];
    default: return [];
  }
}

/** Actions that write the ledger and so need stock.actions; submit and delete only need stock.view. */
export const POSTING_ACTIONS: DocAction[] = ["approve", "dispatch", "receive", "post", "void"];

export const ACTION_LABELS: Record<DocAction, string> = {
  submit: "Submit for approval", approve: "Approve", dispatch: "Dispatch", receive: "Receive", post: "Post", void: "Void", delete: "Delete draft",
};

// ---- Posting date ----
/** Null when the date may be posted; otherwise the reason, matching the API's 409 codes stock.future_date and stock.day_locked. */
export function postingDateProblem(date: string, dayLock: string | null | undefined, today: string): string | null {
  if (!date) return "Choose a posting date.";
  if (date > today) return "The posting date cannot be after today.";
  if (dayLock && date <= dayLock) return `Stock is locked up to ${dayLock}; the posting date must be after it.`;
  return null;
}

// ---- Status timeline ----
export interface TimelineStep { key: string; label: string; at: string | null; by: string | null }

/** The document's story in order: created, submitted, approved, dispatched, received, posted, voided. Only steps that happened. */
export function documentTimeline(d: Pick<StockDocument, "status" | "created_at" | "by_membership_id" | "approved_by_membership_id" | "dispatched_at" | "received_at" | "posted_at" | "posted_by_membership_id" | "cancelled_at">): TimelineStep[] {
  const steps: TimelineStep[] = [{ key: "created", label: "Created", at: d.created_at, by: d.by_membership_id }];
  const status = normalizeStatus(d.status);
  if (status === "awaiting_approval") steps.push({ key: "submitted", label: "Submitted for approval", at: null, by: null });
  if (d.approved_by_membership_id) steps.push({ key: "approved", label: "Approved", at: null, by: d.approved_by_membership_id });
  if (d.dispatched_at) steps.push({ key: "dispatched", label: "Dispatched", at: d.dispatched_at, by: null });
  if (d.received_at) steps.push({ key: "received", label: "Received", at: d.received_at, by: d.posted_by_membership_id });
  if (d.posted_at) steps.push({ key: "posted", label: "Posted", at: d.posted_at, by: d.posted_by_membership_id });
  if (d.cancelled_at || status === "voided") steps.push({ key: "voided", label: "Voided", at: d.cancelled_at, by: null });
  return steps;
}

// ---- Items ----
/** Negative stock is permitted and shown as "short" because a sale is never blocked over a stock figure. */
export function isShort(qty: string | number | null | undefined): boolean {
  const n = Number(qty ?? 0);
  return Number.isFinite(n) && n < 0;
}

export const SKU_HINT = "Left blank: generated from the name and category, for example ADR-GE-9350.";
export const QUANTITY_NOTICE = "Quantities change only through Stock Actions and sales. They cannot be edited here.";

// ---- Unit conversions ----
/** Formats a factor with up to six decimals, no trailing zeros and no thousands separators, as the SPEC writes it: 1000, 0.001, 0.083333. */
export function formatFactor(factor: string | number | null | undefined): string {
  const n = Number(factor ?? 0);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-US", { maximumFractionDigits: 6, useGrouping: false });
}

export function reciprocalFactor(factor: string | number): number {
  const n = Number(factor);
  if (!Number.isFinite(n) || n === 0) return 0;
  return 1 / n;
}

/** "1 kg = 1000 g" */
export function conversionSentence(fromCode: string, toCode: string, factor: string | number): string {
  return `1 ${fromCode} = ${formatFactor(factor)} ${toCode}`;
}

/** Both rows the API stores for one factor: "1 kg = 1000 g" and "1 g = 0.001 kg". */
export function conversionPair(fromCode: string, toCode: string, factor: string | number): [string, string] {
  return [conversionSentence(fromCode, toCode, factor), conversionSentence(toCode, fromCode, reciprocalFactor(factor))];
}

/** Null when a conversion can be saved; otherwise what is wrong. */
export function conversionProblem(fromUnitId: string, toUnitId: string, factor: string): string | null {
  if (!fromUnitId || !toUnitId) return "Choose both units.";
  if (fromUnitId === toUnitId) return "Choose two different units.";
  const n = Number(factor);
  if (factor.trim() === "" || !Number.isFinite(n)) return "Enter the factor as a number.";
  if (n <= 0) return "The factor must be above zero.";
  return null;
}
