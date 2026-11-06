// Canteen kiosk logic that needs no browser: token labels, the fingerprint reader's keystrokes, the "already taken"
// rule applied locally, and the token slip. Tested in helpers.test.ts.
import type { MealClaim } from "@/lib/types";
import type { PrintLine } from "@/lib/print";

/** The kiosk numbers its own tokens, so a token exists before the server answers and when there is no connection:
 *  "Q1-001", "Q1-002"... per device per business day. */
export interface TokenState { date: string; seq: number }
export function nextTokenLabel(deviceCode: string, date: string, state: TokenState | undefined): { label: string; state: TokenState } {
  const seq = state && state.date === date ? state.seq + 1 : 1;
  return { label: `${(deviceCode || "K").toUpperCase()}-${String(seq).padStart(3, "0")}`, state: { date, seq } };
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

/** A worker's id typed or scanned: the workers list the kiosk holds, matched on the reader's id. */
export function workerByFingerprint<T extends { fingerprint_id: string | null }>(workers: T[], fingerprintId: string): T | undefined {
  const wanted = fingerprintId.trim().toLowerCase();
  return workers.find((w) => (w.fingerprint_id ?? "").trim().toLowerCase() === wanted);
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
export function refusedClaims(attention: AttentionLike[], local: MealClaim[], workers: { id: string; name: string; fingerprint_id: string | null }[]): RefusedClaim[] {
  const text = (v: unknown) => (typeof v === "string" && v ? v : null);
  return attention.filter((a) => a.type === "meal_claim").map((a) => {
    const c = local.find((l) => l.id === a.id);
    const p = a.payload ?? {};
    const employeeId = text(p.employee_id);
    const finger = text(p.fingerprint_id);
    const w = employeeId ? workers.find((x) => x.id === employeeId) : finger ? workerByFingerprint(workers, finger) : undefined;
    return { id: a.id, token: c?.token_label ?? text(p.token_label), worker: c?.employee_name ?? w?.name ?? null, dish: c?.dish ?? null, at: c?.scanned_at ?? text(p.client_created_at), reason: a.message, code: a.code };
  }).sort((x, y) => (y.at ?? "").localeCompare(x.at ?? ""));
}

/** Show the session windows in the kiosk's idle screen: "Lunch 12:00 to 15:00". */
export function sessionWindow(s: { name: string; starts_at: string; ends_at: string }): string {
  return `${s.name} ${s.starts_at} to ${s.ends_at}`;
}
