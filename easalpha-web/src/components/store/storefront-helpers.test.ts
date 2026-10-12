import { describe, expect, it } from "vitest";
import { footerLinks, fromPrice, legalDocuments, mapEmbed, mapLink, matchesMenu, normalizeHex, ratingBars, shade, sliderImages, socialProfiles, themeInk, whatsappHref } from "./storefront-helpers";

describe("colours", () => {
  it("normalises hex colours and rejects anything else", () => {
    expect(normalizeHex("#10294D")).toBe("#10294d");
    expect(normalizeHex("f60")).toBe("#ff6600");
    expect(normalizeHex(" #ABC ")).toBe("#aabbcc");
    expect(normalizeHex("navy")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex(null)).toBeNull();
  });

  it("shades toward black or white and leaves unknown values alone", () => {
    expect(shade("#808080", -0.5)).toBe("#404040");
    expect(shade("#808080", 0.5)).toBe("#c0c0c0");
    expect(shade("#10294d", 0)).toBe("#10294d");
    expect(shade("#ff0000", -1)).toBe("#000000");
    expect(shade("red", -0.5)).toBe("red");
  });

  it("keeps dark brand colours for text and swaps light ones for near-black", () => {
    expect(themeInk("#10294D")).toBe("#10294d"); // navy reads on white
    expect(themeInk("#b91c1c")).toBe("#b91c1c"); // deep red reads on white
    expect(themeInk("#ff7a1a")).toBe("#191c23"); // orange is below 4.5:1 on white
    expect(themeInk("#f5c518")).toBe("#191c23"); // yellow
    expect(themeInk("oops")).toBe("#191c23");
  });
});

describe("menu", () => {
  const pizza = { name: "Pizza", description: "Wood fired", price_minor: 0, variants: [{ id: "v1", name: "Small", price_minor: 90000 }, { id: "v2", name: "Large", price_minor: 150000 }] };
  const karahi = { name: "Chicken Karahi", description: null, price_minor: 120000, variants: [] };

  it("prices a product from its cheapest size", () => {
    expect(fromPrice(pizza)).toBe(90000);
    expect(fromPrice(karahi)).toBe(120000);
  });

  it("matches every word against name, description and sizes, in any case", () => {
    expect(matchesMenu(karahi, "")).toBe(true);
    expect(matchesMenu(karahi, "  ")).toBe(true);
    expect(matchesMenu(karahi, "karahi")).toBe(true);
    expect(matchesMenu(karahi, "CHICKEN kar")).toBe(true);
    expect(matchesMenu(karahi, "chicken pizza")).toBe(false);
    expect(matchesMenu(pizza, "wood")).toBe(true);
    expect(matchesMenu(pizza, "large")).toBe(true);
    expect(matchesMenu(pizza, "medium")).toBe(false);
  });
});

