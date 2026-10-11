import type { BadgeVariant } from "@/components/ui";
import type { ChecklistKind, ChecklistRun, ChecklistTemplateItem } from "@/lib/types";

// Opening and closing checklists (SPEC "The POS asks the cashier to run these at shift open and close").
// Pure helpers for the admin page; the API shapes are in src/lib/types.ts.

export const KINDS: ChecklistKind[] = ["opening", "closing"];
export const KIND_LABELS: Record<ChecklistKind, string> = { opening: "Opening", closing: "Closing" };

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind as ChecklistKind] ?? kind;
}

/** Whole-number percentage, 0 when the run has no items. */
export function progressPct(done: number, total: number): number {
  if (!total || total < 0) return 0;
  return Math.round((Math.min(done, total) / total) * 100);
}

export type RunStatus = "complete" | "in_progress" | "not_started";

export function runStatus(run: Pick<ChecklistRun, "completed_at" | "done_count">): RunStatus {
  if (run.completed_at) return "complete";
  return run.done_count > 0 ? "in_progress" : "not_started";
}

export const RUN_STATUS_META: Record<RunStatus, { label: string; variant: BadgeVariant }> = {
  complete: { label: "Complete", variant: "success" },
  in_progress: { label: "In progress", variant: "warning" },
  not_started: { label: "Not started", variant: "neutral" },
};

/** A key no existing item uses, in the API's own item_N style. */
export function nextItemKey(items: readonly ChecklistTemplateItem[]): string {
  const used = new Set(items.map((i) => i.key));
  let n = items.length + 1;
  while (used.has(`item_${n}`)) n += 1;
  return `item_${n}`;
}

/** Moves one item up or down; returns the same array when the move falls off either end. */
export function moveItem<T>(items: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Trims labels and drops blank rows; what we send to PUT /checklists/templates/:kind. */
export function cleanItems(items: readonly ChecklistTemplateItem[]): ChecklistTemplateItem[] {
  return items.map((i) => ({ key: i.key, label: i.label.trim() })).filter((i) => i.label.length > 0);
}

export function sameItems(a: readonly ChecklistTemplateItem[], b: readonly ChecklistTemplateItem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.key === b[i].key && x.label === b[i].label);
}
