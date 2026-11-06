// What a manager's PIN approves (review of 6 Nov 2026, R6). A refusal the PIN can lift names its permissions in
// error.details (permissions, with labels); the PIN dialog shows them and the retry sends them back as approval_codes,
// so the server grants those and nothing else the manager holds. A refusal that names nothing (an older server) gets
// the PIN alone, as before.

export interface ApprovalAsk { codes: string[]; labels: Record<string, string> }

/** The permission codes and labels an API refusal, or a rejected sync record, names; empty lists when it names none. */
export function approvalAsk(e: unknown): ApprovalAsk {
  const d = (e as { details?: { permissions?: unknown; labels?: unknown } } | null | undefined)?.details;
  const codes = Array.isArray(d?.permissions) ? d.permissions.filter((c): c is string => typeof c === "string") : [];
  const raw = d?.labels && typeof d.labels === "object" ? (d.labels as Record<string, unknown>) : {};
  const labels = Object.fromEntries(Object.entries(raw).filter((kv): kv is [string, string] => typeof kv[1] === "string"));
  return { codes, labels };
}

/** a and b together, a's order first, each code once. */
export function mergeAsk(a: ApprovalAsk, b: ApprovalAsk): ApprovalAsk {
  return { codes: [...a.codes, ...b.codes.filter((c) => !a.codes.includes(c))], labels: { ...a.labels, ...b.labels } };
}

// The PIN a dialog is trying right now, with what it approves. While that retry runs, any request whose body carries
// the same PIN as approver_pin also carries approval_codes (attachApprovalCodes, called by api()), so a screen that
// only passes the PIN on still sends the codes. Requests without that PIN are left alone.
const grants = new Map<string, string[]>();

export async function withApprovalCodes<T>(pin: string, codes: string[], fn: () => Promise<T>): Promise<T> {
  if (!codes.length) return fn();
  grants.set(pin, codes);
  try {
    return await fn();
  } finally {
    if (grants.get(pin) === codes) grants.delete(pin);
  }
}

/** The request body with approval_codes added when its approver_pin is the PIN a dialog is approving; else the body as it is. */
export function attachApprovalCodes(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const b = body as Record<string, unknown>;
  if (typeof b.approver_pin !== "string" || !b.approver_pin || b.approval_codes !== undefined) return body;
  const codes = grants.get(b.approver_pin);
  return codes ? { ...b, approval_codes: codes } : body;
}
