#!/usr/bin/env node
// Review 2.4: walks the rendered DOM of the key routes in light and dark mode, measures the contrast of every visible
// text node against the background it is actually drawn on, and prints each failure. Exits 1 when anything fails.
//
//   pnpm audit:contrast                       # against a local build on http://localhost:3002, API on :3001
//   WEB=http://localhost:3000 pnpm audit:contrast
//
// Environment: WEB (default http://localhost:3002), API (default http://localhost:3001/api/v1), EMAIL and PASSWORD
// (an owner login; default the local demo owner), POS_PIN (default 9999, the demo manager). The till needs a paired
// device: the script pairs one through the API, so point it at a local or staging API, never at production.
// Playwright is loaded from this project or from ../scripts/node_modules, and drives the installed Chrome.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
async function loadPlaywright() {
  for (const p of ["playwright", path.join(here, "../../scripts/node_modules/playwright/index.js")]) {
    try { return p.startsWith("/") ? (existsSync(p) ? require(p) : null) : require(p); } catch { /* try the next */ }
  }
  console.error("Playwright is not installed. Run: npm i -D playwright (or install it in ../scripts).");
  process.exit(2);
}

const WEB = process.env.WEB || "http://localhost:3002";
const API = process.env.API || "http://localhost:3001/api/v1";
const EMAIL = process.env.EMAIL || "demo@easalpha.com";
const PASSWORD = process.env.PASSWORD || "password123";
const POS_PIN = process.env.POS_PIN || "9999";
const ADMIN_ROUTES = ["/admin", "/admin/orders", "/admin/finance/dashboard", "/admin/staff/roles", "/admin/products/catalog", "/admin/tables", "/admin/settings", "/admin/reports/sales"];
const POS_ROUTES = ["/pos"];
const PUBLIC_ROUTES = ["/", "/pricing", "/login"];

if (/easalpha\.com/.test(API)) { console.error("Refusing to pair a till against production. Set API to a local or staging server."); process.exit(2); }

async function api(p, { method = "GET", token, body } = {}) {
  const r = await fetch(API + p, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* empty body */ }
  return { status: r.status, j };
}

/** Runs in the page: every visible text node with its colour, the background under it and the ratio it needs. */
function measure() {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = "1"] = m[1].split(/[ ,/]+/).filter(Boolean); return [Number(r), Number(g), Number(b), Number(a)]; };
  const over = (top, under) => { const a = top[3]; return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  /** The colour actually behind an element: its own and its ancestors' backgrounds composited from the page up. When an
   *  overlay (a fixed, absolute or sticky ancestor such as the site header) has no background of its own, what shows
   *  through is whatever is painted under it, so the walk continues with the elements beneath that point. */
  const backdrop = (el) => {
    const layers = [];
    const take = (n) => {
      const cs = getComputedStyle(n);
      if (n.tagName === "IMG" || n.tagName === "VIDEO" || n.tagName === "CANVAS") return "image";
      if (cs.backgroundImage && cs.backgroundImage !== "none" && !/^linear-gradient\(.*transparent/.test(cs.backgroundImage)) return "image";
      const bg = parse(cs.backgroundColor);
      if (bg && bg[3] > 0) { layers.push(bg); if (bg[3] >= 1) return "opaque"; }
      return null;
    };
    let overlay = null;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const t = take(n);
      if (t === "image") return null; // a picture or gradient: not measurable
      if (t === "opaque") { overlay = null; break; }
      if (/^(fixed|absolute|sticky)$/.test(getComputedStyle(n).position)) { overlay = n; break; }
    }
    if (overlay) {
      const r = el.getBoundingClientRect();
      const x = r.left + Math.min(r.width / 2, 6), y = r.top + r.height / 2;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return null;
      for (const n of document.elementsFromPoint(x, y)) {
        if (overlay.contains(n)) continue;
        const t = take(n);
        if (t === "image") return null;
        if (t === "opaque") break;
      }
    }
    let colour = [255, 255, 255, 1];
    for (const l of layers.reverse()) colour = over(l, colour);
    return colour;
  };
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const text = t.textContent.replace(/\s+/g, " ").trim();
    const el = t.parentElement;
    if (!text || !el || seen.has(el)) continue;
    seen.add(el);
    if (el.closest("[aria-hidden=true], [disabled], [aria-disabled=true], script, style, noscript, option, svg")) continue;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    let opacity = 1; for (let n = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
    if (opacity < 0.5) continue; // faded out on purpose (disabled, transitions)
    const fg = parse(cs.color);
    if (!fg || fg[3] === 0) continue; // transparent text (the date field draws its own)
    const bg = backdrop(el);
    if (!bg) continue;
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const r = ratio(over(fg, bg), bg);
    if (r < need) out.push({ text: text.slice(0, 60), ratio: Math.round(r * 100) / 100, need, fg: cs.color, bg: `rgb(${bg.slice(0, 3).map(Math.round).join(",")})`, tag: el.tagName.toLowerCase(), cls: (el.className?.baseVal ?? el.className ?? "").toString().slice(0, 80) });
  }
  return out;
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || "chrome", headless: true });
let failures = 0;

