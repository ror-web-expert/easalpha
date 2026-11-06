"use client";
// K5 (QA of 6 Nov 2026): the till could not be unlocked while offline, so the counter stopped in exactly the outage
// offline mode is for. Each member who signs in online on this till leaves an encrypted copy of their session here
// (tokens and sync key): AES-GCM under a key from their PIN (PBKDF2-SHA256, 150,000 rounds, a random salt per copy),
// written at every online sign-in and rewritten at every refresh. Offline, the PIN page resumes the session whose copy
// the PIN opens; online it signs in with the server as before. Five wrong PINs offline, then a minute's wait.
// While the member works, the key from their PIN waits in memory and in this tab's sessionStorage, so a refresh after
// a reload still rewrites their copy; the lock takes it away. It adds nothing while they are signed in (the session
// itself is in localStorage then); once the till is locked, only the PIN opens the copy.
// A four-digit PIN is ten thousand guesses for someone who copies the browser's storage: the rounds slow that, the
// wait stops it at the till, and the server still judges every record that session signs by when it ended.
import type { Session } from "@/lib/types";
import { subtleCrypto, toBase64Url, fromBase64Url } from "@/lib/sync-sign";

export const STASH_STORAGE_KEY = "easalpha.session-stash";
const TRIES_STORAGE_KEY = "easalpha.pin-offline-tries";
const KEY_STORAGE_KEY = "easalpha.stash-key";
export const PBKDF2_ROUNDS = 150_000;
export const OFFLINE_TRIES = 5;
export const OFFLINE_WAIT_MS = 60_000;

interface StashEntry { membership_id: string; device_id: string; salt: string; iv: string; data: string; rounds: number; saved_at: string }
type StashFile = Record<string, StashEntry>;

interface Derived { key: CryptoKey; salt: string; rounds: number; device_id: string }
// The key of the member signed in now, so a refresh (no PIN typed) can rewrite their copy. Gone at the lock.
const derived = new Map<string, Derived>();

function readFile(): StashFile {
  try {
    const f = JSON.parse(localStorage.getItem(STASH_STORAGE_KEY) ?? "{}") as unknown;
    return f && typeof f === "object" && !Array.isArray(f) ? (f as StashFile) : {};
  } catch {
    return {};
  }
}

function writeFile(f: StashFile) {
  try {
    if (Object.keys(f).length) localStorage.setItem(STASH_STORAGE_KEY, JSON.stringify(f));
    else localStorage.removeItem(STASH_STORAGE_KEY);
  } catch {}
}

const text = new TextEncoder();
const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));
// A copy opens only for its till and member (AES-GCM additional data): moved under another member's name it fails.
const boundTo = (deviceId: string, membershipId: string) => text.encode(`${deviceId}:${membershipId}`) as BufferSource;

async function deriveKey(pin: string, salt: Uint8Array, rounds: number): Promise<CryptoKey> {
  const subtle = subtleCrypto();
  const base = await subtle.importKey("raw", text.encode(pin) as BufferSource, "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: rounds }, base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

async function remember(membershipId: string, k: Derived) {
  derived.clear();
  derived.set(membershipId, k);
  try {
    const raw = new Uint8Array(await subtleCrypto().exportKey("raw", k.key));
    sessionStorage.setItem(KEY_STORAGE_KEY, JSON.stringify({ membership_id: membershipId, device_id: k.device_id, salt: k.salt, rounds: k.rounds, key: toBase64Url(raw) }));
  } catch {}
}

/** The signed-in member's key: in memory, or after a reload in this tab's sessionStorage. */
async function recall(membershipId: string): Promise<Derived | undefined> {
  const known = derived.get(membershipId);
  if (known) return known;
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY_STORAGE_KEY) ?? "null") as { membership_id: string; device_id: string; salt: string; rounds: number; key: string } | null;
    if (saved?.membership_id !== membershipId) return undefined;
    const key = await subtleCrypto().importKey("raw", fromBase64Url(saved.key) as BufferSource, "AES-GCM", true, ["encrypt", "decrypt"]);
    const k = { key, salt: saved.salt, rounds: saved.rounds, device_id: saved.device_id };
    derived.set(membershipId, k);
    return k;
  } catch {
    return undefined;
  }
}

function rememberedMember(): string | null {
  try { return (JSON.parse(sessionStorage.getItem(KEY_STORAGE_KEY) ?? "null") as { membership_id?: string } | null)?.membership_id ?? null; } catch { return null; }
}

/** The till locks: no copy can be rewritten or opened again without a PIN. */
export function forgetSessionKeys() {
  derived.clear();
  try { sessionStorage.removeItem(KEY_STORAGE_KEY); } catch {}
}

async function seal(session: Session, k: { key: CryptoKey; salt: string; rounds: number }, deviceId: string): Promise<StashEntry> {
  const iv = randomBytes(12);
  const data = await subtleCrypto().encrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: boundTo(deviceId, session.membership.id) }, k.key, text.encode(JSON.stringify(session)) as BufferSource);
  return { membership_id: session.membership.id, device_id: deviceId, salt: k.salt, iv: toBase64Url(iv), data: toBase64Url(new Uint8Array(data)), rounds: k.rounds, saved_at: new Date().toISOString() };
}

