import { chromium } from "playwright";
const DIR = "/tmp/claude-1000/-home-sajid-projects-company-servio/ba922407-18f1-4492-b13a-51413da7f2e2/scratchpad/walk/";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://localhost:3000/signup", { waitUntil: "networkidle" }); await p.waitForTimeout(1000);
await p.screenshot({ path: DIR + "08-signup.png" });
// validation: bad email and short password, then submit without agreeing
const inputs = await p.locator("input").count(); console.log("inputs", inputs);
await p.locator('input[name="name"], input[placeholder*="Ali"]').first().fill("Test Owner").catch(() => {});
await p.locator('input[type="email"]').first().fill("not-an-email");
await p.locator('input[type="password"]').first().fill("123");
await p.getByRole("button", { name: /create my account/i }).click().catch(() => {});
await p.waitForTimeout(800); await p.screenshot({ path: DIR + "08b-signup-errors.png" });
const text = await p.textContent("body"); console.log("shows validation:", /valid email|at least 8|agree/i.test(text || ""));
const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
await m.goto("http://localhost:3000/store/demo-cafe", { waitUntil: "networkidle" }); await m.waitForTimeout(1500); await m.screenshot({ path: DIR + "15-storefront-phone.png" });
await b.close();