async function audit(page, route, theme) {
  await page.emulateMedia({ colorScheme: theme });
  await page.goto(WEB + route, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(800);
  const found = await page.evaluate(measure);
  failures += found.length;
  console.log(`${found.length ? "FAIL" : "ok  "} ${theme.padEnd(5)} ${route}${found.length ? `  (${found.length})` : ""}`);
  for (const f of found.slice(0, 15)) console.log(`       ${f.ratio}:1 < ${f.need}:1  "${f.text}"  ${f.fg} on ${f.bg}  <${f.tag} class="${f.cls}">`);
}

// Public pages, then the admin as the owner, then the till paired as a POS device.
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
for (const theme of ["light", "dark"]) for (const r of PUBLIC_ROUTES) await audit(page, r, theme);

const login = await api("/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
if (login.status !== 200) { console.error(`Owner login failed (${login.status}); set EMAIL and PASSWORD.`); process.exit(2); }
await page.goto(WEB + "/login");
await page.getByLabel(/email/i).fill(EMAIL);
await page.getByLabel(/password/i).fill(PASSWORD);
await page.getByRole("button", { name: /log in|sign in/i }).click();
await page.waitForURL(/\/admin/, { timeout: 20000 });
for (const theme of ["light", "dark"]) for (const r of ADMIN_ROUTES) await audit(page, r, theme);

const token = login.j.access_token;
const branches = (await api("/branches", { token })).j;
const branchId = (branches.data ?? branches)[0].id;
const device = await api("/devices", { method: "POST", token, body: { name: `Contrast audit ${Date.now() % 100000}`, kind: "till", branch_id: branchId } });
const code = device.j?.pairing_code;
if (code) {
  const till = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await till.goto(`${WEB}/pos/pair`);
  for (const d of String(code)) await till.getByRole("button", { name: d, exact: true }).first().click();
  await till.getByRole("button", { name: "Pair", exact: true }).click();
  await till.waitForURL(/\/pos\/pin/, { timeout: 20000 });
  for (const d of POS_PIN) await till.getByRole("button", { name: d, exact: true }).first().click();
  await till.waitForURL(/\/pos$/, { timeout: 20000 });
  for (const theme of ["light", "dark"]) for (const r of POS_ROUTES) await audit(till, r, theme);
  if (device.j?.id) await api(`/devices/${device.j.id}`, { method: "DELETE", token });
} else {
  console.log(`skip  /pos  (could not pair a till: ${device.status})`);
}

await browser.close();
console.log(failures ? `\n${failures} text nodes below WCAG AA` : "\nEvery measured text node meets WCAG AA in light and dark mode");
process.exit(failures ? 1 : 0);
