import type { AnalysisLine, ProductCost } from "@/lib/types";

export type CatalogView = "grid" | "list";

export const ORDER_TYPE_LABELS: Record<string, string> = { dine_in: "Dine-in", takeaway: "Takeaway", delivery: "Delivery", walk_in: "Walk-in", online: "Online" };
export function orderTypeLabel(t: string): string {
  return ORDER_TYPE_LABELS[t] ?? t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A stable hue (0 to 359) from the name, so a product with no photo always gets the same tile colour. */
export function tileHue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** Up to two initials for the no-photo tile: "Chicken Karahi" is CK, "Chai" is C. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}

export type MarginTone = "success" | "warning" | "danger";

/** null when the product has no recipe; danger when a serving loses money; warning when the food cost is over the target. */
export function marginTone(cost: ProductCost | null | undefined): MarginTone | null {
  if (!cost || cost.margin_percent === null) return null;
  if (cost.margin_percent <= 0) return "danger";
  return cost.over_target ? "warning" : "success";
}

export function marginLabel(cost: ProductCost | null | undefined): string | null {
  if (!cost || cost.margin_percent === null) return null;
  return `${Math.round(cost.margin_percent)}% margin`;
}

/** Tone for a margin figure in the analysis: the same rule as the badge. */
export function figureTone(margin: number | null, overTarget: boolean): MarginTone | "neutral" {
  if (margin === null) return "neutral";
  if (margin <= 0) return "danger";
  return overTarget ? "warning" : "success";
}

export function profitTone(profit: number | null): "success" | "danger" | "neutral" {
  if (profit === null) return "neutral";
  return profit > 0 ? "success" : "danger";
}

/** Each line's share of the ingredient cost in whole percent, for the bars in Product Analysis. */
export function shareOfCost(lines: AnalysisLine[]): number[] {
  const total = lines.reduce((s, l) => s + l.cost_minor, 0);
  return lines.map((l) => (total > 0 ? Math.round((l.cost_minor * 100) / total) : 0));
}
