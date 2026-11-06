"use client";
// Signed sync records (contract of the final round, 6 Nov 2026; the server side is the API's Sync::Signature). A PIN
// sign-in on the till, and every refresh of it, answers sync_key (base64url of 32 bytes) and sync_key_id. Each queued
// record keeps the key of the session that made it, and the push sends it as
//   { signed: JSON.stringify({ type, id, membership_id, payload }), signed_by: sync_key_id, sig: base64url(HMAC-SHA256(key, signed)) }
// The server reads the record from those exact bytes and takes one naming another member than the pushing cashier
// only with that member's signature: a cashier can no longer push a void or a refund as the manager.
import type { Session } from "@/lib/types";

export interface SyncKey { id: string; key: string }
export interface SignedRecord { signed: string; signed_by: string; sig: string }

/** The key of a session that has one. A session signed in before the signatures has none until its next refresh. */
export function sessionSyncKey(s: Pick<Session, "sync_key" | "sync_key_id"> | null | undefined): SyncKey | null {
  return s?.sync_key && s.sync_key_id ? { id: s.sync_key_id, key: s.sync_key } : null;
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** WebCrypto, which browsers give only to https pages (and localhost). */
export function subtleCrypto(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("This browser offers no WebCrypto here (it needs https)");
  return s;
}

const hmacKeys = new Map<string, Promise<CryptoKey>>();

function hmacKey(key: string): Promise<CryptoKey> {
  let k = hmacKeys.get(key);
  if (!k) {
    k = subtleCrypto().importKey("raw", fromBase64Url(key) as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    k.catch(() => hmacKeys.delete(key));
    hmacKeys.set(key, k);
  }
  return k;
}

/** The record as the push sends it, signed with `key`: the server checks sig over exactly the `signed` string. */
export async function signRecord(rec: { type: string; id: string; membership_id?: string; payload: Record<string, unknown> }, key: SyncKey): Promise<SignedRecord> {
  const signed = JSON.stringify({ type: rec.type, id: rec.id, membership_id: rec.membership_id, payload: rec.payload });
  const mac = await subtleCrypto().sign("HMAC", await hmacKey(key.key), new TextEncoder().encode(signed));
  return { signed, signed_by: key.id, sig: toBase64Url(new Uint8Array(mac)) };
}
