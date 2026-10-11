import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const dir = "/tmp/claude-1000/-home-sajid-projects-company-servio/ba922407-18f1-4492-b13a-51413da7f2e2/scratchpad/";
await p.goto("http://localhost:3000/", { waitUntil: "networkidle" }); await p.waitForTimeout(1500);
await p.screenshot({ path: dir + "site-home.png" });
await p.evaluate(() => window.scrollTo(0, 900)); await p.waitForTimeout(1200); await p.screenshot({ path: dir + "site-home-2.png" });
await p.evaluate(() => window.scrollTo(0, 2600)); await p.waitForTimeout(1200); await p.screenshot({ path: dir + "site-home-3.png" });
for (const [path, name] of [["/pricing", "site-pricing"], ["/signup", "site-signup"]]) { await p.goto("http://localhost:3000" + path, { waitUntil: "networkidle" }); await p.waitForTimeout(1200); await p.screenshot({ path: dir + name + ".png" }); }
const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true }); await m.goto("http://localhost:3000/", { waitUntil: "networkidle" }); await m.waitForTimeout(1200); await m.screenshot({ path: dir + "site-home-phone.png" });
await b.close(); console.log("done");
