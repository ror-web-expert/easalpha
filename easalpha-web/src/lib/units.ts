// Stock quantities arrive as decimal strings in the item's base unit (g, ml, pcs). These helpers format and convert them.
import type { Unit } from "@/lib/types";

export type WeightDisplay = "auto" | "g" | "kg";
export type VolumeDisplay = "auto" | "ml" | "l";
export interface QtyDisplay { weight?: WeightDisplay; volume?: VolumeDisplay }

function num(n: number, maxDecimals: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
}

/** Pick the display unit for a base quantity: g >= 1000 shows as kg (3 decimals), ml >= 1000 as l. */
export function displayUnit(qty: number, baseCode: string | null | undefined, opts: QtyDisplay = {}): { code: string; factor: number; decimals: number } {
  const abs = Math.abs(qty);
  if (baseCode === "g") {
    const mode = opts.weight ?? "auto";
    if (mode === "kg" || (mode === "auto" && abs >= 1000)) return { code: "kg", factor: 1000, decimals: 3 };
    return { code: "g", factor: 1, decimals: 1 };
  }
  if (baseCode === "ml") {
    const mode = opts.volume ?? "auto";
    if (mode === "l" || (mode === "auto" && abs >= 1000)) return { code: "l", factor: 1000, decimals: 3 };
    return { code: "ml", factor: 1, decimals: 1 };
  }
  return { code: baseCode ?? "", factor: 1, decimals: 2 };
}

/** "1.5 kg", "250 g", "2 l", "12 pcs". Quantity is a decimal string or number in the base unit. */
export function formatBaseQty(qty: string | number | null | undefined, baseCode: string | null | undefined, opts: QtyDisplay = {}): string {
  const n = Number(qty ?? 0);
  if (!Number.isFinite(n)) return "";
  const u = displayUnit(n, baseCode, opts);
  return `${num(n / u.factor, u.decimals)} ${u.code}`.trim();
}

/** Quantity in a chosen (non-base) unit, e.g. a document line of 10 kg: "10 kg". */
export function formatUnitQty(qty: string | number | null | undefined, unitCode: string | null | undefined): string {
  const n = Number(qty ?? 0);
  if (!Number.isFinite(n)) return "";
  return `${num(n, 3)} ${unitCode ?? ""}`.trim();
}

/** Average cost per base unit (minor units, decimal string) shown per display unit: "Rs 600 / kg". */
export function formatUnitCost(costMinorPerBase: string | number | null | undefined, baseCode: string | null | undefined, formatMoney: (minor: number) => string): string {
  const c = Number(costMinorPerBase ?? 0);
  if (!Number.isFinite(c) || c === 0) return "-";
  const u = displayUnit(1000, baseCode); // force kg / l for weight and volume so the per-unit cost is readable
  return `${formatMoney(Math.round(c * u.factor))} / ${u.code}`;
}

/** Quantity entered in `unit` expressed in base units. */
export function toBase(qty: number, unit: Pick<Unit, "factor_to_base">): number {
  return qty * Number(unit.factor_to_base);
}

/** Quantity in base units expressed in `unit`. */
export function fromBase(baseQty: number, unit: Pick<Unit, "factor_to_base">): number {
  const f = Number(unit.factor_to_base) || 1;
  return baseQty / f;
}

export function unitsOfKind(units: Unit[] | undefined, kind: string | null | undefined): Unit[] {
  if (!units || !kind) return [];
  return units.filter((u) => u.kind === kind);
}

/** Signed quantity, e.g. "+1.5 kg" / "-250 g". */
export function formatSignedQty(qty: string | number | null | undefined, baseCode: string | null | undefined, opts: QtyDisplay = {}): string {
  const n = Number(qty ?? 0);
  const s = formatBaseQty(Math.abs(n), baseCode, opts);
  return n > 0 ? `+${s}` : n < 0 ? `-${s}` : s;
}
