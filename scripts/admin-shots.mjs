import { chromium } from "playwright";
const DIR = "/tmp/claude-1000/-home-sajid-projects-company-servio/ba922407-18f1-4492-b13a-51413da7f2e2/scratchpad/walk/";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto("http://localhost:3000/login"); await p.fill("input[type=email]", "demo@easalpha.com"); await p.fill("input[type=password]", "password123"); await p.getByRole("button", { name: "Log in" }).click(); await p.waitForURL(/\/admin/, { timeout: 60000 });
for (const [path, name] of [["/admin/orders/pending", "a-pending"], ["/admin", "a-dashboard"], ["/admin/finance/dashboard", "a-finance"]]) {
  await p.goto("http://localhost:3000" + path, { waitUntil: "networkidle" }); await p.waitForTimeout(1500); await p.screenshot({ path: DIR + name + ".png" });
}
await b.close(); console.log("done");
