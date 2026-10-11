// Rasterises the brand mark into the PWA icons and an OG image (no native image library needed).
import { chromium } from "playwright";
import fs from "node:fs";
const PUB = new URL("../servio-web/public/", import.meta.url).pathname;
const svg = fs.readFileSync(PUB + "brand/logo-mark.svg", "utf8");
const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const size of [192, 512, 64, 32]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('width="64" height="64"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.screenshot({ path: PUB + (size === 64 ? "favicon-64.png" : size === 32 ? "favicon-32.png" : `icon-${size}.png`), omitBackground: true });
  await page.close();
}
const logo = fs.readFileSync(PUB + "brand/logo-white.svg", "utf8");
const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await og.setContent(`<html><body style="margin:0;width:1200px;height:630px;display:flex;flex-direction:column;justify-content:center;padding:80px;box-sizing:border-box;background:linear-gradient(135deg,#0D47A1,#1E88E5);font-family:Roboto,Inter,Segoe UI,Arial,sans-serif;color:#fff">
  <div style="width:390px">${logo.replace('width="260" height="64"', 'width="390" height="96"')}</div>
  <div style="font-size:56px;font-weight:700;line-height:1.15;margin-top:36px;letter-spacing:-0.5px">The restaurant POS built for Pakistan</div>
  <div style="font-size:28px;opacity:.9;margin-top:18px">Till, kitchen, inventory, accounts, payroll, riders and WhatsApp. Works offline.</div></body></html>`);
await og.screenshot({ path: PUB + "og.png" });
await browser.close();
console.log("icons:", fs.readdirSync(PUB).filter((f) => /icon|favicon|og\.png/.test(f)).join(", "));
