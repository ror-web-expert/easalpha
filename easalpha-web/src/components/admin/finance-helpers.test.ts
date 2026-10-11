import { describe, expect, it } from "vitest";
import type { GlAccount } from "@/lib/types";
import {
  accountOptionGroups, balanceSheetBalanced, buildAccountTree, canPostVoucher, drCr, filledLines, glKindLabel, glKindVariant, indentFor, isFixedAssetAccount,
  journalKindLabel, journalKindVariant, paidFromLabel, straightLineMonthly, treeByKind, unbalancedMessage, voucherTotals,
} from "./finance-helpers";

const acc = (over: Partial<GlAccount> & Pick<GlAccount, "id" | "code" | "name">): GlAccount => ({
  kind: "asset", normal_side: "debit", parent_id: null, is_header: false, is_system: true, opening_balance_minor: 0, payment_account_id: null, description: null, ...over,
});

describe("journal voucher balance", () => {
  it("sums debits and credits and reports the difference", () => {
    const t = voucherTotals([{ debit_minor: 100000, credit_minor: 0 }, { debit_minor: 0, credit_minor: 60000 }]);
    expect(t).toEqual({ debit_minor: 100000, credit_minor: 60000, difference_minor: 40000, balanced: false });
    expect(voucherTotals([{ debit_minor: 500, credit_minor: 0 }, { debit_minor: 0, credit_minor: 500 }]).balanced).toBe(true);
  });

  it("does not call an empty voucher balanced", () => {
    expect(voucherTotals([]).balanced).toBe(false);
    expect(voucherTotals([{ debit_minor: 0, credit_minor: 0 }]).balanced).toBe(false);
  });

  it("writes the unbalanced warning with the formatted difference and which side is higher", () => {
    expect(unbalancedMessage([{ debit_minor: 150000, credit_minor: 0 }, { debit_minor: 0, credit_minor: 100000 }])).toBe("Unbalanced by Rs 500 (debits are higher)");
    expect(unbalancedMessage([{ debit_minor: 0, credit_minor: 2500 }])).toBe("Unbalanced by Rs 25 (credits are higher)");
    expect(unbalancedMessage([{ debit_minor: 100, credit_minor: 100 }])).toBeNull();
  });

  it("allows posting only with two or more filled, one-sided, balanced lines", () => {
    const a = { gl_account_id: "a", debit_minor: 1000, credit_minor: 0 };
    const b = { gl_account_id: "b", debit_minor: 0, credit_minor: 1000 };
    expect(canPostVoucher([a, b])).toBe(true);
    expect(canPostVoucher([a])).toBe(false);
    expect(canPostVoucher([a, { ...b, credit_minor: 900 }])).toBe(false);
    expect(canPostVoucher([a, { gl_account_id: "", debit_minor: 0, credit_minor: 1000 }])).toBe(false);
    expect(canPostVoucher([{ gl_account_id: "a", debit_minor: 1000, credit_minor: 1000 }, { gl_account_id: "b", debit_minor: 0, credit_minor: 0 }])).toBe(false);
    expect(canPostVoucher([a, b, { gl_account_id: "", debit_minor: 0, credit_minor: 0 }])).toBe(true);
  });

  it("drops blank rows before posting", () => {
    expect(filledLines([{ gl_account_id: "a", debit_minor: 10, credit_minor: 0 }, { gl_account_id: "", debit_minor: 0, credit_minor: 0 }, { gl_account_id: "b", debit_minor: 0, credit_minor: 0 }])).toHaveLength(1);
  });
});

describe("kind labels and tones", () => {
  it("labels journal kinds", () => {
    expect(journalKindLabel("manual")).toBe("Manual");
    expect(journalKindLabel("auto")).toBe("Auto");
    expect(journalKindLabel("reversal")).toBe("Reversal");
    expect(journalKindVariant("manual")).toBe("primary");
    expect(journalKindVariant("auto")).toBe("neutral");
    expect(journalKindVariant("reversal")).toBe("warning");
    expect(journalKindVariant("other")).toBe("neutral");
  });

  it("labels account kinds in statement wording", () => {
    expect(glKindLabel("asset")).toBe("Assets");
    expect(glKindLabel("liability")).toBe("Liabilities");
    expect(glKindLabel("equity")).toBe("Equity");
    expect(glKindLabel("income")).toBe("Income");
    expect(glKindLabel("expense")).toBe("Expenses");
    expect(glKindVariant("income")).toBe("success");
    expect(glKindVariant("expense")).toBe("danger");
    expect(glKindVariant("mystery")).toBe("neutral");
  });
});

