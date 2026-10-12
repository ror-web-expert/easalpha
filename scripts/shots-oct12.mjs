// Screenshots of the 12 Oct 2026 screens for a manual look: node scripts/shots-oct12.mjs <web url> <path> [<path> ...]
import { chromium } from "playwright";
const WEB = process.argv[2] || "http://localhost:3002";
const paths = process.argv.slice(3);
const OUT = new URL("./shots/oct12/", import.meta.url).pathname;
const b = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await b.newContext({ viewport: { width: 1366, height: 860 } });
const p = await ctx.newPage();
const errors = [];
p.on("console", (m) => { if (m.type() === "error") errors.push(`${p.url()} ${m.text().slice(0, 200)}`); });
p.on("pageerror", (e) => errors.push(`${p.url()} pageerror ${String(e).slice(0, 200)}`));
p.on("response", (r) => { if (r.status() >= 400 && r.url().includes("/api/v1/")) errors.push(`${p.url()} ${r.status()} ${r.url().replace(/^.*\/api\/v1/, "")}`); });
await p.goto(WEB + "/login", { timeout: 120000 }); await p.waitForSelector("input[type=email]", { timeout: 120000 });
await p.fill("input[type=email]", "demo@easalpha.com"); await p.fill("input[type=password]", "password123");
await p.getByRole("button", { name: "Log in" }).click(); await p.waitForURL(/\/admin/, { timeout: 120000 });
for (const path of paths) {
  await p.goto(WEB + path, { waitUntil: "networkidle", timeout: 180000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const name = path.replace(/[/?=&]+/g, "_").replace(/^_/, "");
  await p.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
  const body = await p.evaluate(() => document.body.innerText);
  console.log(`${path}: ${/Application error|Unhandled Runtime Error|could not be found/.test(body) ? "BROKEN" : "ok"} -> ${name}.png`);
}
console.log("errors:", errors.length); for (const e of errors.slice(0, 15)) console.log("  ", e);
await b.close();
