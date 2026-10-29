import { describe, expect, it } from "vitest";
import { alreadyTaken, nextTokenLabel, parseWedge, sessionWindow, tokenLines, workerByFingerprint } from "./helpers";

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
