import { describe, expect, it } from "vitest";
import { chatSubject, FAQ, matchFaq, quickQuestions } from "./help-faq";

describe("help chat standard questions", () => {
  it("has unique ids and a link for every entry", () => {
    expect(new Set(FAQ.map((f) => f.id)).size).toBe(FAQ.length);
    expect(FAQ.every((f) => f.answer.length > 20 && f.href && f.link)).toBe(true);
  });
  it("matches everyday wording to the right answer", () => {
    expect(matchFaq("How do I pair a new tablet?")?.id).toBe("pair-till");
    expect(matchFaq("printer prints blank pages")?.id).toBe("printer");
    expect(matchFaq("where is the grand report")?.id).toBe("reports");
    expect(matchFaq("stock not deducting after sale")?.id).toBe("stock");
    expect(matchFaq("khata balance of a customer")?.id).toBe("khata");
    expect(matchFaq("can I change my plan")?.id).toBe("plan");
    expect(matchFaq("does it work during load shedding")?.id).toBe("offline");
    expect(matchFaq("put my logo on the receipt")?.id).toBe("branding");
    expect(matchFaq("where do I download the windows installer")?.id).toBe("desktop");
  });
  it("returns null for stop words only or unrelated text", () => {
    expect(matchFaq("hello please help me")).toBeNull();
    expect(matchFaq("")).toBeNull();
    expect(matchFaq("the weather in Lahore")).toBeNull();
  });
  it("offers the first questions as chips and shortens subjects", () => {
    expect(quickQuestions(3).map((q) => q.id)).toEqual(["pair-till", "add-product", "branding"]);
    expect(chatSubject("Printer stopped. It prints blank pages since morning")).toBe("Printer stopped");
    expect(chatSubject("x".repeat(100))).toHaveLength(80);
    expect(chatSubject("   ")).toBe("");
  });
});
