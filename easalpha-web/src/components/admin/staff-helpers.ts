import type { Membership, StaffInvitation } from "@/lib/types";

/** POST /staff: a member (new or linked), or 202 { invited } when the phone or email is on a login that never proved it. */
export type AddResult = (Membership & { linked_existing_user?: boolean; invited?: false }) | { invited: true; invitation: StaffInvitation };

export interface Outcome { tone: "success" | "info"; title: string; body?: string }

/**
 * What the owner is told after adding someone. QA of 6 Nov 2026, P1: "Linked to an existing EasAlpha account" used to put a
 * stranger's account in the business; now a phone or email the login never proved waits as an invitation instead.
 */
export function addOutcome(r: AddResult, singular: string): Outcome {
  if (r.invited) {
    const to = r.invitation.phone ? `WhatsApp to ${r.invitation.phone}` : `an email to ${r.invitation.email}`;
    return {
      tone: "info",
      title: `Invitation sent to ${r.invitation.name}`,
      body: `That ${r.invitation.phone ? "number" : "email"} is on an EasAlpha login that has not confirmed it, so nothing is linked yet. We sent ${to}; they join once they confirm it with a code.`,
    };
  }
  if (r.linked_existing_user) return { tone: "info", title: "Linked to their EasAlpha login", body: "They confirmed this phone or email, and sign in with their own name and password; a password typed here was not used." };
  return { tone: "success", title: `${singular.charAt(0).toUpperCase()}${singular.slice(1)} added` };
}

/** Where an invitation went, for its row. */
export const invitationContact = (i: Pick<StaffInvitation, "phone" | "email">) => i.phone ?? i.email ?? "-";
