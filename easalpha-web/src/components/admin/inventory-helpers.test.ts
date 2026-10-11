import { describe, expect, it } from "vitest";
import type { StockDocumentStatus } from "@/lib/types";
import {
  ACTION_LABELS, DOC_KIND_META, DOC_STATUSES, allowedActions, conversionPair, conversionProblem, conversionSentence, docStatusBadge, docStatusLabel, documentTimeline, formatDocLabel,
  formatFactor, isShort, normalizeStatus, postingDateProblem, reciprocalFactor, sectionsRequiredByKind,
} from "./inventory-helpers";

describe("document kinds", () => {
  it("lists the nine SPEC types with their number prefixes", () => {
    expect(DOC_KIND_META.map((k) => k.value)).toEqual(["receive", "po_receipt", "transfer", "waste", "adjustment", "count", "opening_balance", "production", "supplier_return"]);
    expect(DOC_KIND_META.map((k) => k.prefix)).toEqual(["GRN", "POR", "TRF", "WST", "ADJ", "CNT", "OPB", "PRD", "RET"]);
  });

  it("formats labels zero-padded to six digits", () => {
    expect(formatDocLabel("receive", 23)).toBe("GRN-000023");
    expect(formatDocLabel("transfer", "7")).toBe("TRF-000007");
    expect(formatDocLabel("count", 1234567)).toBe("CNT-1234567");
    expect(formatDocLabel("adjustment", null)).toBe("ADJ-000000");
    expect(formatDocLabel("unknown", 1)).toBe("DOC-000001");
  });

  it("knows which sections each kind needs", () => {
    expect(sectionsRequiredByKind("receive")).toEqual({ from: false, to: true });
    expect(sectionsRequiredByKind("po_receipt")).toEqual({ from: false, to: true });
    expect(sectionsRequiredByKind("opening_balance")).toEqual({ from: false, to: true });
    expect(sectionsRequiredByKind("production")).toEqual({ from: false, to: true });
    expect(sectionsRequiredByKind("transfer")).toEqual({ from: true, to: true });
    expect(sectionsRequiredByKind("waste")).toEqual({ from: true, to: false });
    expect(sectionsRequiredByKind("adjustment")).toEqual({ from: true, to: false });
    expect(sectionsRequiredByKind("count")).toEqual({ from: true, to: false });
    expect(sectionsRequiredByKind("supplier_return")).toEqual({ from: true, to: false });
    expect(sectionsRequiredByKind("nope")).toEqual({ from: false, to: false });
  });
});

describe("statuses", () => {
  it("lists the five SPEC statuses and folds legacy cancelled into voided", () => {
    expect(DOC_STATUSES.map((s) => s.label)).toEqual(["Draft", "Awaiting approval", "In transit", "Posted", "Voided"]);
    expect(normalizeStatus("cancelled")).toBe("voided");
    expect(docStatusLabel("cancelled")).toBe("Voided");
    expect(docStatusLabel("awaiting_approval")).toBe("Awaiting approval");
    expect(docStatusLabel(undefined)).toBe("Draft");
  });

  it("colours each status", () => {
    expect(docStatusBadge("draft")).toBe("neutral");
    expect(docStatusBadge("awaiting_approval")).toBe("warning");
    expect(docStatusBadge("in_transit")).toBe("info");
    expect(docStatusBadge("posted")).toBe("success");
    expect(docStatusBadge("voided")).toBe("danger");
    expect(docStatusBadge("cancelled")).toBe("danger");
  });
});

describe("allowed actions", () => {
  it("lets a draft be submitted, posted or deleted, and dispatched only when it is a transfer", () => {
    expect(allowedActions("draft", "receive")).toEqual(["submit", "post", "delete"]);
    expect(allowedActions("draft", "transfer")).toEqual(["submit", "dispatch", "post", "delete"]);
  });

  it("approves or voids a document awaiting approval", () => {
    expect(allowedActions("awaiting_approval", "waste")).toEqual(["approve", "void"]);
    expect(allowedActions("awaiting_approval", "transfer")).toEqual(["approve", "void"]);
  });

  it("receives or voids an in-transit transfer, voids a posted document and leaves a voided one alone", () => {
    expect(allowedActions("in_transit", "transfer")).toEqual(["receive", "void"]);
    expect(allowedActions("posted", "count")).toEqual(["void"]);
    expect(allowedActions("voided", "count")).toEqual([]);
    expect(allowedActions("cancelled", "count")).toEqual([]);
  });

  it("has a label for every action", () => {
    for (const a of ["submit", "approve", "dispatch", "receive", "post", "void", "delete"] as const) expect(ACTION_LABELS[a]).toBeTruthy();
  });
});

