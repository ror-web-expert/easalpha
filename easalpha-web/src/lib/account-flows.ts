import { ApiError } from "@/lib/api";

// QA of 6 Nov 2026, P1: a phone or email proves only itself, not the login it happens to sit on (a stranger may have
// typed someone's number on a login of their own). These map the API's answers on the phone-code login and on a staff
// invitation to what the page asks for next.

/** What the phone-code login does after POST /auth/otp/verify refused. */
export type OtpNext =
  | { kind: "password"; invitations: string[] } // the number is on a login that never confirmed it: its password, or join anew
  | { kind: "joined"; message: string } // an invitation made them a member, but that role does not open the admin
  | { kind: "error"; message: string };

export function otpNext(e: unknown): OtpNext {
  if (!(e instanceof ApiError)) return { kind: "error", message: e instanceof Error ? e.message : "Something went wrong" };
  const details = (e.details ?? {}) as { invitations?: string[]; joined?: unknown[] };
  if (e.code === "phone.password_required") return { kind: "password", invitations: details.invitations ?? [] };
  if (e.code === "app.denied" && Array.isArray(details.joined) && details.joined.length) return { kind: "joined", message: e.message };
  return { kind: "error", message: e.message };
}

/** What the invitation page does after POST /invitations/:token/accept refused. */
export type InviteNext =
  | { kind: "choose" } // on a login that never confirmed it: that login's password, or a new login
  | { kind: "closed"; message: string }
  | { kind: "error"; message: string };

export function inviteNext(e: unknown): InviteNext {
  if (!(e instanceof ApiError)) return { kind: "error", message: e instanceof Error ? e.message : "Something went wrong" };
  if (e.code === "invitation.sign_in") return { kind: "choose" };
  if (e.code === "invitation.closed" || e.code === "invitation.not_found") return { kind: "closed", message: e.message };
  return { kind: "error", message: e.message };
}
