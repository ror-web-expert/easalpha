import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The gateway runs on a free local port with an empty sessions folder, so no saved phone is resumed and nothing is sent.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "easalpha-wa-"));
let server;
let base;

before(async () => {
  Object.assign(process.env, { PORT: "0", SESSIONS_DIR: dir, WHATSAPP_GATEWAY_TOKEN: "test-token", LOG_LEVEL: "silent" });
  ({ server } = await import("./server.js"));
  if (!server.listening) await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const send = (body, token = "test-token") =>
  fetch(`${base}/sessions/biz1/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const pdf = (bytes) => ({ base64: Buffer.alloc(bytes, 1).toString("base64"), filename: "bill.pdf", mimetype: "application/pdf" });

test("a document just under 10 MB gets past the body limit to the send handler", async () => {
  const res = await send({ to: "923001234567", text: "Your bill", document: pdf(Math.floor(9.9 * 1024 * 1024)) });
  // No phone is linked here, so the handler answers; before the fix the body was refused first.
  assert.equal(res.status, 409);
  assert.match((await res.json()).last_error, /No phone is linked/);
});

test("a body over the limit is refused with the reason in last_error", async () => {
  const res = await send({ to: "923001234567", text: "Your bill", document: pdf(11 * 1024 * 1024) });
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { ok: false, last_error: "document must be at most 10 MB" });
});

test("broken JSON and a wrong token answer in last_error", async () => {
  const bad = await send("{not json");
  assert.equal(bad.status, 400);
  const body = await bad.json();
  assert.equal(body.ok, false);
  assert.ok(body.last_error);

  const denied = await send({ to: "923001234567", text: "Hi" }, "wrong");
  assert.equal(denied.status, 401);
  assert.deepEqual(await denied.json(), { ok: false, last_error: "The gateway token does not match WHATSAPP_GATEWAY_TOKEN" });
});

test("a bad session id is refused with a 400 and the gateway keeps running", async () => {
  for (const action of ["start", "logout", "send"]) {
    const res = await fetch(`${base}/sessions/bad.id/${action}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" }, body: "{}" });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { ok: false, last_error: "bad session id" });
  }
  const health = await fetch(`${base}/health`, { headers: { Authorization: "Bearer test-token" } });
  assert.equal(health.status, 200);
});
