import { createHmac, randomBytes, webcrypto } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { fromBase64Url, sessionSyncKey, signRecord, toBase64Url } from "./sync-sign";

// jsdom may come without SubtleCrypto: Node's WebCrypto stands in, as the till's browser would.
if (!globalThis.crypto?.subtle) vi.stubGlobal("crypto", webcrypto);

// The contract for signed sync records (final round, 6 Nov 2026): what the till sends must verify on the server, which
// computes HMAC-SHA256 over the exact `signed` bytes with the 32 bytes of sync_key (Sync::Signature.matches?).
const key = { id: "0b1f2c4e-5d6a-4b7c-8d9e-0f1a2b3c4d5e", key: toBase64Url(new Uint8Array(randomBytes(32))) };

describe("signRecord", () => {
  it("signs the exact JSON it sends as signed, with the session's 32-byte key, in base64url", async () => {
    const rec = { type: "void", id: "v-1", membership_id: "m-7", payload: { order_id: "o-1", reason: "Wrong table, café", client_created_at: "2026-11-06T10:00:00.000Z" } };
    const out = await signRecord(rec, key);
    expect(out.signed).toBe(JSON.stringify({ type: "void", id: "v-1", membership_id: "m-7", payload: rec.payload }));
    expect(out.signed_by).toBe(key.id);
    const expected = createHmac("sha256", Buffer.from(fromBase64Url(key.key))).update(Buffer.from(out.signed, "utf8")).digest("base64url");
    expect(out.sig).toBe(expected);
    expect(out.sig).toMatch(/^[A-Za-z0-9_-]{43}$/); // no padding, no + or /
  });

  it("leaves membership_id out of the bytes when the record names nobody, as JSON.stringify does", async () => {
    const out = await signRecord({ type: "meal_claim", id: "c-1", payload: { token_label: "Q1-007" } }, key);
    expect(JSON.parse(out.signed)).toEqual({ type: "meal_claim", id: "c-1", payload: { token_label: "Q1-007" } });
  });

  it("gives another signature for other bytes or another key", async () => {
    const rec = { type: "refund", id: "r-1", membership_id: "m-7", payload: { amount_minor: 9_280 } };
    const a = await signRecord(rec, key);
    expect((await signRecord({ ...rec, payload: { amount_minor: 9_281 } }, key)).sig).not.toBe(a.sig);
    expect((await signRecord(rec, { ...key, key: toBase64Url(new Uint8Array(randomBytes(32))) })).sig).not.toBe(a.sig);
  });
});

describe("base64url and the session's key", () => {
  it("round-trips the server's unpadded base64url", () => {
    const bytes = new Uint8Array(randomBytes(32));
    expect(Array.from(fromBase64Url(toBase64Url(bytes)))).toEqual(Array.from(bytes));
    expect(Array.from(fromBase64Url(Buffer.from(bytes).toString("base64url")))).toEqual(Array.from(bytes));
  });

  it("takes the key only from a session that has both fields", () => {
    expect(sessionSyncKey({ sync_key: "k", sync_key_id: "id" })).toEqual({ id: "id", key: "k" });
    expect(sessionSyncKey({ sync_key: "k" })).toBeNull();
    expect(sessionSyncKey(null)).toBeNull();
  });
});
