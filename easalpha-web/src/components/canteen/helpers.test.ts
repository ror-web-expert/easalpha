import { describe, expect, it } from "vitest";
import type { MealClaim } from "@/lib/types";
import { alreadyTaken, businessDay, dishPrice, nextTokenLabel, parseWedge, refusedClaims, sessionAt, sessionDay, sessionWindow, tokenLines, wallClock, workerByFingerprint } from "./helpers";
import { fingerprintHash } from "./fingerprint";

describe("canteen kiosk helpers", () => {
  it("numbers tokens per device and day, starting again each day", () => {
    const a = nextTokenLabel("Q1", "2026-10-29", undefined);
    expect(a.label).toBe("Q1-001");
    const b = nextTokenLabel("Q1", "2026-10-29", a.state);
    expect(b.label).toBe("Q1-002");
    const c = nextTokenLabel("q1", "2026-10-30", b.state);
    expect(c).toEqual({ label: "Q1-001", state: { date: "2026-10-30", seq: 1 } });
    expect(nextTokenLabel("", "2026-10-30", undefined).label).toBe("K-001");
  });

  // F13: a kiosk paired again lost its count and gave Q1-001 a second time the same day.
  it("carries the count on past the tokens already given that day, its own only", () => {
    expect(nextTokenLabel("Q1", "2026-11-06", undefined, ["Q1-007", "q1-003", "Q2-020", "M-41", "Q1-x"]).label).toBe("Q1-008");
    expect(nextTokenLabel("Q1", "2026-11-06", { date: "2026-11-06", seq: 9 }, ["Q1-007"]).label).toBe("Q1-010");
  });

  const tz = "Asia/Karachi"; // UTC+5, no daylight saving
  const at = (local: string) => new Date(`${local}+05:00`);
  const lunch = { id: "lunch", starts_at: "12:00", ends_at: "15:00", sort_order: 1 };
  const night = { id: "night", starts_at: "23:00", ends_at: "06:00", sort_order: 2 };
  const snack = { id: "snack", starts_at: "00:00", ends_at: "01:00", sort_order: 3 };

  it("reads the branch's wall clock whatever zone the machine is in", () => {
    expect(wallClock(new Date("2026-11-06T19:30:00Z"), tz)).toEqual({ date: "2026-11-07", minutes: 30, hhmm: "00:30" });
    expect(wallClock(new Date("2026-11-06T19:30:00Z"), "Asia/Riyadh")).toEqual({ date: "2026-11-06", minutes: 22 * 60 + 30, hhmm: "22:30" });
    expect(wallClock(new Date("2026-11-06T19:30:00Z"), "Not/AZone").date).toMatch(/^2026-11-0[67]$/); // the machine's own zone
  });

  // F7: an offline kiosk kept the session the last answer named.
  it("picks the session from the clock as the server does: the first whose window holds the moment", () => {
    const sessions = [night, lunch, { ...lunch, id: "off", active: false, sort_order: 0 }];
    expect(sessionAt(sessions, at("2026-11-06T12:00:00"), tz)?.id).toBe("lunch");
    expect(sessionAt(sessions, at("2026-11-06T14:59:59"), tz)?.id).toBe("lunch");
    expect(sessionAt(sessions, at("2026-11-06T15:00:00"), tz)).toBeNull();
    expect(sessionAt(sessions, at("2026-11-07T03:00:00"), tz)?.id).toBe("night");
    expect(sessionAt([], at("2026-11-07T03:00:00"), tz)).toBeNull();
  });

  // F6: the business day ends at 02:01, in the middle of the night session.
  it("dates a meal by the business day its session's window opened", () => {
    expect(sessionDay(night, at("2026-11-09T23:30:00"), tz)).toBe("2026-11-09");
    expect(sessionDay(night, at("2026-11-10T03:00:00"), tz)).toBe("2026-11-09");
    expect(sessionDay(night, at("2026-11-10T05:59:00"), tz)).toBe("2026-11-09");
    expect(sessionDay(lunch, at("2026-11-10T13:00:00"), tz)).toBe("2026-11-10");
    expect(sessionDay(snack, at("2026-11-10T00:30:00"), tz)).toBe("2026-11-09"); // opens before the day end: the day before, as any sale then
    expect(sessionDay(night, at("2026-11-10T03:00:00"), tz, "06:00")).toBe("2026-11-09");
    expect(businessDay(at("2026-11-10T02:00:59"), tz)).toBe("2026-11-09");
    expect(businessDay(at("2026-11-10T02:01:00"), tz)).toBe("2026-11-10");
    expect(businessDay(at("2026-11-10T05:00:00"), tz, "06:00")).toBe("2026-11-09");
  });

  // F13: the tile showed the menu price before tax.
  it("shows what the worker is charged: the worker price, else the price with tax", () => {
    expect(dishPrice({ price_minor: 120_000, worker_price_minor: null, worker_pays_minor: 139_200 })).toBe(139_200);
    expect(dishPrice({ price_minor: 50_000, worker_price_minor: 20_000, worker_pays_minor: 20_000 })).toBe(20_000);
    expect(dishPrice({ price_minor: 50_000, worker_price_minor: 20_000 })).toBe(20_000); // an answer from before the field
  });

  it("reads a reader's keystrokes and ignores noise", () => {
    expect(parseWedge("FP-001\n")).toBe("FP-001");
    expect(parseWedge("  12345 ")).toBe("12345");
    expect(parseWedge("ab")).toBeNull();
    expect(parseWedge("\u0000\u0001")).toBeNull();
  });

  it("finds the claim that makes a second helping, ignoring cancelled ones and other sessions", () => {
    const claims = [
      { id: "a", employee_id: "e1", meal_session_id: "lunch", status: "cancelled" as const, plan_date: "2026-10-29" },
      { id: "b", employee_id: "e1", meal_session_id: "lunch", status: "claimed" as const, plan_date: "2026-10-29" },
      { id: "c", employee_id: "e1", meal_session_id: "dinner", status: "served" as const, plan_date: "2026-10-29" },
    ];
    expect(alreadyTaken(claims, "e1", "lunch", "2026-10-29")?.id).toBe("b");
    expect(alreadyTaken(claims, "e1", "lunch", "2026-10-30")).toBeUndefined();
    expect(alreadyTaken(claims, "e2", "lunch")).toBeUndefined();
    expect(alreadyTaken(claims, "e1", "dinner")?.id).toBe("c");
  });

  it("matches a worker on the reader's id whatever the case or spacing", () => {
    const workers = [{ id: "e1", fingerprint_id: "FP-001" }, { id: "e2", fingerprint_id: null }];
    expect(workerByFingerprint(workers, " fp-001 ")?.id).toBe("e1");
    expect(workerByFingerprint(workers, "FP-002")).toBeUndefined();
  });

  // F11: the kiosk's list carries the reader id only as a hash, so it names a finger offline without handing ids out.
  it("matches a worker on the hash of what the reader typed", () => {
    const workers = [{ id: "e1", fingerprint_hash: fingerprintHash("biz-1", "FP-001") }, { id: "e2", fingerprint_hash: null }];
    expect(workerByFingerprint(workers, "FP-001", "biz-1")?.id).toBe("e1");
    expect(workerByFingerprint(workers, "fp-001 ", "biz-1")?.id).toBe("e1");
    expect(workerByFingerprint(workers, "FP-001", "biz-2")).toBeUndefined(); // another business's salt
    expect(workerByFingerprint(workers, "FP-001")).toBeUndefined();
    expect(workerByFingerprint(workers, "  ", "biz-1")).toBeUndefined();
  });

  it("names the meal claims the server refused from the kiosk's own copy, else from its worker list, newest first", () => {
    const workers = [{ id: "e1", name: "Akbar Ali", fingerprint_id: "FP-001" }, { id: "e2", name: "Bilal", fingerprint_id: "FP-002" }];
    const local = [{ id: "m1", employee_name: "Akbar Ali", dish: "Chicken Karahi", token_label: "Q1-004", scanned_at: "2026-11-06T07:31:00Z" } as MealClaim];
    const attention = [
      { id: "m1", type: "meal_claim", code: "canteen.session_closed", message: "Lunch is not being served now", payload: { fingerprint_id: "FP-001", token_label: "Q1-004" } },
      { id: "m2", type: "meal_claim", code: "canteen.already_taken", message: "Bilal already took Daal at 12:02", payload: { employee_id: "e2", token_label: "Q1-009", client_created_at: "2026-11-06T08:10:00Z" } },
      { id: "o1", type: "order", code: "day.locked", message: "Locked", payload: {} },
      { id: "m3", type: "meal_claim", code: "canteen.unknown_worker", message: "No enrolled worker matches", payload: { fingerprint_id: "FP-404", client_created_at: 42 } },
    ];
    expect(refusedClaims(attention, local, workers)).toEqual([
      { id: "m2", token: "Q1-009", worker: "Bilal", dish: null, at: "2026-11-06T08:10:00Z", reason: "Bilal already took Daal at 12:02", code: "canteen.already_taken" },
      { id: "m1", token: "Q1-004", worker: "Akbar Ali", dish: "Chicken Karahi", at: "2026-11-06T07:31:00Z", reason: "Lunch is not being served now", code: "canteen.session_closed" },
      { id: "m3", token: null, worker: null, dish: null, at: null, reason: "No enrolled worker matches", code: "canteen.unknown_worker" },
    ]);
  });

  it("prints the token large with who, what and when", () => {
    const lines = tokenLines({ token_label: "Q1-017", employee_name: "Akbar Ali", dish: "Chicken Karahi", session: "Lunch", scanned_at: "2026-10-29T12:05:00" }, "Steel Works Mess", true);
    expect(lines[0]).toEqual({ text: "Steel Works Mess", align: "center", bold: true });
    expect(lines).toContainEqual({ text: "Q1-017", align: "center", bold: true, size: 2 });
    expect(lines).toContainEqual({ text: "Akbar Ali", align: "center", bold: true });
    expect(lines).toContainEqual({ text: "12:05", align: "center" });
    expect(lines).toContainEqual({ text: "recorded offline", align: "center" });
    expect(lines[lines.length - 1]).toEqual({ cut: true });
    expect(sessionWindow({ name: "Lunch", starts_at: "12:00", ends_at: "15:00" })).toBe("Lunch 12:00 to 15:00");
  });
});
