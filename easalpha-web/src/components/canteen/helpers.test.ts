import { describe, expect, it } from "vitest";
import type { MealClaim } from "@/lib/types";
import { alreadyTaken, nextTokenLabel, parseWedge, refusedClaims, sessionWindow, tokenLines, workerByFingerprint } from "./helpers";

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
