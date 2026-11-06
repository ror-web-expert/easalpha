"use client";
// The standard state for an admin page this user may not use: opened from a bookmark, an old link or by typing the URL,
// since the sidebar does not offer it. Used for a switched-off module (the sidebar's ModuleGate), a permission the
// session lacks (PayrollGuard), and a page whose main query the API refused (review R5: canteen, payroll, payment
// methods, plan and WhatsApp drew empty cards around failing 403 calls for a manager).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ApiError } from "@/lib/api";
import { MODULE_INFO } from "@/lib/modules";
import type { BusinessModule } from "@/lib/types";
import { useAuthStore, useCan } from "@/store/auth";
import { navItemFor } from "./nav";

export interface Denial { kind: "permission" | "module"; message: string }

/** The API's refusal of the page itself: 403 permission.denied, or module.disabled for a module switched off. */
export function accessDenial(error: unknown): Denial | null {
  if (!(error instanceof ApiError) || error.status !== 403) return null;
  if (error.code === "permission.denied") return { kind: "permission", message: error.message };
  if (error.code === "module.disabled") return { kind: "module", message: error.message };
  return null;
}

/**
 * `kind` permission: the role lacks what the page needs; `detail` names it ("Missing permission: canteen.manage") for the
 * owner to grant. `kind` module: the module the page belongs to is off (taken from the sidebar entry when not given).
 */
export function NoAccess({ kind, module, detail }: { kind: Denial["kind"]; module?: BusinessModule | null; detail?: string }) {
  const pathname = usePathname();
  const isOwner = useAuthStore((s) => s.session?.membership.role.system_key === "owner");
  if (kind === "module") {
    const key = module ?? navItemFor(pathname ?? "", (it) => !!it.module)?.module ?? null;
    const info = key ? MODULE_INFO[key] : null;
    return (
      <div className="mx-auto mt-12 max-w-lg rounded-2xl border bg-card p-8 text-center" data-module-off={key ?? ""}>
        <h1 className="text-xl font-medium">{info ? `${info.title} is switched off` : "This module is switched off"}</h1>
        <p className="mt-2 text-sm text-fg-secondary">{info?.summary ?? detail}</p>
        <p className="mt-4 text-sm">{isOwner ? "Switch it on to use this page." : "Ask the owner to switch it on in Settings, Modules."}</p>
        {isOwner ? <Link href="/admin/settings/modules" className="mt-5 inline-flex h-10 items-center rounded-full bg-primary px-6 text-sm font-medium text-primary-fg">Open Modules</Link> : null}
      </div>
    );
  }
  return (
    <div className="mx-auto mt-12 max-w-lg rounded-2xl border bg-card p-8 text-center" data-no-access="permission">
      <h1 className="text-xl font-medium">You don&apos;t have access to this page</h1>
      <p className="mt-2 text-sm text-fg-secondary">Your role does not include what this page needs. Ask the owner to add it to your role in Staff, Roles.</p>
      {detail ? <p className="mt-4 font-mono text-xs text-fg-muted">{detail}</p> : null}
    </div>
  );
}

/**
 * The page only for a session holding one of `perms` (what the API asks of the page's main call), else NoAccess. The
 * page's queries live inside it, so nothing is asked that the API would refuse.
 */
export function RequirePermission({ perms, children }: { perms: string[]; children: React.ReactNode }) {
  const can = useCan();
  if (!can(...perms)) return <NoAccess kind="permission" detail={`Missing permission: ${perms.join(" or ")}`} />;
  return <>{children}</>;
}

/**
 * The no-access state when the API refused one of these main queries, else null: the session's permissions were out
 * of date, or the module was switched off elsewhere. Pages call it after their hooks:
 * `const denied = noAccessFor(list.error); if (denied) return denied;`
 */
export function noAccessFor(...errors: unknown[]): React.ReactElement | null {
  for (const e of errors) {
    const d = accessDenial(e);
    if (d) return <NoAccess kind={d.kind} detail={d.message} />;
  }
  return null;
}
