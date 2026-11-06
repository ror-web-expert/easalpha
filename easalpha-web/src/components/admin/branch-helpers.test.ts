import { describe, expect, it } from "vitest";
import { branchCode } from "./branch-helpers";

describe("branchCode", () => {
  it("keeps A-Z and 0-9, upper-cased, at most eight", () => {
    expect(branchCode("dha 2")).toBe("DHA2");
    expect(branchCode("b-1_x")).toBe("B1X");
    expect(branchCode("Öst2")).toBe("ST2");
    expect(branchCode("gulberg123")).toBe("GULBERG1");
    expect(branchCode("")).toBe("");
  });
});
