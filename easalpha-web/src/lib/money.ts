// Money is integer minor units (paisa). PKR shows no decimals: "Rs 1,234". Negative: "-Rs 5,037".
const SYMBOLS: Record<string, { symbol: string; decimals: number; space: boolean }> = {
  PKR: { symbol: "Rs", decimals: 0, space: true },
  AED: { symbol: "AED", decimals: 2, space: true },
  SAR: { symbol: "SAR", decimals: 2, space: true },
  USD: { symbol: "$", decimals: 2, space: false },
  GBP: { symbol: "£", decimals: 2, space: false },
  EUR: { symbol: "€", decimals: 2, space: false },
};

export function formatMoney(minor: number | string | null | undefined, currency = "PKR"): string {
  const n = Number(minor ?? 0);
  if (!Number.isFinite(n)) return "";
  const cfg = SYMBOLS[currency] ?? { symbol: currency, decimals: 2, space: true };
  const abs = Math.abs(n) / 100;
  const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: cfg.decimals, maximumFractionDigits: cfg.decimals });
  const body = cfg.space ? `${cfg.symbol} ${formatted}` : `${cfg.symbol}${formatted}`;
  return n < 0 ? `-${body}` : body;
}

/** Major units as a plain number string for inputs, e.g. 123456 -> "1234.56" (PKR: "1235" when whole). */
export function minorToMajor(minor: number | null | undefined): string {
  const n = Number(minor ?? 0) / 100;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** "1234.5" -> 123450. Tolerates commas and blanks. */
export function majorToMinor(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function formatPercent(v: number | string | null | undefined, digits = 1): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "";
  return `${n.toFixed(digits).replace(/\.0+$/, "")}%`;
}

export function formatQty(q: number | string | null | undefined): string {
  const n = Number(q ?? 0);
  return Number.isInteger(n) ? String(n) : String(n);
}
