// Touch-screen check for the till: pairs a till, logs in as the cashier and drives it with touch gestures on an
// emulated Android tablet. Reports whether each list scrolls by swiping, whether a swipe adds an item by mistake,
// whether the page itself scrolls or zooms, and whether dialogs fit. Usage: node scripts/touch-check.mjs [label] (PIN=, WEB=, SIZES= override)
import { chromium } from "playwright";
import fs from "node:fs";
const API = process.env.API || "http://localhost:3001/api/v1", WEB = process.env.WEB || "http://localhost:3000";
const label = process.argv[2] || "run";
const OUT = new URL(`./shots/touch-${label}/`, import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const results = [];
const step = (name, ok, info = "") => { results.push({ name, ok, info }); console.log(`${ok ? "ok  " : "FAIL"} ${name} ${info}`); };
async function api(path, { method = "GET", token, body } = {}) {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}
const T = (await api("/auth/login", { method: "POST", body: { email: "demo@easalpha.com", password: "password123" } })).j.access_token;
const existing = (await api("/devices", { token: T })).j?.data || [];
for (const d of existing) if (d.name === "Touch test till") await api(`/devices/${d.id}`, { method: "DELETE", token: T });
let till = await api("/devices", { method: "POST", token: T, body: { name: "Touch test till", kind: "till" } });
if (till.status !== 201) { const c = existing.find((d) => d.name === "Counter till"); till = await api(`/devices/${c.id}/regenerate_code`, { method: "POST", token: T }); }

const sizes = (process.env.SIZES || "1280x800,1024x600,800x1280").split(",").map((s) => s.split("x").map(Number));
const browser = await chromium.launch({ channel: "chrome", headless: true });
let paired = null;
for (const [w, h] of sizes) {
  const tag = `${w}x${h}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1.5,
    userAgent: "Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36" });
  if (paired) await ctx.addInitScript((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, paired);
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  if (!paired) {
    await p.goto(WEB + "/pos/pair"); await p.waitForSelector("button", { timeout: 60000 });
    for (const d of till.j.pairing_code) await p.getByRole("button", { name: d, exact: true }).first().tap();
    await p.getByRole("button", { name: "Pair" }).tap();
    await p.waitForURL(/\/pos\/pin/, { timeout: 20000 });
  } else {
    await p.goto(WEB + "/pos/pin");
  }
  await p.waitForSelector("button", { timeout: 30000 });
  if (!/\/pos$/.test(p.url())) {
    for (const d of (process.env.PIN || "1111")) await p.getByRole("button", { name: d, exact: true }).first().tap();
    await p.waitForURL(/\/pos$/, { timeout: 20000 });
  }
  if (!paired) paired = await p.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith("easalpha")).map((k) => [k, localStorage.getItem(k)])));
  await p.waitForTimeout(2500);
  // Clear any leftover cart
  await p.evaluate(() => { try { const k = Object.keys(localStorage).find((x) => x.includes("cart")); if (k) localStorage.removeItem(k); } catch {} });
  await p.reload(); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}${tag}-start.png` });
  // Close whatever opens on its own (shift reminder, confirmation): Escape, then any visible Close/Skip/Later button.
  for (let i = 0; i < 3 && (await p.locator('[role="dialog"]').count()); i++) {
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    const close = p.locator('[role="dialog"]').getByRole("button", { name: /^(Close|Skip|Later|Not now|Cancel|OK)$/i });
    if (await close.count()) { await close.first().tap(); await p.waitForTimeout(300); }
  }
  const stuck = await p.locator('[role="dialog"]').count();
  if (stuck) { const title = await p.locator('[role="dialog"]').first().innerText(); step(`${tag} a dialog stays open after login`, false, title.slice(0, 120).replace(/\n/g, " | ")); }

  // A finger drag as raw touch events (synthesizeScrollGesture does nothing in headless Chrome).
  const swipe = async (x, y, dy, steps = 12) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= steps; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + (dy * i) / steps }] }); await p.waitForTimeout(16); }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const lines = () => p.evaluate(() => document.querySelectorAll("main li.border-b, ul.flex-1 > li.border-b").length);
  const info = (sel) => p.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { top: el.scrollTop, h: el.scrollHeight, ch: el.clientHeight, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; }, sel);

  // Page-level: does the document itself scroll or allow zoom, and what touch rules are set
  const page = await p.evaluate(() => {
    const se = document.scrollingElement; const cs = getComputedStyle(document.body); const hs = getComputedStyle(document.documentElement);
    const btn = document.querySelector("button"); const meta = document.querySelector('meta[name="viewport"]')?.getAttribute("content");
    return { docScroll: se.scrollHeight - window.innerHeight, overscrollBody: cs.overscrollBehaviorY, overscrollHtml: hs.overscrollBehaviorY, btnTouchAction: btn ? getComputedStyle(btn).touchAction : null, userSelect: btn ? getComputedStyle(btn).userSelect : null, meta };
  });
  step(`${tag} page does not scroll as a whole`, page.docScroll <= 1, `overflow ${page.docScroll}px`);
  const fit = await p.evaluate(() => ({ iw: window.innerWidth, sw: document.documentElement.scrollWidth, hdr: (() => { const h = document.querySelector("header"); return h ? h.scrollWidth - h.clientWidth : null; })() }));
  step(`${tag} till fits the screen width (no shrink, no sideways slide)`, fit.iw === w && fit.sw <= w, `layout ${fit.iw}px wide, content ${fit.sw}px, screen ${w}px; top bar overflow ${fit.hdr}px`);
  step(`${tag} pull-to-refresh and bounce contained`, page.overscrollHtml === "none" || page.overscrollBody === "none" || page.overscrollHtml === "contain", `html ${page.overscrollHtml} body ${page.overscrollBody}`);
  step(`${tag} buttons ignore double-tap zoom`, page.btnTouchAction === "manipulation", `touch-action ${page.btnTouchAction}`);
  step(`${tag} pinch zoom off on the till`, /user-scalable=(no|0)|maximum-scale=1(\.0)?\b/.test(page.meta || ""), page.meta || "");
  step(`${tag} long press does not select text`, page.userSelect === "none", `user-select ${page.userSelect}`);

  // Pick a category with many items (or the first) so the grid can scroll
  const cats = p.locator("aside button");
  const nCats = await cats.count();
  let best = 0, bestCount = 0;
  const closeDialogs = async (why) => {
    for (let i = 0; i < 3 && (await p.locator('[role="dialog"]').count()); i++) {
      const title = (await p.locator('[role="dialog"]').first().innerText().catch(() => "")).slice(0, 100).replace(/\n/g, " | ");
      if (why) step(`${tag} unexpected dialog after ${why}`, false, title);
      await p.keyboard.press("Escape"); await p.waitForTimeout(300);
      const close = p.locator('[role="dialog"]').getByRole("button", { name: /^(Close|Skip|Later|Not now|Cancel|OK)$/i });
      if (await close.count()) { await close.first().tap(); await p.waitForTimeout(300); }
    }
  };
  for (let i = 0; i < Math.min(nCats, 12); i++) {
    await closeDialogs(i ? `tapping category ${i - 1}` : "");
    const name = (await cats.nth(i).innerText()).trim();
    if (/Open item/.test(name)) continue;
    await cats.nth(i).tap(); await p.waitForTimeout(250);
    const c = await p.locator("div.grid.overflow-y-auto > button").count();
    if (c > bestCount) { bestCount = c; best = i; }
  }
  await cats.nth(best).tap(); await p.waitForTimeout(400);
  if (bestCount < 12) { // small menus: a one-letter search lists most products so the grid can scroll
    const search = p.getByPlaceholder(/Search items/);
    await search.tap(); await search.fill("a"); await p.waitForTimeout(500);
    await p.evaluate(() => document.activeElement?.blur());
  }
  await p.screenshot({ path: `${OUT}${tag}-grid.png` });
  const grid = await info("div.grid.overflow-y-auto");
  const before = await lines();
  if (grid && grid.h > grid.ch + 20) {
    await swipe(grid.x, grid.y + 80, -250); await p.waitForTimeout(700);
    const g2 = await info("div.grid.overflow-y-auto");
    step(`${tag} product grid scrolls by swipe`, g2.top > grid.top + 30, `scrollTop ${grid.top} -> ${g2.top} of ${grid.h - grid.ch}`);
  } else step(`${tag} product grid scrolls by swipe`, true, `not scrollable here (${bestCount} tiles fit)`);
  const after = await lines();
  step(`${tag} a swipe on the tiles adds nothing`, after === before, `${before} -> ${after} lines`);

  // Short drag on a tile (finger slips 18px): must not add an item
  const tile = p.locator("div.grid.overflow-y-auto > button").first();
  const tb = await tile.boundingBox();
  if (tb) {
    const x = tb.x + tb.width / 2, y = tb.y + tb.height / 2;
    const b2 = await lines();
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 6; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - i * 6 }] }); await p.waitForTimeout(16); }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await p.waitForTimeout(600);
    const sheetOpen = await p.locator('[role="dialog"]').count();
    if (sheetOpen) { await p.keyboard.press("Escape"); await p.waitForTimeout(300); }
    const a2 = await lines();
    step(`${tag} a 36px drag on a tile is not a tap`, a2 === b2 && !sheetOpen, `${b2} -> ${a2} lines, sheet ${sheetOpen}`);
  }

  // Category list scroll
  const aside = await info("aside");
  if (aside && aside.h > aside.ch + 20) {
    await swipe(aside.x, aside.y + 60, -200); await p.waitForTimeout(600);
    const a3 = await info("aside");
    step(`${tag} category list scrolls by swipe`, a3.top > aside.top + 20, `scrollTop ${aside.top} -> ${a3.top}`);
  }

  // Fill the order with taps (closing any size sheet), then swipe the order list
  const docTop0 = await p.evaluate(() => document.scrollingElement.scrollTop);
  for (let i = 0; i < 14; i++) {
    const tiles = p.locator("div.grid.overflow-y-auto > button");
    const c = await tiles.count(); if (!c) break;
    try {
      await tiles.nth(i % c).scrollIntoViewIfNeeded({ timeout: 3000 }); await tiles.nth(i % c).tap({ timeout: 5000 });
      // A product with sizes or options opens a sheet: wait for it, tap Add, and wait for it to close.
      const sheet = p.locator('[role="dialog"]');
      await sheet.first().waitFor({ state: "visible", timeout: 800 }).catch(() => {});
      if (await sheet.count()) {
        const add = sheet.getByRole("button", { name: /^(Add|Update)/ });
        await add.first().tap({ timeout: 5000 });
        await sheet.first().waitFor({ state: "detached", timeout: 3000 });
      }
      await p.waitForTimeout(150);
    } catch (e) {
      await p.screenshot({ path: `${OUT}${tag}-tap-fail-${i}.png` });
      const msg = String(e.message || e).split("\n").find((l) => /intercepts|not visible|outside|detached/.test(l)) || String(e.message).split("\n")[0];
      step(`${tag} tapping product ${i}`, false, msg.trim().slice(0, 200));
      await p.keyboard.press("Escape"); await p.waitForTimeout(300);
      break;
    }
  }
  await p.waitForTimeout(500);
  const docTop1 = await p.evaluate(() => document.scrollingElement.scrollTop);
  step(`${tag} adding items does not move the page`, docTop1 === docTop0, `document scrollTop ${docTop0} -> ${docTop1}`);
  const ul = await info("ul.flex-1.overflow-y-auto");
  await p.screenshot({ path: `${OUT}${tag}-order.png` });
  const visibleLines = await p.evaluate(() => { const l = document.querySelector("ul.flex-1.overflow-y-auto"); const li = l?.querySelector("li.border-b"); return l && li ? Math.floor(l.clientHeight / li.getBoundingClientRect().height * 10) / 10 : 0; });
  step(`${tag} order list shows at least two lines`, visibleLines >= 2, `${visibleLines} lines visible`);
  if (ul && ul.h > ul.ch + 20) {
    const n0 = await lines();
    // Start inside the list (on a short screen it may be only a couple of lines tall) and drag up by most of its height.
    await swipe(ul.x, ul.y + Math.min(60, ul.ch / 2 - 20), -Math.min(220, ul.ch - 30)); await p.waitForTimeout(700);
    const u2 = await info("ul.flex-1.overflow-y-auto");
    step(`${tag} order list scrolls by swipe`, u2.top > ul.top + 30, `scrollTop ${ul.top} -> ${u2.top}`);
    step(`${tag} swiping the order list changes no quantity`, (await lines()) === n0, "");
    const doc = await p.evaluate(() => document.scrollingElement.scrollTop);
    step(`${tag} the page did not move under the list`, doc === 0, `document scrollTop ${doc}`);
  } else step(`${tag} order list scrolls by swipe`, false, `order list not scrollable (${ul ? `${ul.h}/${ul.ch}` : "missing"})`);

  // Payment dialog fits or scrolls
  const pay = p.getByRole("button", { name: /^Pay/ });
  if (await pay.count()) {
    await pay.first().tap(); await p.waitForTimeout(1200);
    const dlg = await p.evaluate(() => { const d = document.querySelector('[role="dialog"]'); if (!d) return null; const r = d.getBoundingClientRect(); const body = d.querySelector(".overflow-y-auto"); return { top: r.top, bottom: r.bottom, vh: window.innerHeight, bodyH: body?.scrollHeight, bodyCh: body?.clientHeight }; });
    await p.screenshot({ path: `${OUT}${tag}-pay.png` });
    step(`${tag} payment dialog fits the screen`, !!dlg && dlg.top >= 0 && dlg.bottom <= dlg.vh + 1, dlg ? `top ${Math.round(dlg.top)} bottom ${Math.round(dlg.bottom)} of ${dlg.vh}, body ${dlg.bodyH}/${dlg.bodyCh}` : "no dialog");
    if (dlg && dlg.bodyH > dlg.bodyCh + 10) {
      const box = await p.evaluate(() => { const b = document.querySelector('[role="dialog"] .overflow-y-auto'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, top: b.scrollTop }; });
      await swipe(box.x, box.y, -200); await p.waitForTimeout(600);
      const t2 = await p.evaluate(() => document.querySelector('[role="dialog"] .overflow-y-auto').scrollTop);
      step(`${tag} payment dialog scrolls by swipe`, t2 > box.top + 20, `${box.top} -> ${t2}`);
    }
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
process.exit(0);
