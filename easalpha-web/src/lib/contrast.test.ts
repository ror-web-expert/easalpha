import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

// Review 2.1 / 2.4: every token pair the apps use for text must reach WCAG AA (4.5:1), in light and in dark mode.
// Reads the tokens straight from globals.css, so changing a colour that breaks a pair fails CI.
const css = readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`No ${selector} block`);
  const open = css.indexOf("{", start);
  let depth = 1, i = open + 1;
  while (depth && i < css.length) { if (css[i] === "{") depth++; else if (css[i] === "}") depth--; i++; }
  const body = css.slice(open + 1, i - 1);
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6})\b/g)) out[m[1]] = m[2];
  return out;
}

const light = block(":root {");
const dark = { ...light, ...block(':root[data-theme="dark"]') };

// [foreground, background] as token names.
const PAIRS: [string, string][] = [
  ["text-primary", "bg-page"], ["text-primary", "bg-card"], ["text-primary", "bg-muted"],
  ["text-secondary", "bg-page"], ["text-secondary", "bg-card"], ["text-secondary", "bg-muted"],
  ["text-muted", "bg-page"], ["text-muted", "bg-card"], ["text-muted", "bg-muted"],
  ["heading", "bg-page"], ["heading", "bg-card"],
  ["primary-fg", "primary"], ["primary-ink", "primary-soft"],
  ["cta-fg", "cta"], ["cta-fg", "cta-hover"], ["cta-ink", "cta-soft"], ["cta-ink", "bg-card"],
  ["success-fg", "success"], ["success-ink", "success-soft"],
  ["warning-fg", "warning"], ["warning-ink", "warning-soft"],
  ["danger-fg", "danger"], ["danger-ink", "danger-soft"],
  ["info-fg", "info"], ["info-ink", "info-soft"],
  ["accent-fg", "accent"], ["accent-ink", "accent-soft"],
  ["inverse-fg", "inverse"],
  // POS surfaces (review 2.3): the cart labels and totals on the panel, the name and price on a tile, the quick add mark.
  ["text-primary", "pos-panel"], ["text-secondary", "pos-panel"], ["text-muted", "pos-panel"],
  ["text-primary", "pos-tile"], ["text-secondary", "pos-tile"], ["primary", "pos-tile"],
];

describe.each([["light", light], ["dark", dark]] as const)("%s mode text pairs reach 4.5:1", (_mode, tokens) => {
  for (const [fg, bg] of PAIRS) {
    it(`${fg} on ${bg}`, () => {
      expect(tokens[fg], fg).toBeDefined();
      expect(tokens[bg], bg).toBeDefined();
      expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("the orange rule", () => {
  it("white on the bright brand orange fails, which is why it never carries text", () => {
    expect(contrastRatio("#ffffff", light["brand-orange"])).toBeLessThan(3);
  });
  it("the action orange that carries white text passes", () => {
    expect(contrastRatio("#ffffff", light["cta"])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#ffffff", light["brand-cta"])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("POS dark mode surfaces (review 2.3)", () => {
  // Surfaces that touch on screen: the bar sits on the panel strips (order type, quick add), the product area meets the
  // cart panel and holds the tiles. Each pair differs by at least 1.25:1, so the three panes read apart.
  it.each([["pos-bar", "pos-panel"], ["bg-page", "pos-panel"], ["bg-page", "pos-tile"], ["pos-panel", "pos-tile"]])("%s against %s", (a, b) => {
    expect(contrastRatio(dark[a], dark[b])).toBeGreaterThanOrEqual(1.25);
  });
});
