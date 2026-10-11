// Pure helpers for the SPEC finance screens (Journal Voucher, Chart of Accounts, Fixed Assets, Balance Sheet).
// Money is integer minor units (paisa). Kept free of React so the rules can be unit tested.
import type { BadgeVariant } from "@/components/ui";
import type { BalanceSheet, GlAccount, GlAccountKind, JournalKind } from "@/lib/types";
import { formatMoney } from "@/lib/money";

// ---- Journal Voucher ----
export interface VoucherLine { key: string; gl_account_id: string; debit_minor: number; credit_minor: number; description: string }

let seq = 0;
export function blankLine(): VoucherLine {
  seq += 1;
  return { key: `l${Date.now()}-${seq}`, gl_account_id: "", debit_minor: 0, credit_minor: 0, description: "" };
}

export interface VoucherTotals { debit_minor: number; credit_minor: number; difference_minor: number; balanced: boolean }

/** Running totals and the Dr - Cr difference. A voucher with nothing on it is not "balanced" in a useful sense, so
 *  balanced also needs some money on it. */
export function voucherTotals(lines: Pick<VoucherLine, "debit_minor" | "credit_minor">[]): VoucherTotals {
  const debit_minor = lines.reduce((s, l) => s + (l.debit_minor || 0), 0);
  const credit_minor = lines.reduce((s, l) => s + (l.credit_minor || 0), 0);
  const difference_minor = debit_minor - credit_minor;
  return { debit_minor, credit_minor, difference_minor, balanced: difference_minor === 0 && debit_minor > 0 };
}

/** Lines that carry an account and an amount; blank rows are ignored when posting. */
export function filledLines<T extends Pick<VoucherLine, "gl_account_id" | "debit_minor" | "credit_minor">>(lines: T[]): T[] {
  return lines.filter((l) => l.gl_account_id && ((l.debit_minor || 0) > 0 || (l.credit_minor || 0) > 0));
}

/** Post is allowed once at least two filled lines exist, no line is both debit and credit, and debits equal credits. */
export function canPostVoucher(lines: Pick<VoucherLine, "gl_account_id" | "debit_minor" | "credit_minor">[]): boolean {
  const filled = filledLines(lines);
  if (filled.length < 2) return false;
  if (filled.some((l) => l.debit_minor > 0 && l.credit_minor > 0)) return false;
  return voucherTotals(filled).balanced;
}

/** "Unbalanced by Rs 500" or null when balanced. */
export function unbalancedMessage(lines: Pick<VoucherLine, "debit_minor" | "credit_minor">[]): string | null {
  const t = voucherTotals(lines);
  if (t.difference_minor === 0) return null;
  return `Unbalanced by ${formatMoney(Math.abs(t.difference_minor))} (${t.difference_minor > 0 ? "debits" : "credits"} are higher)`;
}

export function journalKindLabel(kind: JournalKind | string): string {
  switch (kind) {
    case "manual": return "Manual";
    case "auto": return "Auto";
    case "reversal": return "Reversal";
    default: return kind;
  }
}

export function journalKindVariant(kind: JournalKind | string): BadgeVariant {
  switch (kind) {
    case "manual": return "primary";
    case "auto": return "neutral";
    case "reversal": return "warning";
    default: return "neutral";
  }
}

// ---- Chart of Accounts ----
export const GL_KINDS: GlAccountKind[] = ["asset", "liability", "equity", "income", "expense"];

export function glKindLabel(kind: GlAccountKind | string): string {
  switch (kind) {
    case "asset": return "Assets";
    case "liability": return "Liabilities";
    case "equity": return "Equity";
    case "income": return "Income";
    case "expense": return "Expenses";
    default: return kind;
  }
}

export function glKindVariant(kind: GlAccountKind | string): BadgeVariant {
  switch (kind) {
    case "asset": return "primary";
    case "liability": return "warning";
    case "equity": return "accent";
    case "income": return "success";
    case "expense": return "danger";
    default: return "neutral";
  }
}