describe("account tree", () => {
  const rows = [
    acc({ id: "cash", code: "1010", name: "Cash in Hand", parent_id: "ca" }),
    acc({ id: "ca", code: "1000", name: "Current Assets", is_header: true }),
    acc({ id: "till", code: "1011", name: "Till 1", parent_id: "cash", is_system: false }),
    acc({ id: "bank", code: "1020", name: "Cash at Bank", parent_id: "ca" }),
    acc({ id: "orphan", code: "1900", name: "Orphan", parent_id: "missing" }),
  ];

  it("orders by code and nests children under their parent with a depth", () => {
    expect(buildAccountTree(rows).map((r) => [r.account.code, r.depth])).toEqual([["1000", 0], ["1010", 1], ["1011", 2], ["1020", 1], ["1900", 0]]);
  });

  it("indents 16px per level", () => {
    expect(indentFor(0)).toBe(0);
    expect(indentFor(2)).toBe(32);
    expect(indentFor(-1)).toBe(0);
  });

  it("groups by kind in statement order and skips empty kinds", () => {
    const g = treeByKind([...rows, acc({ id: "sales", code: "4000", name: "Sales", kind: "income", normal_side: "credit" })]);
    expect(g.map((x) => x.kind)).toEqual(["asset", "income"]);
    expect(g[0].rows).toHaveLength(5);
  });

  it("builds select groups of posting accounts only", () => {
    const g = accountOptionGroups(rows);
    expect(g).toHaveLength(1);
    expect(g[0].label).toBe("Assets");
    expect(g[0].accounts.map((a) => a.code)).toEqual(["1010", "1011", "1020", "1900"]);
  });
});

describe("fixed assets", () => {
  it("accepts 15xx posting accounts except 1590 Accumulated Depreciation", () => {
    expect(isFixedAssetAccount(acc({ id: "1", code: "1510", name: "Furniture" }))).toBe(true);
    expect(isFixedAssetAccount(acc({ id: "2", code: "1590", name: "Accumulated Depreciation", normal_side: "credit" }))).toBe(false);
    expect(isFixedAssetAccount(acc({ id: "3", code: "1500", name: "Fixed Assets", is_header: true }))).toBe(false);
    expect(isFixedAssetAccount(acc({ id: "4", code: "1200", name: "Inventory" }))).toBe(false);
    expect(isFixedAssetAccount(acc({ id: "5", code: "1510", name: "Odd", kind: "expense" }))).toBe(false);
  });

  it("labels where the money came from", () => {
    expect(paidFromLabel("capital")).toBe("Owner's capital");
    expect(paidFromLabel("payable")).toBe("Owed to supplier");
    expect(paidFromLabel("acc-1", "Meezan Bank")).toBe("Meezan Bank");
  });

  it("previews the straight-line monthly charge", () => {
    expect(straightLineMonthly(12000000, 0, 60)).toBe(200000);
    expect(straightLineMonthly(12000000, 1200000, 36)).toBe(300000);
    expect(straightLineMonthly(12000000, 0, 0)).toBe(0);
  });
});

describe("balance sheet", () => {
  it("is balanced when assets equal liabilities plus equity", () => {
    expect(balanceSheetBalanced({ total_assets_minor: 500000, total_liabilities_minor: 200000, total_equity_minor: 300000 })).toBe(true);
    expect(balanceSheetBalanced({ total_assets_minor: 500000, total_liabilities_minor: 200000, total_equity_minor: 250000 })).toBe(false);
  });

  it("shows running balances as Dr or Cr on the account's side", () => {
    expect(drCr(150000, "debit")).toBe("Rs 1,500 Dr");
    expect(drCr(-150000, "debit")).toBe("Rs 1,500 Cr");
    expect(drCr(2500, "credit")).toBe("Rs 25 Cr");
    expect(drCr(0, "credit")).toBe("Rs 0");
  });
});
