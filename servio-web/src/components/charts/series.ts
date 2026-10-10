// Palette slots from docs/07-design-system.md section 2.6 (validated in both modes). Assigned in fixed order, never cycled.
// Kept in its own file so the lightweight chart wrappers and the lazily loaded recharts body share it without a cycle.
export const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)", "var(--chart-7)", "var(--chart-8)"];

export interface Series { key: string; label: string; money?: boolean }

export interface ChartBodyProps { data: Record<string, unknown>[]; x: string; series: Series[]; money?: boolean }
