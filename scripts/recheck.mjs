import { chromium } from "playwright";
const DIR = "/tmp/claude-1000/-home-sajid-projects-company-servio/ba922407-18f1-4492-b13a-51413da7f2e2/scratchpad/walk/";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
for (const [path, name, y] of [["/", "r-home", 0], ["/", "r-home-cta", 99999], ["/pricing", "r-pricing", 500], ["/signup", "r-signup", 0], ["/queue", "r-queue", 0]]) {
  await p.goto("http://localhost:3000" + path, { waitUntil: "networkidle" }); if (y) await p.evaluate((yy) => window.scrollTo(0, yy), y); await p.waitForTimeout(1300); await p.screenshot({ path: DIR + name + ".png" });
}
const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
await m.goto("http://localhost:3000/store/demo-cafe", { waitUntil: "networkidle" }); await m.waitForTimeout(1500); await m.screenshot({ path: DIR + "r-store.png" });
await b.close(); console.log("done");