describe("posting date", () => {
  it("refuses a blank date, a future date and anything on or before the day lock", () => {
    expect(postingDateProblem("", null, "2026-10-10")).toMatch(/Choose/);
    expect(postingDateProblem("2026-10-11", null, "2026-10-10")).toMatch(/after today/);
    expect(postingDateProblem("2026-09-30", "2026-09-30", "2026-10-10")).toMatch(/locked up to 2026-09-30/);
    expect(postingDateProblem("2026-09-01", "2026-09-30", "2026-10-10")).toMatch(/locked/);
  });

  it("accepts today and any unlocked past day", () => {
    expect(postingDateProblem("2026-10-10", "2026-09-30", "2026-10-10")).toBeNull();
    expect(postingDateProblem("2026-10-01", "2026-09-30", "2026-10-10")).toBeNull();
    expect(postingDateProblem("2020-01-01", null, "2026-10-10")).toBeNull();
  });
});

describe("timeline", () => {
  const base = { status: "draft" as StockDocumentStatus, created_at: "2026-10-10T08:00:00Z", by_membership_id: "m1", approved_by_membership_id: null, dispatched_at: null, received_at: null, posted_at: null, posted_by_membership_id: null, cancelled_at: null };

  it("starts with created and adds only the steps that happened", () => {
    expect(documentTimeline(base).map((s) => s.key)).toEqual(["created"]);
    expect(documentTimeline({ ...base, status: "awaiting_approval" as StockDocumentStatus }).map((s) => s.key)).toEqual(["created", "submitted"]);
    expect(documentTimeline({ ...base, status: "posted" as StockDocumentStatus, posted_at: "2026-10-10T09:00:00Z", posted_by_membership_id: "m2" }).map((s) => s.key)).toEqual(["created", "posted"]);
  });

  it("tells the transfer story: approved, dispatched, received, posted", () => {
    const t = documentTimeline({ ...base, status: "posted" as StockDocumentStatus, approved_by_membership_id: "m2", dispatched_at: "2026-10-10T09:00:00Z", received_at: "2026-10-10T10:00:00Z", posted_at: "2026-10-10T10:00:00Z", posted_by_membership_id: "m3" });
    expect(t.map((s) => s.key)).toEqual(["created", "approved", "dispatched", "received", "posted"]);
    expect(t.find((s) => s.key === "approved")?.by).toBe("m2");
    expect(t.find((s) => s.key === "received")?.by).toBe("m3");
  });

  it("ends with voided, including legacy cancelled rows", () => {
    expect(documentTimeline({ ...base, status: "cancelled" as StockDocumentStatus, cancelled_at: "2026-10-10T11:00:00Z" }).map((s) => s.key)).toEqual(["created", "voided"]);
  });
});

describe("short stock", () => {
  it("is short only below zero", () => {
    expect(isShort("-1.5")).toBe(true);
    expect(isShort(0)).toBe(false);
    expect(isShort("12")).toBe(false);
    expect(isShort(null)).toBe(false);
  });
});

describe("unit conversions", () => {
  it("shows both stored directions for one factor", () => {
    expect(conversionPair("kg", "g", "1000")).toEqual(["1 kg = 1000 g", "1 g = 0.001 kg"]);
    expect(conversionPair("pet12", "btl", 12)).toEqual(["1 pet12 = 12 btl", "1 btl = 0.083333 pet12"]);
  });

  it("formats factors without trailing zeros and reciprocals safely", () => {
    expect(formatFactor("1000.000000")).toBe("1000");
    expect(formatFactor("0.0010")).toBe("0.001");
    expect(reciprocalFactor("0")).toBe(0);
    expect(reciprocalFactor(4)).toBe(0.25);
    expect(conversionSentence("l", "ml", "1000.0")).toBe("1 l = 1000 ml");
  });

  it("checks the form before saving", () => {
    expect(conversionProblem("", "b", "2")).toMatch(/both units/);
    expect(conversionProblem("a", "a", "2")).toMatch(/different/);
    expect(conversionProblem("a", "b", "")).toMatch(/number/);
    expect(conversionProblem("a", "b", "abc")).toMatch(/number/);
    expect(conversionProblem("a", "b", "0")).toMatch(/above zero/);
    expect(conversionProblem("a", "b", "12")).toBeNull();
  });
});
