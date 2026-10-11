import { describe, expect, it } from "vitest";
import { actionVariant, auditQuery } from "./audit-filters";

const range = { from: "2026-10-04", to: "2026-10-10" };

describe("auditQuery", () => {
  it("keeps only the date range when nothing else is set", () => {
    expect(auditQuery({ range, userId: "", action: "", table: "", recordId: "" })).toEqual({ from: "2026-10-04", to: "2026-10-10" });
  });

  it("maps every filter to the API parameter names", () => {
    expect(auditQuery({ range, userId: "u1", action: "delete", table: "orders", recordId: " abc " })).toEqual({
      from: "2026-10-04", to: "2026-10-10", user_id: "u1", action_name: "delete", table_name: "orders", record_id: "abc",
    });
  });

  it("drops an empty date so the API is not sent a blank value", () => {
    const q = auditQuery({ range: { from: "", to: "2026-10-10" }, userId: "", action: "", table: "", recordId: "   " });
    expect(q).toEqual({ to: "2026-10-10" });
    expect("record_id" in q).toBe(false);
  });
});

describe("actionVariant", () => {
  it("flags destructive actions as danger", () => {
    for (const a of ["void", "refund", "delete", "bulk_delete", "cancel", "revoke_device", "pin_failed"]) expect(actionVariant(a)).toBe("danger");
  });
  it("flags configuration changes as warning", () => {
    for (const a of ["price_change", "permission_change", "settings_change", "status_change"]) expect(actionVariant(a)).toBe("warning");
  });
  it("is neutral for everything else", () => {
    for (const a of ["create", "update", "login", "receive"]) expect(actionVariant(a)).toBe("neutral");
  });
});
