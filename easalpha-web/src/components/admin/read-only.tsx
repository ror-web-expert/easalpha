"use client";
// A settings or staff page this session may look at but not change (QA of 6 Nov 2026, P6: a manager without
// settings.manage got editable Store, Point of Sale, Notifications, QR and Loyalty forms whose Save failed, and
// accountants got Admin Staff and Roles with role menus, PIN and Deactivate). The page shows, every control disabled.
import { Eye } from "lucide-react";
import { useCan } from "@/store/auth";

const LABEL: Record<string, string> = { "settings.manage": "Settings, Manage", "staff.manage": "Staff, Manage", MARKETING: "Marketing" };

/** Whether this session may save what the page edits: one of `perms` (settings.manage by default, as PATCH /settings). */
export function useCanEdit(perms: string[] = ["settings.manage"]): boolean {
  return useCan()(...perms);
}

export function ReadOnlyNotice({ perms = ["settings.manage"] }: { perms?: string[] }) {
  const needs = perms.map((p) => LABEL[p] ?? p).join(" or ");
  return (
    <p role="note" data-read-only className="mb-4 flex items-start gap-2 rounded-xl bg-muted px-4 py-3 text-sm text-fg-secondary">
      <Eye className="mt-0.5 h-4 w-4 shrink-0" />
      <span>You can look at this page. Changing it needs {needs}; ask the owner to add it to your role.</span>
    </p>
  );
}

/** The form as it is for a session holding `perms`; for any other, the notice and the same form with every control off. */
export function ReadOnly({ perms = ["settings.manage"], children }: { perms?: string[]; children: React.ReactNode }) {
  if (useCanEdit(perms)) return <>{children}</>;
  return (
    <>
      <ReadOnlyNotice perms={perms} />
      <fieldset disabled className="contents" data-read-only-form>{children}</fieldset>
    </>
  );
}
