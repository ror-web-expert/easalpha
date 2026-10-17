import { describe, expect, it } from "vitest";
import { breadcrumbs, faqPage, itemList, localBusiness, organization, pricingProduct, serializeJsonLd, softwareApplication, webSite } from "./schema";
import { HOME_FAQ } from "@/components/site/faq";
import { CONTACT, OFFICE, PLANS } from "@/components/site/site-helpers";

describe("schema", () => {
  it("FAQPage answers are the accordion's text, word for word", () => {
    const faq = faqPage(HOME_FAQ);
    expect(faq.mainEntity).toHaveLength(6);
    faq.mainEntity.forEach((q, i) => {
      expect(q.name).toBe(HOME_FAQ[i].q);
      expect(q.acceptedAnswer.text).toBe(HOME_FAQ[i].a);
    });
  });

  it("offers carry the pricing table's numbers in both currencies", () => {
    for (const node of [softwareApplication(), pricingProduct()]) {
      expect(node.offers).toHaveLength(PLANS.length * 2);
      for (const p of PLANS) {
        const pkr = node.offers.find((o) => o.name === `${p.name} plan` && o.priceCurrency === "PKR");
        const usd = node.offers.find((o) => o.name === `${p.name} plan` && o.priceCurrency === "USD");
        expect(pkr?.price).toBe(String(p.pricePkrMinor / 100));
        expect(usd?.price).toBe(String(p.priceUsdMinor / 100));
        expect(pkr?.url).toContain(`plan=${p.code}`);
      }
    }
    expect(softwareApplication().offers.map((o) => o.price)).toEqual(["2500", "19", "4999", "39", "8999", "69"]);
  });

  it("organization uses the footer's contact details and the office address", () => {
    const org = organization();
    expect(org.telephone).toBe(CONTACT.whatsapp);
    expect(org.email).toBe(CONTACT.email);
    expect(org.address.streetAddress).toBe(OFFICE.street);
    expect(org.address.addressLocality).toBe("Lahore");
    expect(org.address.addressCountry).toBe("PK");
    expect(webSite().publisher["@id"]).toBe(org["@id"]);
  });

  it("the local business carries the office, the support number and every day's hours", () => {
    const lb = localBusiness();
    expect(lb.address.streetAddress).toBe(OFFICE.street);
    expect(lb.telephone).toBe(CONTACT.whatsapp);
    expect(lb.openingHoursSpecification[0].dayOfWeek).toHaveLength(7);
    expect(lb.openingHoursSpecification[0]).toMatchObject({ opens: "00:00", closes: "23:59" }); // support answers 24/7
    expect(lb.priceRange).toBe("Rs 2,500 to Rs 8,999 a month");
    expect(lb.parentOrganization["@id"]).toBe(organization()["@id"]);
  });

  it("breadcrumbs and item lists are positioned from 1 with absolute URLs", () => {
    const b = breadcrumbs("Pricing", "/pricing");
    expect(b.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    expect(b.itemListElement[1].item).toMatch(/^https?:\/\/.+\/pricing$/);
    const l = itemList("Screens", [{ name: "Till", url: "/pos" }, { name: "Docs", url: "https://example.com/docs" }]);
    expect(l.itemListElement[0].item).toMatch(/\/pos$/);
    expect(l.itemListElement[1].item).toBe("https://example.com/docs");
  });

  it("serialises to parseable JSON with < escaped", () => {
    const json = serializeJsonLd(faqPage([{ q: "Is <b>bold</b> safe?", a: "</script><script>alert(1)</script>" }]));
    expect(json).not.toContain("<");
    const parsed = JSON.parse(json);
    expect(parsed.mainEntity[0].acceptedAnswer.text).toBe("</script><script>alert(1)</script>");
    expect(JSON.parse(serializeJsonLd([organization(), webSite()]))).toHaveLength(2);
  });
});

describe("guides", () => {
  it("every guide is linked from three others through Related", async () => {
    const { GUIDES, otherGuides } = await import("@/components/site/guides");
    const inbound = new Map(GUIDES.map((g) => [g.slug, 0]));
    for (const g of GUIDES) {
      const rel = otherGuides(g.slug);
      expect(rel).toHaveLength(3);
      expect(rel.map((r) => r.slug)).not.toContain(g.slug);
      for (const r of rel) inbound.set(r.slug, (inbound.get(r.slug) ?? 0) + 1);
    }
    for (const [slug, n] of inbound) expect(n, slug).toBe(3);
  });
});
