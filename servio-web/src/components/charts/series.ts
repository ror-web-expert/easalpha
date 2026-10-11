// Palette slots from docs/07-design-system.md section 2.6 (validated in both modes). Assigned in fixed order: navy,
// orange, teal, amber, pink, green, violet, red. Kept in its own file so the lightweight chart wrappers and the lazily
// loaded recharts body share it without a cycle.
export const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)", "var(--chart-7)", "var(--chart-8)"];

/** Brand accent (chart-2) and its hover tone, used for single-series bars and the trend area. Same in both modes. */
export const ACCENT = "#ff7a1a";
export const ACCENT_HOVER = "#e0640c";

/** Palette colour for the i-th series or row. Wraps only when a breakdown has more rows than the palette has slots. */
export function seriesColor(i: number): string {
  return SERIES[i % SERIES.length];
}

/** Colours for single-series charts: a line is navy, a bar is orange. Several series follow the palette order. */
export function lineColor(i: number, count: number): string {
  return count > 1 ? seriesColor(i) : SERIES[0];
}
export function barColor(i: number, count: number): string {
  return count > 1 ? seriesColor(i) : ACCENT;
}

/** Fixed tones for order and payment states so a status always reads the same colour on every breakdown. */
export const STATUS_TONES = {
  success: "#2e7d32",
  warning: ACCENT,
  info: "var(--chart-3)",
  danger: "#c62828",
  note: "var(--chart-4)",
} as const;

const STATUS_WORDS: [RegExp, string][] = [
  [/\b(completed?|paid|ready|delivered|served|closed)\b/, STATUS_TONES.success],
  [/\b(pending|preparing|open|in progress|new)\b/, STATUS_TONES.warning],
  [/\b(dispatched|out for delivery|on the way)\b/, STATUS_TONES.info],
  [/\b(cancelled|canceled|voided?|refunded?|failed|rejected)\b/, STATUS_TONES.danger],
  [/\b(complimentary|unpaid|partial(ly)? paid|due)\b/, STATUS_TONES.note],
];

/** Tone for a status label ("Completed", "out_for_delivery", "Paid (12)"), or undefined when the label is not a known state. */
export function statusColor(label: string): string | undefined {
  const text = label.toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
  return STATUS_WORDS.find(([re]) => re.test(text))?.[1];
}

/** Colour for a breakdown row: by status tone when asked and known, otherwise by palette order. */
export function breakdownColor(label: string, i: number, colorBy: "palette" | "status" = "palette"): string {
  return (colorBy === "status" ? statusColor(label) : undefined) ?? seriesColor(i);
}

export interface Series { key: string; label: string; money?: boolean }

export interface ChartBodyProps { data: Record<string, unknown>[]; x: string; series: Series[]; money?: boolean }
