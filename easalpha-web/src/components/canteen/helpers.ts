// Canteen kiosk logic that needs no browser: token labels, the fingerprint reader's keystrokes, the "already taken"
// rule applied locally, the session and its day from the clock, and the token slip. Tested in helpers.test.ts.
import type { MealClaim, MealPlanItem, MealSession } from "@/lib/types";
import type { PrintLine } from "@/lib/print";
import { fingerprintHash } from "./fingerprint";

/** What the API's canteen controller asks of a signed-in user (review R5): the kiosk screens' calls (today, meals,
 *  workers) take canteen.serve, canteen.manage or orders.create; everything else canteen.manage. */
export const CANTEEN_KIOSK_PERMS = ["canteen.serve", "canteen.manage", "orders.create"];
export const CANTEEN_MANAGE_PERMS = ["canteen.manage"];
/** The canteen settings page: a canteen manager reads it (GET /settings), saving needs settings.manage. */
export const CANTEEN_SETTINGS_PERMS = ["settings.manage", "canteen.manage"];

/** The kiosk numbers its own tokens, so a token exists before the server answers and when there is no connection:
 *  "Q1-001", "Q1-002"... per device per meal day. `used` is the labels already given that day (the server's list and
 *  this kiosk's own): the count carries on past them, so a kiosk paired again, which lost its count, does not hand out
 *  Q1-001 a second time (F13). */
export interface TokenState { date: string; seq: number }
export function nextTokenLabel(deviceCode: string, date: string, state: TokenState | undefined, used: string[] = []): { label: string; state: TokenState } {
  const prefix = `${(deviceCode || "K").toUpperCase()}-`;
  const given = used.reduce((max, l) => {
    const n = l.toUpperCase().startsWith(prefix) ? Number(l.slice(prefix.length)) : NaN;
    return Number.isInteger(n) && n > max ? n : max;
  }, 0);
  const seq = Math.max(state && state.date === date ? state.seq : 0, given) + 1;
  return { label: `${prefix}${String(seq).padStart(3, "0")}`, state: { date, seq } };
}

/** Fingerprint and card readers that act as a keyboard type the id and press Enter. Letters, digits and a few
 *  separators are kept; anything shorter than three characters is noise. */
export function parseWedge(buffer: string): string | null {
  const id = buffer.replace(/[^A-Za-z0-9:_\-./]/g, "").trim();
  return id.length >= 3 ? id : null;
}

type ClaimLike = Pick<MealClaim, "employee_id" | "meal_session_id" | "status"> & { plan_date?: string };

/** The claim that stops a second helping: same worker, same session, same day, not cancelled. */
export function alreadyTaken<T extends ClaimLike>(claims: T[], employeeId: string, sessionId: string, date?: string): T | undefined {
  return claims.find((c) => c.employee_id === employeeId && c.meal_session_id === sessionId && c.status !== "cancelled" && (!date || !c.plan_date || c.plan_date === date));
}

/** A worker's id typed or scanned, matched in the kiosk's list. The list carries the reader id hashed with the
 *  business's salt (fingerprint_hash); a list stored before the hash came (or the admin's) carries it plain. */
export function workerByFingerprint<T extends { fingerprint_id?: string | null; fingerprint_hash?: string | null }>(workers: T[], fingerprintId: string, salt?: string | null): T | undefined {
  const wanted = fingerprintId.trim().toLowerCase();
  if (!wanted) return undefined;
  const hash = salt ? fingerprintHash(salt, wanted) : null;
  return workers.find((w) => (hash !== null && w.fingerprint_hash === hash) || (!!w.fingerprint_id && w.fingerprint_id.trim().toLowerCase() === wanted));
}

/** What the worker is charged for a dish: the plan's worker price, else the dish as a kiosk order prices it (tax
 *  included). price_minor is the menu price before tax, shown only by a server older than worker_pays_minor. */
export function dishPrice(i: Pick<MealPlanItem, "price_minor" | "worker_price_minor"> & { worker_pays_minor?: number | null }): number {
  return i.worker_pays_minor ?? i.worker_price_minor ?? i.price_minor;
}

const mod = (n: number, m: number) => ((n % m) + m) % m;
const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const clocks = new Map<string, Intl.DateTimeFormat>();
/** The branch's wall clock at `at`: its date and minutes since midnight in the branch's time zone, whatever zone the
 *  kiosk machine is set to (the device's own zone when the branch's is unknown). */
