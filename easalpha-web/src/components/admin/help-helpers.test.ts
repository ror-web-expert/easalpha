import { beforeEach, describe, expect, it } from "vitest";
import {
  categoryLabel, dismissAnnouncement, isAnnouncementDismissed, pendingSessionCount, readSeenIds, seenIdsAfterViewing,
  sessionStatusVariant, sortNewestFirst, supportStatusLabel, supportStatusVariant, unseenAnsweredCount, whatsappHref,
  whatsappMessage, writeSeenIds,
} from "./help-helpers";

describe("whatsappHref", () => {
  it("keeps only digits and URL-encodes the prefilled message", () => {
    expect(whatsappHref("+92 300 123-4567", "Hello EasAlpha support, this is Cafe Lahore.")).toBe(
      "https://wa.me/923001234567?text=Hello%20EasAlpha%20support%2C%20this%20is%20Cafe%20Lahore.",
    );
  });
  it("omits the text parameter when there is no message", () => {
    expect(whatsappHref("923001234567")).toBe("https://wa.me/923001234567");
    expect(whatsappHref("923001234567", "   ")).toBe("https://wa.me/923001234567");
  });
  it("returns null when the number has no digits", () => {
    expect(whatsappHref(null, "hi")).toBeNull();
    expect(whatsappHref("", "hi")).toBeNull();
    expect(whatsappHref("call us", "hi")).toBeNull();
  });
});

describe("whatsappMessage", () => {
  it("names the product and the business", () => {
    expect(whatsappMessage("EasAlpha", "Cafe Lahore")).toBe("Hello EasAlpha support, this is Cafe Lahore. ");
    expect(whatsappMessage(null, null)).toBe("Hello EasAlpha support. ");
  });
});

describe("status badges", () => {
  it("maps request statuses to badge variants", () => {
    expect(supportStatusVariant("open")).toBe("warning");
    expect(supportStatusVariant("answered")).toBe("success");
    expect(supportStatusVariant("closed")).toBe("neutral");
    expect(supportStatusVariant("weird")).toBe("neutral");
    expect(supportStatusVariant(undefined)).toBe("neutral");
  });
  it("labels statuses in plain English", () => {
    expect(supportStatusLabel("open")).toBe("Open");
    expect(supportStatusLabel("answered")).toBe("Answered");
    expect(supportStatusLabel("closed")).toBe("Closed");
  });
  it("maps support-session statuses", () => {
    expect(sessionStatusVariant("requested")).toBe("warning");
    expect(sessionStatusVariant("approved")).toBe("success");
    expect(sessionStatusVariant("denied")).toBe("danger");
    expect(sessionStatusVariant("ended")).toBe("neutral");
    expect(sessionStatusVariant("expired")).toBe("neutral");
  });
});

describe("categoryLabel", () => {
  it("knows the five categories and falls back to a capitalised value", () => {
    expect(categoryLabel("question")).toBe("Question");
    expect(categoryLabel("problem")).toBe("Something is not working");
    expect(categoryLabel("billing")).toBe("Billing and plan");
    expect(categoryLabel("feature")).toBe("Feature request");
    expect(categoryLabel("other")).toBe("Other");
    expect(categoryLabel("urgent")).toBe("Urgent");
    expect(categoryLabel(null)).toBe("Other");
  });
});

describe("unseenAnsweredCount", () => {
  const rows = [
    { id: "a", status: "answered" as const },
    { id: "b", status: "answered" as const },
    { id: "c", status: "open" as const },
    { id: "d", status: "closed" as const },
  ];
  it("counts answered requests the user has not seen", () => {
    expect(unseenAnsweredCount(rows, [])).toBe(2);
    expect(unseenAnsweredCount(rows, ["a"])).toBe(1);
    expect(unseenAnsweredCount(rows, ["a", "b"])).toBe(0);
  });
  it("is 0 with no requests", () => {
    expect(unseenAnsweredCount([], ["a"])).toBe(0);
    expect(unseenAnsweredCount(undefined, undefined)).toBe(0);
  });
  it("remembers answered and closed ids after viewing, never open ones", () => {
    expect(seenIdsAfterViewing(rows, ["x"]).sort()).toEqual(["a", "b", "d", "x"]);
  });
});

describe("lists", () => {
  it("sorts newest first", () => {
    const rows = [{ id: 1, created_at: "2026-10-01T10:00:00Z" }, { id: 2, created_at: "2026-10-11T10:00:00Z" }, { id: 3, created_at: "2026-10-05T10:00:00Z" }];
    expect(sortNewestFirst(rows).map((r) => r.id)).toEqual([2, 3, 1]);
    expect(sortNewestFirst(rows)).not.toBe(rows);
  });
  it("counts pending support-session requests", () => {
    expect(pendingSessionCount([{ status: "requested" }, { status: "approved" }, { status: "requested" }])).toBe(2);
    expect(pendingSessionCount(undefined)).toBe(0);
  });
});

describe("localStorage helpers", () => {
  beforeEach(() => localStorage.clear());
  it("round-trips seen ids and ignores junk", () => {
    expect(readSeenIds()).toEqual([]);
    writeSeenIds(["a", "b"]);
    expect(readSeenIds()).toEqual(["a", "b"]);
    localStorage.setItem("easalpha.support.seen", "{not json");
    expect(readSeenIds()).toEqual([]);
    localStorage.setItem("easalpha.support.seen", JSON.stringify([1, "ok", null]));
    expect(readSeenIds()).toEqual(["ok"]);
  });
  it("dismisses an announcement by its text, so a new text shows again", () => {
    expect(isAnnouncementDismissed(null)).toBe(true);
    expect(isAnnouncementDismissed("Maintenance tonight")).toBe(false);
    dismissAnnouncement("Maintenance tonight");
    expect(isAnnouncementDismissed("Maintenance tonight")).toBe(true);
    expect(isAnnouncementDismissed("Maintenance tomorrow")).toBe(false);
  });
});
