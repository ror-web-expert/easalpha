import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createPrintServer } from "./printServer";
import { initSettings, loadSettings, newToken } from "./settings";

// The LAN print server: anyone on the shop's Wi-Fi can reach it, so /printers and /print take the install's token.

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
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).token_required, true);
    assert.equal((await fetch(`${base}/printers`)).status, 401);
    assert.equal((await fetch(`${base}/printers`, { headers: { Authorization: "Bearer WRONG" } })).status, 401);
    assert.equal((await fetch(`${base}/printers`, { headers: { Authorization: "Bearer K7PQ2M9X" } })).status, 200);
    assert.equal((await fetch(`${base}/printers?token=K7PQ2M9X`)).status, 200);
    const drawer = await fetch(`${base}/print`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "receipt", lines: [{ drawer: true }] }) });
    assert.equal(drawer.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
