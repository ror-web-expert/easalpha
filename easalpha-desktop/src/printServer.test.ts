import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type http from "node:http";
import { allowedOrigins, createPrintServer, tokenMatches } from "./printServer";
import { initSettings, loadSettings, newToken, saveSettings } from "./settings";

// The LAN print server: anyone on the shop's Wi-Fi can reach it, so /printers and /print take the install's token,
// and a browser may call it only from the web app's own address (6 Nov 2026 review, R11).

async function serve(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
const close = (server: http.Server) => new Promise<void>((resolve) => server.close(() => resolve()));

test("every install gets an eight-character token once, kept across loads", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "easalpha-token-"));
  initSettings(dir);
  const first = loadSettings().printServerToken;
  assert.match(first ?? "", /^[A-HJ-NP-Z2-9]{8}$/);
  initSettings(dir);
  assert.equal(loadSettings().printServerToken, first);
  assert.notEqual(newToken(), newToken());
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the print server answers /health to anyone and /printers and /print only with the token", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "easalpha-ps-"));
  initSettings(dir);
  const server = createPrintServer("0.0.0-test", () => "K7PQ2M9X");
  const base = await serve(server);
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).token_required, true);
    assert.equal((await fetch(`${base}/printers`)).status, 401);
    assert.equal((await fetch(`${base}/printers`, { headers: { Authorization: "Bearer WRONG" } })).status, 401);
    assert.equal((await fetch(`${base}/printers`, { headers: { Authorization: "Bearer K7PQ2M9X" } })).status, 200);
    const drawer = await fetch(`${base}/print`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "receipt", lines: [{ drawer: true }] }) });
    assert.equal(drawer.status, 401);
  } finally {
    await close(server);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the header token wins over ?token=, which still works alone for this release and says it is deprecated", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "easalpha-ps-"));
  initSettings(dir);
  const server = createPrintServer("0.0.0-test", () => "K7PQ2M9X");
  const base = await serve(server);
  try {
    const viaQuery = await fetch(`${base}/printers?token=K7PQ2M9X`);
    assert.equal(viaQuery.status, 200);
    assert.equal(viaQuery.headers.get("deprecation"), "true");
    // A wrong header is not rescued by a right query token: the header is the one read.
    assert.equal((await fetch(`${base}/printers?token=K7PQ2M9X`, { headers: { Authorization: "Bearer WRONG" } })).status, 401);
    const viaHeader = await fetch(`${base}/printers?token=WRONG`, { headers: { Authorization: "Bearer K7PQ2M9X" } });
    assert.equal(viaHeader.status, 200);
    assert.equal(viaHeader.headers.get("deprecation"), null);
  } finally {
    await close(server);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("tokens are compared in constant time on equal-length digests, whatever the lengths given", () => {
  assert.equal(tokenMatches("K7PQ2M9X", "K7PQ2M9X"), true);
  assert.equal(tokenMatches("K7PQ2M9Y", "K7PQ2M9X"), false);
  assert.equal(tokenMatches("K7PQ", "K7PQ2M9X"), false); // shorter: no throw from timingSafeEqual
  assert.equal(tokenMatches("", "K7PQ2M9X"), false);
  assert.equal(tokenMatches("K7PQ2M9X-and-more", "K7PQ2M9X"), false);
});

test("CORS answers the web app's own address and easalpha.com only; any other page gets 403 and no CORS headers", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "easalpha-ps-"));
  initSettings(dir);
  saveSettings({ webUrl: "http://192.168.1.5:3000/" });
  const server = createPrintServer("0.0.0-test", () => "K7PQ2M9X");
  const base = await serve(server);
  const auth = { Authorization: "Bearer K7PQ2M9X" };
  try {
    for (const origin of ["http://192.168.1.5:3000", "https://easalpha.com"]) {
      const pre = await fetch(`${base}/print`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" } });
      assert.equal(pre.status, 204, origin);
      assert.equal(pre.headers.get("access-control-allow-origin"), origin);
      assert.match(pre.headers.get("access-control-allow-headers") ?? "", /Authorization/);
      assert.equal(pre.headers.get("vary"), "Origin");
      const res = await fetch(`${base}/printers`, { headers: { Origin: origin, ...auth } });
      assert.equal(res.status, 200, origin);
      assert.equal(res.headers.get("access-control-allow-origin"), origin);
    }
    for (const origin of ["https://evil.example", "http://192.168.1.5:3001", "null"]) {
      const pre = await fetch(`${base}/print`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST" } });
      assert.equal(pre.status, 403, origin);
      assert.equal(pre.headers.get("access-control-allow-origin"), null, origin);
      // A "simple" POST skips the preflight in a browser; it is refused before the token or the printer are looked at.
      const drawer = await fetch(`${base}/print`, { method: "POST", headers: { Origin: origin, "Content-Type": "text/plain", ...auth }, body: JSON.stringify({ role: "receipt", lines: [{ drawer: true }] }) });
      assert.equal(drawer.status, 403, origin);
      assert.equal(drawer.headers.get("access-control-allow-origin"), null, origin);
      assert.equal((await fetch(`${base}/health`, { headers: { Origin: origin } })).status, 403, origin);
    }
    // No Origin at all is not a web page (curl, a script on the till): the token alone decides, as before.
    assert.equal((await fetch(`${base}/printers`, { headers: auth })).status, 200);
  } finally {
    await close(server);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("printServerOrigins in settings.json replaces the default list; webUrl is always allowed", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "easalpha-ps-"));
  initSettings(dir);
  assert.deepEqual(allowedOrigins(loadSettings()), ["https://easalpha.com"]);
  fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ ...loadSettings(), webUrl: "https://pos.example.pk", printServerOrigins: ["https://tabs.example.pk/pos", "not a url", "ftp://x.example"] }));
  assert.deepEqual(loadSettings().printServerOrigins, ["https://tabs.example.pk"]);
  assert.deepEqual(allowedOrigins(loadSettings()), ["https://pos.example.pk", "https://tabs.example.pk"]);
  saveSettings({ printServerPort: 9978 }); // saving from the Printers window keeps the hand-made list
  assert.deepEqual(loadSettings().printServerOrigins, ["https://tabs.example.pk"]);
  saveSettings({ printServerOrigins: [] });
  assert.deepEqual(allowedOrigins(loadSettings()), ["https://pos.example.pk"]);
  const server = createPrintServer("0.0.0-test", () => "");
  const base = await serve(server);
  try {
    assert.equal((await fetch(`${base}/health`, { headers: { Origin: "https://easalpha.com" } })).status, 403);
    assert.equal((await fetch(`${base}/health`, { headers: { Origin: "https://pos.example.pk" } })).status, 200);
  } finally {
    await close(server);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
