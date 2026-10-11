import { describe, expect, it } from "vitest";
import {
  canDeliver, checkoutProblems, count, deliveryLine, EMPTY_CUSTOMER, isFinalStage, lineKey, ratingBadge, stageLabel, subtotal, trackingSteps, validPhone,
  type StorefrontCartLine,
} from "./cart-helpers";

const line = (over: Partial<StorefrontCartLine> = {}): StorefrontCartLine => ({
  key: "p1", product_id: "p1", variant_id: null, name: "Chicken Karahi", variant_name: null, unit_minor: 120000, quantity: 1, ...over,
});

describe("lineKey", () => {
  it("keys by product, and by product + variant when there is one", () => {
    expect(lineKey("p1")).toBe("p1");
    expect(lineKey("p1", null)).toBe("p1");
    expect(lineKey("p1", "v2")).toBe("p1:v2");
  });
});

describe("subtotal and count", () => {
  it("sum unit price times quantity across lines", () => {
    const lines = [line({ quantity: 2 }), line({ key: "p2", product_id: "p2", unit_minor: 25000, quantity: 3 })];
    expect(subtotal(lines)).toBe(240000 + 75000);
    expect(count(lines)).toBe(5);
  });
  it("are zero for an empty cart", () => {
    expect(subtotal([])).toBe(0);
    expect(count([])).toBe(0);
  });
});

describe("canDeliver", () => {
  it("refuses when delivery is off", () => {
    expect(canDeliver({ enabled: false }, 999999).ok).toBe(false);
    expect(canDeliver(undefined, 999999).reason).toMatch(/does not deliver/);
  });
  it("refuses below the minimum with the shortfall", () => {
    const r = canDeliver({ enabled: true, min_order_minor: 50000 }, 30000);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("The minimum order for delivery is Rs 500. Add Rs 200 more to continue.");
  });
  it("allows at or above the minimum, and when there is no minimum", () => {
    expect(canDeliver({ enabled: true, min_order_minor: 50000 }, 50000)).toEqual({ ok: true, reason: null });
    expect(canDeliver({ enabled: true, min_order_minor: 0 }, 100)).toEqual({ ok: true, reason: null });
    expect(canDeliver({ enabled: true, min_order_minor: null }, 100).ok).toBe(true);
  });
});

describe("deliveryLine", () => {
  it("is empty when delivery is off", () => {
    expect(deliveryLine({ enabled: false, eta_minutes: 30 })).toBe("");
  });
  it("joins ETA, minimum and free-above with middle dots and skips blanks", () => {
    expect(deliveryLine({ enabled: true, eta_minutes: 45, min_order_minor: 0, free_above_minor: null })).toBe("Delivery in about 45 minutes");
    expect(deliveryLine({ enabled: true, eta_minutes: 30, min_order_minor: 50000, free_above_minor: 200000 })).toBe("Delivery in about 30 minutes · minimum order Rs 500 · free above Rs 2,000");
    expect(deliveryLine({ enabled: true })).toBe("Delivery available");
  });
});

describe("validPhone", () => {
  it("accepts Pakistani mobiles in local and international form", () => {
    expect(validPhone("0300 1234567")).toBe(true);
    expect(validPhone("+92 300 1234567")).toBe(true);
    expect(validPhone("+92-300-123-4567")).toBe(true);
  });
  it("rejects short or empty numbers", () => {
    expect(validPhone("")).toBe(false);
    expect(validPhone("12345")).toBe(false);
    expect(validPhone("abc")).toBe(false);
  });
});

describe("checkoutProblems", () => {
  const delivery = { enabled: true, min_order_minor: 50000 };
  it("lists every blocker for an empty delivery form", () => {
    const problems = checkoutProblems({ lines: [], order_type: "delivery", customer: EMPTY_CUSTOMER, delivery });
    expect(problems).toEqual([
      "Your cart is empty.",
      "Enter your name.",
      "Enter a phone number with at least 10 digits, for example +92 300 1234567.",
      "Enter a delivery address.",
      "The minimum order for delivery is Rs 500. Add Rs 500 more to continue.",
    ]);
  });
  it("is empty for a valid pickup order and ignores the address and minimum", () => {
    expect(checkoutProblems({ lines: [line({ unit_minor: 100 })], order_type: "takeaway", customer: { ...EMPTY_CUSTOMER, name: "Ali", phone: "03001234567" }, delivery })).toEqual([]);
  });
  it("is empty for a valid delivery order", () => {
    expect(checkoutProblems({ lines: [line()], order_type: "delivery", customer: { ...EMPTY_CUSTOMER, name: "Ali", phone: "03001234567", address: "12 Main St" }, delivery })).toEqual([]);
  });
});

describe("stageLabel and tracking steps", () => {
  it("maps the live stages to steps 1-5", () => {
    expect(stageLabel("waiting").step).toBe(1);
    expect(stageLabel("accepted").step).toBe(2);
    expect(stageLabel("preparing").step).toBe(3);
    expect(stageLabel("ready").step).toBe(4);
    expect(stageLabel("on_the_way").step).toBe(5);
    expect(stageLabel("done")).toMatchObject({ step: 5, tone: "done", title: "Delivered" });
    expect(stageLabel("done", "takeaway").title).toBe("Collected");
  });
  it("marks rejected and cancelled as failed with step 0", () => {
    expect(stageLabel("rejected")).toMatchObject({ step: 0, tone: "failed" });
    expect(stageLabel("cancelled")).toMatchObject({ step: 0, tone: "failed" });
  });
  it("mentions the ETA for delivery only", () => {
    expect(stageLabel("accepted", "delivery", 45).text).toContain("about 45 minutes");
    expect(stageLabel("accepted", "takeaway", 45).text).not.toContain("45");
  });
  it("names the last step by order type", () => {
    expect(trackingSteps("delivery")[4]).toBe("On the way");
    expect(trackingSteps("takeaway")[4]).toBe("Collected");
    expect(trackingSteps("delivery")).toHaveLength(5);
  });
  it("knows which stages stop polling", () => {
    expect(isFinalStage("done")).toBe(true);
    expect(isFinalStage("rejected")).toBe(true);
    expect(isFinalStage("cancelled")).toBe(true);
    expect(isFinalStage("preparing")).toBe(false);
    expect(isFinalStage(null)).toBe(false);
  });
});

describe("ratingBadge", () => {
  it("formats the average to one decimal with the review count", () => {
    expect(ratingBadge({ average: 4.56, rated: 23 })).toEqual({ average: "4.6", reviews: "23 reviews" });
    expect(ratingBadge({ average: 5, rated: 1 })).toEqual({ average: "5.0", reviews: "1 review" });
  });
  it("hides when nobody has rated", () => {
    expect(ratingBadge({ average: null, rated: 0 })).toBeNull();
    expect(ratingBadge(undefined)).toBeNull();
  });
});
