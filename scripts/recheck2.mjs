import { chromium } from "playwright";
const DIR = "/tmp/claude-1000/-home-sajid-projects-company-servio/ba922407-18f1-4492-b13a-51413da7f2e2/scratchpad/walk/";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://localhost:3000/pricing", { waitUntil: "networkidle" }); await p.evaluate(() => window.scrollTo(0, 520)); await p.waitForTimeout(1200); await p.screenshot({ path: DIR + "r2-pricing.png" });
await p.goto("http://localhost:3000/", { waitUntil: "networkidle" });
const navy = await p.evaluate(() => { const el = [...document.querySelectorAll("section")].find((s) => /Built for Pakistan|load-shedding/i.test(s.textContent || "") && getComputedStyle(s).backgroundColor !== "rgba(0, 0, 0, 0)" && s.getBoundingClientRect().top > 600); if (el) { el.scrollIntoView(); return true; } return false; });
await p.waitForTimeout(1200); await p.screenshot({ path: DIR + "r2-home-navy.png" }); console.log("navy section found", navy);
await b.close();