export function wallClock(at: Date, timeZone?: string | null): { date: string; minutes: number; hhmm: string } {
  const key = timeZone ?? "";
  let f = clocks.get(key);
  if (!f) {
    const opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
    try { f = new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: timeZone || undefined }); } catch { f = new Intl.DateTimeFormat("en-GB", opts); }
    clocks.set(key, f);
  }
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const minutes = (Number(p.hour) % 24) * 60 + Number(p.minute);
  return { date: `${p.year}-${p.month}-${p.day}`, minutes, hhmm: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${p.minute}` };
}

type SessionLike = Pick<MealSession, "id" | "starts_at" | "ends_at" | "sort_order"> & { active?: boolean };

/** Minutes since the session's window last opened, and whether the window holds the moment (MealSession#covers?:
 *  a window past midnight wraps). */
function sinceOpen(s: SessionLike, minutes: number): { since: number; open: boolean } {
  const start = toMinutes(s.starts_at);
  const since = mod(minutes - start, 1440);
  return { since, open: since < mod(toMinutes(s.ends_at) - start, 1440) };
}

/** The session being served at `at` by the branch's clock, as Canteen::Sessions.current picks it: the first in kiosk
 *  order whose window holds the moment. The kiosk picks it from its clock offline as online, so a kiosk that lost the
 *  connection at Tea still serves Supper when Supper comes (6 Nov 2026 review, F7). */
export function sessionAt<T extends SessionLike>(sessions: T[], at: Date, timeZone?: string | null): T | null {
  const { minutes } = wallClock(at, timeZone);
  const order = [...sessions].filter((s) => s.active !== false).sort((a, b) => a.sort_order - b.sort_order || a.starts_at.localeCompare(b.starts_at));
  return order.find((s) => sinceOpen(s, minutes).open) ?? null;
}

/** The business day of a moment: before the day end (02:01 by default) it is still the previous date (Branch). */
export function businessDay(at: Date, timeZone?: string | null, dayEnd = "02:01"): string {
  const { date, minutes } = wallClock(at, timeZone);
  return minutes < toMinutes(dayEnd) ? addDays(date, -1) : date;
}

/** The day a meal taken at `at` in this session belongs to: the business day of the moment its window opened, as
 *  Canteen::Sessions.day_for has it. A night session 23:00 to 06:00 is one meal on the day it opened, though the
 *  business day turns at 02:01 in the middle of it (F6). */
export function sessionDay(s: SessionLike, at: Date, timeZone?: string | null, dayEnd = "02:01"): string {
  const { date, minutes } = wallClock(at, timeZone);
  const { since } = sinceOpen(s, minutes);
  const opened = minutes - since < 0 ? addDays(date, -1) : date;
  return toMinutes(s.starts_at) < toMinutes(dayEnd) ? addDays(opened, -1) : opened;
}

/** The slip the worker carries to the counter: the token large, then who, what and when. */
export function tokenLines(c: { token_label: string; employee_name: string | null; dish: string | null; session: string | null; scanned_at: string }, business: string, offline = false): PrintLine[] {
  const time = new Date(c.scanned_at);
  const hhmm = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
  return [
    { text: business, align: "center", bold: true },
    { text: c.session ? `${c.session} token` : "Meal token", align: "center" },
    { feed: 1 },
    { text: c.token_label, align: "center", bold: true, size: 2 },
    { feed: 1 },
    { text: c.employee_name ?? "", align: "center", bold: true },
    { text: c.dish ?? "", align: "center" },
    { text: hhmm, align: "center" },
    ...(offline ? [{ text: "recorded offline", align: "center" } as PrintLine] : []),
    { feed: 2 },
    { cut: true },
  ];
}

/** A meal this kiosk took offline that the server refused at replay (lib/sync moves it to the attention list): the
 *  worker has the food and the token, but nothing is on their account, so the supervisor needs to see it. */
export interface RefusedClaim { id: string; token: string | null; worker: string | null; dish: string | null; at: string | null; reason: string; code: string }
type AttentionLike = { id: string; type: string; code: string; message: string; payload: Record<string, unknown> };

/** The refused meal claims among the attention rows, newest first, named from the kiosk's own copy of the claim or,
 *  once that copy is gone (another day), from its worker list. */
export function refusedClaims(attention: AttentionLike[], local: MealClaim[], workers: { id: string; name: string; fingerprint_id?: string | null; fingerprint_hash?: string | null }[], salt?: string | null): RefusedClaim[] {
  const text = (v: unknown) => (typeof v === "string" && v ? v : null);
  return attention.filter((a) => a.type === "meal_claim").map((a) => {
    const c = local.find((l) => l.id === a.id);
    const p = a.payload ?? {};
    const employeeId = text(p.employee_id);
    const finger = text(p.fingerprint_id);
    const w = employeeId ? workers.find((x) => x.id === employeeId) : finger ? workerByFingerprint(workers, finger, salt) : undefined;
    return { id: a.id, token: c?.token_label ?? text(p.token_label), worker: c?.employee_name ?? w?.name ?? null, dish: c?.dish ?? null, at: c?.scanned_at ?? text(p.client_created_at), reason: a.message, code: a.code };
  }).sort((x, y) => (y.at ?? "").localeCompare(x.at ?? ""));
}

/** Show the session windows in the kiosk's idle screen: "Lunch 12:00 to 15:00". */
export function sessionWindow(s: { name: string; starts_at: string; ends_at: string }): string {
  return `${s.name} ${s.starts_at} to ${s.ends_at}`;
}