/** The side a kind normally sits on, used to pre-fill the Add account dialog. */
export function defaultNormalSide(kind: GlAccountKind | string): "debit" | "credit" {
  return kind === "asset" || kind === "expense" ? "debit" : "credit";
}

export interface TreeRow { account: GlAccount; depth: number }

/** Accounts ordered by code with each child placed under its parent, carrying its depth for indentation.
 *  Orphans (parent filtered out or archived) sit at the top level so nothing disappears. */
export function buildAccountTree(accounts: GlAccount[]): TreeRow[] {
  const byCode = [...accounts].sort((a, b) => a.code.localeCompare(b.code));
  const ids = new Set(byCode.map((a) => a.id));
  const children = new Map<string | null, GlAccount[]>();
  for (const a of byCode) {
    const parent = a.parent_id && ids.has(a.parent_id) ? a.parent_id : null;
    children.set(parent, [...(children.get(parent) ?? []), a]);
  }
  const out: TreeRow[] = [];
  const walk = (parent: string | null, depth: number, seen: Set<string>) => {
    for (const a of children.get(parent) ?? []) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push({ account: a, depth });
      walk(a.id, depth + 1, seen);
    }
  };
  walk(null, 0, new Set());
  return out;
}

/** Tree rows grouped by kind in the statement order, for the Chart of Accounts sections. */
export function treeByKind(accounts: GlAccount[]): { kind: GlAccountKind; rows: TreeRow[] }[] {
  return GL_KINDS.map((kind) => ({ kind, rows: buildAccountTree(accounts.filter((a) => a.kind === kind)) })).filter((g) => g.rows.length);
}

/** Pixels of left padding for a tree depth (16px per level). */
export function indentFor(depth: number): number {
  return Math.max(0, depth) * 16;
}

/** Option groups for an account select: posting accounts only (headers cannot carry lines), grouped by kind. */
export function accountOptionGroups(accounts: GlAccount[]): { kind: GlAccountKind; label: string; accounts: GlAccount[] }[] {
  return GL_KINDS.map((kind) => ({ kind, label: glKindLabel(kind), accounts: accounts.filter((a) => a.kind === kind && !a.is_header).sort((a, b) => a.code.localeCompare(b.code)) })).filter((g) => g.accounts.length);
}

export function accountLabel(a: Pick<GlAccount, "code" | "name">): string {
  return `${a.code} ${a.name}`;
}

// ---- Fixed Assets ----
/** An asset can sit on any 15xx posting account except 1590 Accumulated Depreciation (the API refuses the rest). */
export function isFixedAssetAccount(a: Pick<GlAccount, "code" | "kind" | "is_header">): boolean {
  return a.kind === "asset" && !a.is_header && a.code.startsWith("15") && a.code !== "1590";
}

export type PaidFrom = "capital" | "payable" | string;
export function paidFromLabel(v: PaidFrom, accountName?: string): string {
  if (v === "capital") return "Owner's capital";
  if (v === "payable") return "Owed to supplier";
  return accountName ?? "Payment account";
}

/** Straight-line monthly charge the API will book, shown in the Add asset dialog before saving. */
export function straightLineMonthly(cost_minor: number, salvage_minor: number, months: number): number {
  if (!months || months <= 0) return 0;
  return Math.max(0, Math.round((cost_minor - Math.max(0, salvage_minor)) / months));
}

// ---- Balance Sheet ----
/** Assets equal liabilities plus equity (equity already carries current earnings). */
export function balanceSheetBalanced(s: Pick<BalanceSheet, "total_assets_minor" | "total_liabilities_minor" | "total_equity_minor">): boolean {
  return s.total_assets_minor === s.total_liabilities_minor + s.total_equity_minor;
}

/** Signed balance for a running-balance column: shows Dr/Cr instead of a minus sign. */
export function drCr(minor: number, normal_side: "debit" | "credit"): string {
  if (minor === 0) return formatMoney(0);
  const side = minor > 0 ? normal_side : normal_side === "debit" ? "credit" : "debit";
  return `${formatMoney(Math.abs(minor))} ${side === "debit" ? "Dr" : "Cr"}`;
}
