import { describe, expect, it } from "vitest";
import type { Storefront } from "@/lib/types";
import { iconLetter, shortName, storeDescription, storeManifest } from "./store-app";

const data = (identity: Record<string, unknown> = {}, seo: Record<string, unknown> = {}) => ({ business: { name: "Demo Cafe Ltd", slug: "demo-cafe", currency: "PKR", logo_key: null, phone: null }, config: { identity, seo } }) as unknown as Pick<Storefront, "business" | "config">;

describe("restaurant customer app", () => {
  it("installs under the restaurant's name and colour, scoped to its own site", () => {
    const m = storeManifest("demo-cafe", data({ name: "Demo Cafe", theme_color: "#C2410C" }));
    expect(m).toMatchObject({ id: "/store/demo-cafe", name: "Demo Cafe", short_name: "Demo Cafe", start_url: "/store/demo-cafe?source=app", scope: "/store/demo-cafe", display: "standalone", theme_color: "#c2410c" });
    expect(m.icons.map((i) => [i.sizes, i.purpose])).toEqual([["192x192", "any"], ["512x512", "any"], ["512x512", "maskable"]]);
    expect(m.icons[0].src).toBe("/store/demo-cafe/app-icon/192");
  });

  it("falls back to the business name and EasAlpha navy", () => {
    expect(storeManifest("x", data())).toMatchObject({ name: "Demo Cafe Ltd", theme_color: "#10294d" });
  });

  it("keeps the home-screen label short on whole words", () => {
    expect(shortName("Demo Cafe")).toBe("Demo Cafe");
    expect(shortName("Shahzad Restaurant Multan Road")).toBe("Shahzad");
    expect(shortName("Dastarkhwanfamily")).toBe("Dastarkhwanf");
  });

  it("draws a Latin letter on the icon even for an Urdu name", () => {
    expect(iconLetter("Demo Cafe", "demo-cafe")).toBe("D");
    expect(iconLetter("دسترخوان", "dastarkhwan")).toBe("D");
  });

  it("describes the app from SEO, then the tagline", () => {
    expect(storeDescription(data({ name: "Demo Cafe" }, { description: "Best karahi in Lahore" }))).toBe("Best karahi in Lahore");
    expect(storeDescription(data({ name: "Demo Cafe", description: "Family dining since 1998" }))).toBe("Demo Cafe: Family dining since 1998. Order online for delivery or pickup.");
  });
});