/** The session in the copy, or null when the key does not open it (a wrong PIN) or it is not the member it says. */
async function unseal(entry: StashEntry, key: CryptoKey): Promise<Session | null> {
  try {
    const plain = await subtleCrypto().decrypt({ name: "AES-GCM", iv: fromBase64Url(entry.iv) as BufferSource, additionalData: boundTo(entry.device_id, entry.membership_id) }, key, fromBase64Url(entry.data) as BufferSource);
    const s = JSON.parse(new TextDecoder().decode(plain)) as Session;
    return s?.membership?.id === entry.membership_id ? s : null;
  } catch {
    return null;
  }
}

/** After an online PIN sign-in: this member's copy, under a key from their PIN with a new salt. */
export async function stashSession(pin: string, session: Session, deviceId: string): Promise<void> {
  const salt = randomBytes(16);
  const k = { key: await deriveKey(pin, salt, PBKDF2_ROUNDS), salt: toBase64Url(salt), rounds: PBKDF2_ROUNDS };
  const entry = await seal(session, k, deviceId);
  await remember(session.membership.id, { ...k, device_id: deviceId });
  writeFile({ ...readFile(), [entry.membership_id]: entry });
}

/** After a refresh: the copy takes the new tokens, under the key from the member's PIN at sign-in or unlock. False
 *  when there is none (the till was locked since, or another tab signed in): the copy keeps the older tokens. */
export async function restashSession(session: Session, deviceId: string | null | undefined): Promise<boolean> {
  const k = session?.membership?.id ? await recall(session.membership.id) : undefined;
  if (!k || !deviceId || k.device_id !== deviceId || !readFile()[session.membership.id]) return false;
  const entry = await seal(session, k, deviceId);
  writeFile({ ...readFile(), [entry.membership_id]: entry });
  return true;
}

/** Offline: the session of the copy this PIN opens on this till, the latest first, or null. */
export async function unlockStash(pin: string, deviceId: string): Promise<Session | null> {
  const entries = Object.values(readFile()).filter((e) => e.device_id === deviceId).sort((a, b) => (a.saved_at < b.saved_at ? 1 : -1));
  for (const e of entries) {
    const salt = fromBase64Url(e.salt);
    const key = await deriveKey(pin, salt, e.rounds || PBKDF2_ROUNDS);
    const s = await unseal(e, key);
    if (s) {
      await remember(e.membership_id, { key, salt: e.salt, rounds: e.rounds || PBKDF2_ROUNDS, device_id: deviceId });
      return s;
    }
  }
  return null;
}

/** The server refused this PIN (wrong now, or no longer allowed here): whatever copy it still opens goes. */
export async function forgetStashesOpenedBy(pin: string, deviceId: string): Promise<void> {
  for (const e of Object.values(readFile()).filter((x) => x.device_id === deviceId)) {
    if (await unseal(e, await deriveKey(pin, fromBase64Url(e.salt), e.rounds || PBKDF2_ROUNDS))) forgetStashes([e.membership_id]);
  }
}

/** The server says these members' sessions are over (a refused refresh, a deactivation): their copies go. */
export function forgetStashes(membershipIds: (string | null | undefined)[]) {
  const f = readFile();
  let changed = false;
  for (const id of membershipIds) {
    if (!id) continue;
    if (derived.has(id) || rememberedMember() === id) forgetSessionKeys();
    if (f[id]) { delete f[id]; changed = true; }
  }
  if (changed) writeFile(f);
}

/** Unpair and a cleared till: no copy, no derived key, no count of wrong PINs is left behind. */
export function clearStashes() {
  forgetSessionKeys();
  try {
    localStorage.removeItem(STASH_STORAGE_KEY);
    localStorage.removeItem(TRIES_STORAGE_KEY);
  } catch {}
}

/** Members with a copy on this till (what the PIN page can unlock offline). */
export function stashedMembers(deviceId: string | null | undefined): string[] {
  return Object.values(readFile()).filter((e) => e.device_id === deviceId).map((e) => e.membership_id);
}

// ---- Wrong PINs offline ----
interface Tries { count: number; until: number }

function readTries(): Tries {
  try {
    const t = JSON.parse(localStorage.getItem(TRIES_STORAGE_KEY) ?? "{}") as Partial<Tries>;
    return { count: Number(t.count) || 0, until: Number(t.until) || 0 };
  } catch {
    return { count: 0, until: 0 };
  }
}

function writeTries(t: Tries) {
  try { localStorage.setItem(TRIES_STORAGE_KEY, JSON.stringify(t)); } catch {}
}

/** How long the till still refuses offline PINs after five wrong ones (0 when it does not). Kept across reloads. */
export function offlineWaitMs(now = Date.now()): number {
  const t = readTries();
  return t.until > now ? t.until - now : 0;
}

/** Counts a wrong PIN offline. Returns the tries left before the wait, 0 when the wait starts now. */
export function noteWrongOfflinePin(now = Date.now()): number {
  let t = readTries();
  if (t.until > now) return 0; // still waiting: a try now neither counts nor shortens the wait
  if (t.until) t = { count: 0, until: 0 };
  const count = t.count + 1;
  if (count >= OFFLINE_TRIES) {
    writeTries({ count: 0, until: now + OFFLINE_WAIT_MS });
    return 0;
  }
  writeTries({ count, until: 0 });
  return OFFLINE_TRIES - count;
}

export function resetOfflineTries() {
  try { localStorage.removeItem(TRIES_STORAGE_KEY); } catch {}
}
