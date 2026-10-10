import { describe, expect, it } from "vitest";
import { DEMAND_BUCKETS, HEALTH_BUCKETS, demandBucketLabel, demandBucketVariant, formatVariance, healthBucketVariant, healthProblemCount, parseOrderLookup, safetyNetSentence, stockStatusLabel, varianceClass, varianceTone } from "./stockreport-helpers";

describe("demand buckets", () => {
  it("offers the five SPEC buckets in SPEC order", () => {
    expect(DEMAND_BUCKETS.map((b) => b.label)).toEqual(["Low stock", "Critical", "Out of stock", "All needing stock", "Everything in use"]);
  });
  it("labels and tones each row bucket", () => {
    expect(demandBucketLabel("out")).toBe("Out of stock");
    expect(demandBucketLabel("critical")).toBe("Critical");
    expect(demandBucketLabel("low")).toBe("Low stock");
    expect(demandBucketLabel("ok")).toBe("In stock");
    expect(demandBucketVariant("out")).toBe("danger");
    expect(demandBucketVariant("critical")).toBe("warning");
    expect(demandBucketVariant("low")).toBe("info");
    expect(demandBucketVariant("ok")).toBe("success");
    expect(demandBucketVariant(null)).toBe("neutral");
  });
});

describe("deduction health buckets", () => {
  it("lists the audit statuses plus never ran", () => {
    expect(HEALTH_BUCKETS.map((b) => b.value)).toEqual(["ok", "missing", "partial", "reversed", "waste", "skipped", "error", "never_ran"]);
  });
  it("tones problems as danger and expected outcomes softer", () => {
    expect(healthBucketVariant("ok")).toBe("success");
    expect(healthBucketVariant("never_ran")).toBe("danger");
    expect(healthBucketVariant("missing")).toBe("danger");
    expect(healthBucketVariant("partial")).toBe("warning");
    expect(healthBucketVariant("reversed")).toBe("info");
    expect(healthBucketVariant("waste")).toBe("accent");
  });
  it("counts only the buckets that need a look", () => {
    expect(healthProblemCount({ ok: 168, missing: 40, partial: 20, error: 5, never_ran: 10, reversed: 3, waste: 2 })).toBe(75);
    expect(healthProblemCount(undefined)).toBe(0);
  });
});

describe("safety net sentence", () => {
  it("says when it has not run", () => {
    expect(safetyNetSentence(null)).toBe("Not run yet");
    expect(safetyNetSentence({ last_run_at: null, last_checked: null, last_deducted: null, last_errors: null })).toBe("Not run yet");
  });
  it("reads the last run with its counts", () => {
    const at = new Date(2026, 9, 10, 10, 32).toISOString();
    expect(safetyNetSentence({ last_run_at: at, last_checked: 3, last_deducted: 1, last_errors: 0 })).toBe("Last run 10:32 am, 3 checked, 1 deducted");
    expect(safetyNetSentence({ last_run_at: at, last_checked: 3, last_deducted: 1, last_errors: 2 })).toBe("Last run 10:32 am, 3 checked, 1 deducted, 2 errors");
    expect(safetyNetSentence({ last_run_at: at, last_checked: 1, last_deducted: 0, last_errors: 1 })).toBe("Last run 10:32 am, 1 checked, 0 deducted, 1 error");
  });
});

describe("order lookup", () => {
  it("treats digits, with or without a hash, as a serial", () => {
    expect(parseOrderLookup("1234")).toEqual({ serial: 1234 });
    expect(parseOrderLookup(" #1234 ")).toEqual({ serial: 1234 });
  });
  it("treats anything else as an id and ignores blanks", () => {
    expect(parseOrderLookup("0f8fad5b-d9cb-469f-a165-70867728950e")).toEqual({ id: "0f8fad5b-d9cb-469f-a165-70867728950e" });
    expect(parseOrderLookup("   ")).toBeNull();
  });
});

describe("variance", () => {
  it("formats with a sign and the display unit", () => {
    expect(formatVariance("-250", "g")).toBe("-250 g");
    expect(formatVariance("1500", "g")).toBe("+1.5 kg");
    expect(formatVariance("0", "pcs")).toBe("0");
  });
  it("tones short as danger and surplus as success", () => {
    expect(varianceTone(-1)).toBe("danger");
    expect(varianceTone(2)).toBe("success");
    expect(varianceTone(0)).toBeUndefined();
    expect(varianceClass(-1)).toContain("text-danger");
    expect(varianceClass(0)).toContain("text-fg-muted");
  });
});

describe("stock status", () => {
  it("shows negative stock as short, in the danger tone", () => {
    expect(stockStatusLabel({ negative: true, below_minimum: true })).toEqual({ label: "short", variant: "danger" });
    expect(stockStatusLabel({ negative: false, below_minimum: true })).toEqual({ label: "low", variant: "warning" });
    expect(stockStatusLabel({ negative: false, below_minimum: false })).toEqual({ label: "ok", variant: "success" });
  });
});
