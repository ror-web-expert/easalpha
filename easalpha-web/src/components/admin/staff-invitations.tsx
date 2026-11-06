"use client";
// People added by a phone or email that is on an EasAlpha login which never confirmed it: nothing is linked until they
// confirm it with the code we send (QA of 6 Nov 2026, P1). The staff lists and the Riders page show them the same way,
// with Copy link, Resend and Cancel (L2, 7 Nov 2026: a rider added that way showed on no page at all).
import { Copy, Send, X } from "lucide-react";
import { api } from "@/lib/api";
import type { StaffInvitation } from "@/lib/types";
import { formatDate } from "@/lib/dates";
import { useAction } from "@/components/admin/crud";
import { toast } from "@/store/toast";
import { invitationContact } from "./staff-helpers";
import { Badge, Button, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

// A rider row shows "invited" from the same list, so both refresh when one is resent or cancelled.
const KEYS = ["staff_invitations", "riders"];

export function WaitingInvitations({ invitations, description }: { invitations: StaffInvitation[]; description: string }) {
  const resendM = useAction<string>(KEYS, (id) => api(`/staff/invitations/${id}/resend`, { method: "POST" }), "Invitation sent again");
  const cancelM = useAction<string>(KEYS, (id) => api(`/staff/invitations/${id}`, { method: "DELETE" }), "Invitation cancelled");
  const copyLink = async (i: StaffInvitation) => {
    try { await navigator.clipboard.writeText(i.url); toast.success("Link copied", "It opens nothing without the code we send to their phone or email."); }
    catch { toast.info("Copy this link", i.url); }
  };
  if (!invitations.length) return null;
  return (
    <section className="mt-6" aria-label="Waiting to join">
      <h2 className="mb-1 text-base font-medium">Waiting to join</h2>
      <p className="mb-3 text-sm text-fg-secondary">{description}</p>
      <Table>
        <THead><tr><TH>Name</TH><TH>Phone or email</TH><TH>Role</TH><TH>PIN</TH><TH>Open until</TH><TH right>Actions</TH></tr></THead>
        <TBody>
          {invitations.map((i) => (
            <TR key={i.id}>
              <TD className="font-medium">{i.name}</TD>
              <TD className="text-fg-secondary">{invitationContact(i)}</TD>
              <TD>{i.role.name}</TD>
              <TD>{i.has_pin ? <Badge variant="success">set</Badge> : <Badge variant="warning">no PIN</Badge>}</TD>
              <TD className="text-fg-secondary">{formatDate(i.expires_at)}</TD>
              <TD right>
                <Button variant="ghost" size="sm" onClick={() => copyLink(i)}><Copy className="h-4 w-4" /> Copy link</Button>
                <Button variant="ghost" size="sm" loading={resendM.isPending} onClick={() => resendM.mutate(i.id)}><Send className="h-4 w-4" /> Resend</Button>
                <Button variant="ghost" size="icon-sm" title="Cancel invitation" aria-label={`Cancel the invitation for ${i.name}`} onClick={() => cancelM.mutate(i.id)}><X className="h-4 w-4 text-danger" /></Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </section>
  );
}