describe("reviews", () => {
  it("gives a bar per star with its share, 5 first", () => {
    expect(ratingBars({ "1": 1, "2": 1, "3": 1, "4": 3, "5": 4 }, 10)).toEqual([
      { stars: 5, count: 4, pct: 40 }, { stars: 4, count: 3, pct: 30 }, { stars: 3, count: 1, pct: 10 }, { stars: 2, count: 1, pct: 10 }, { stars: 1, count: 1, pct: 10 },
    ]);
  });

  it("copes with no ratings and missing keys", () => {
    expect(ratingBars({}, 0).map((b) => b.pct)).toEqual([0, 0, 0, 0, 0]);
    expect(ratingBars(undefined, 3).map((b) => b.count)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("location", () => {
  it("prefers the owner's map link, then the pin, then an address search", () => {
    expect(mapLink({ map_link: "https://maps.app.goo.gl/abc" }, "Gulberg")).toBe("https://maps.app.goo.gl/abc");
    expect(mapLink({ map_link: "javascript:alert(1)", lat: 31.5, lng: 74.35 }, "Gulberg")).toBe("https://www.google.com/maps/search/?api=1&query=31.5,74.35");
    expect(mapLink({}, "12 Main Blvd, Gulberg III")).toBe("https://www.google.com/maps/search/?api=1&query=12%20Main%20Blvd%2C%20Gulberg%20III");
    expect(mapLink(null, "")).toBeNull();
  });

  it("embeds the pin or the address, or nothing", () => {
    expect(mapEmbed({ lat: "31.5", lng: "74.35" }, "x")).toBe("https://www.google.com/maps?q=31.5%2C74.35&z=15&output=embed");
    expect(mapEmbed({}, "Gulberg 3")).toBe("https://www.google.com/maps?q=Gulberg%203&z=15&output=embed");
    expect(mapEmbed({}, "  ")).toBeNull();
  });
});

describe("social profiles", () => {
  it("orders known networks, turns handles into profile links and drops junk", () => {
    expect(socialProfiles({ youtube: "@democafe", facebook: "https://facebook.com/democafe", tiktok: null, instagram: "demo.cafe", other: "not a link" })).toEqual([
      { key: "facebook", network: "facebook", label: "Facebook", href: "https://facebook.com/democafe" },
      { key: "instagram", network: "instagram", label: "Instagram", href: "https://instagram.com/demo.cafe" },
      { key: "youtube", network: "youtube", label: "YouTube", href: "https://youtube.com/@democafe" },
    ]);
  });

  it("uses the Instagram section's handle when the social link is blank, and keeps other links", () => {
    expect(socialProfiles({ instagram: "", snapchat_page: "www.snapchat.com/add/demo" }, "@democafe")).toEqual([
      { key: "instagram", network: "instagram", label: "Instagram", href: "https://instagram.com/democafe" },
      { key: "snapchat_page", network: "other", label: "Snapchat Page", href: "https://www.snapchat.com/add/demo" },
    ]);
    expect(socialProfiles(null)).toEqual([]);
  });
});

describe("content lists", () => {
  it("reads slider images from strings or objects and skips non-URLs", () => {
    expect(sliderImages(["https://x/a.jpg", " /uploads/b.png ", "hello", { image_key: "https://x/c.jpg" }, { url: "https://x/d.jpg" }, null])).toEqual(["https://x/a.jpg", "/uploads/b.png", "https://x/c.jpg", "https://x/d.jpg"]);
    expect(sliderImages("https://x/a.jpg")).toEqual([]);
  });

  it("lists the documents that have text, in a fixed order", () => {
    expect(legalDocuments({ refund: "No refunds after 24 hours", terms: " ", privacy: "We keep your phone number." })).toEqual([
      { key: "privacy", label: "Privacy policy", text: "We keep your phone number." },
      { key: "refund", label: "Refund policy", text: "No refunds after 24 hours" },
    ]);
    expect(legalDocuments(undefined)).toEqual([]);
  });

  it("reads footer links from objects or strings and drops unsafe ones", () => {
    expect(footerLinks([{ label: "Menu", url: "/menu" }, "https://x.com", { label: "Bad", url: "javascript:alert(1)" }, { label: "Data", url: "data:text/html,hi" }, { label: "Empty" }, { label: "Blog", url: "www.demo.cafe/blog" }, { label: "Call", url: "tel:+92300" }])).toEqual([
      { label: "Menu", url: "/menu" }, { label: "https://x.com", url: "https://x.com" }, { label: "Blog", url: "https://www.demo.cafe/blog" }, { label: "Call", url: "tel:+92300" },
    ]);
    expect(footerLinks(null)).toEqual([]);
  });

  it("builds a wa.me link from any number format, with the greeting", () => {
    expect(whatsappHref("+92 343 7172731")).toBe("https://wa.me/923437172731");
    expect(whatsappHref("+923437172731", "Salam! I would like to order.")).toBe("https://wa.me/923437172731?text=Salam!%20I%20would%20like%20to%20order.");
    expect(whatsappHref("")).toBeNull();
  });
});
