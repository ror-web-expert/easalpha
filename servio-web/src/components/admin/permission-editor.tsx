"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Membership, MembershipPermissions, Permission, PermissionPreset, PermissionRegistry, StaffType } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Checkbox, ConfirmDialog, EmptyState, Loading } from "@/components/ui";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";

// SPEC "How the permission editor works": module list on the left with a granted-of-total badge, the selected module's
// permissions on the right, presets (Cashier, Supervisor, Manager) plus Select all on top. Each permission shows its
// machine code, plain-English description, a surface badge and a RESTRICTION badge. Changes take effect at next sign-in.

// ---- pure selection logic (unit-tested) ----

export type ModuleCount = { name: string; total: number; granted: number };

/** Add the code when missing, remove it when present. Order of the rest is kept. */
export function toggle(selection: string[], code: string): string[] {
  return selection.includes(code) ? selection.filter((c) => c !== code) : [...selection, code];
}

/** A preset replaces the whole selection with its codes, the same as PUT { preset } does on the server. */
export function applyPreset(preset: Pick<PermissionPreset, "codes">): string[] {
  return Array.from(new Set(preset.codes));
}

/** "Select all" ticks every SPEC code (restrictions included); Servio extras are left as they are. */
export function selectAll(registry: Permission[], selection: string[]): string[] {
  const spec = registry.filter((p) => p.spec).map((p) => p.code);
  const extras = selection.filter((c) => !spec.includes(c) && registry.some((p) => p.code === c && !p.spec));
  return [...spec, ...extras];
}

/** granted-of-total per module, in registry (API) order. Unknown selected codes count nowhere. */
export function moduleCounts(registry: PermissionRegistry, selection: string[]): ModuleCount[] {
  const set = new Set(selection);
  return registry.modules.map((name) => {
    const rows = registry.data.filter((p) => p.module === name);
    return { name, total: rows.length, granted: rows.filter((p) => set.has(p.code)).length };
  });
}

/** Codes the selection implies but does not list itself (SPEC codes imply Servio codes). */
export function impliedBy(registry: Permission[], selection: string[]): Set<string> {
  const set = new Set(selection);
  const out = new Set<string>();
  const byCode = new Map(registry.map((p) => [p.code, p]));
  for (const c of selection) for (const i of byCode.get(c)?.implies ?? []) if (!set.has(i)) out.add(i);
  return out;
}

/** Same codes regardless of order or duplicates. */
export function sameSelection(a: string[], b: string[]): boolean {
  const sa = new Set(a); const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const c of sa) if (!sb.has(c)) return false;
  return true;
}

/** What the editor shows ticked when it opens: owner holds everything, a role shows its effective set, a custom set shows what was granted. */
export function baseline(access: Pick<MembershipPermissions, "owner" | "mode" | "granted" | "effective">, registry: Permission[]): string[] {
  if (access.owner) return registry.map((p) => p.code);
  return access.mode === "role" ? [...access.effective] : [...access.granted];
}

// ---- UI ----

const SURFACE: Record<Permission["surface"], { label: string; variant: "info" | "accent" | "outline" }> = {
  software: { label: "Software", variant: "info" },
  app: { label: "App", variant: "accent" },
  both: { label: "Both", variant: "outline" },
};
const SURFACE_HINT: Record<Permission["surface"], string> = {
  software: "Takes effect on the desktop POS only.",
  app: "Takes effect on the tablet app only.",
  both: "One shared setting for the desktop POS and the tablet app.",
};
const LIST_HREF: Record<StaffType, string> = { admin: "/admin/staff/admin-staff", cashier: "/admin/staff/cashiers", order_taker: "/admin/staff/order-takers", rider: "/admin/riders/manage" };

export function PermissionEditor({ membershipId }: { membershipId: string }) {
  const qc = useQueryClient();
  const member = useQuery({ queryKey: ["staff", membershipId], queryFn: () => api<Membership>(`/staff/${membershipId}`) });
  const registry = useQuery({ queryKey: ["permissions", "registry"], queryFn: () => api<PermissionRegistry>("/roles/permissions") });
  const presets = useQuery({ queryKey: ["permissions", "presets"], queryFn: () => api<{ data: PermissionPreset[] }>("/roles/presets"), select: (r) => r.data });
  const access = useQuery({ queryKey: ["staff_permissions", membershipId], queryFn: () => api<MembershipPermissions>(`/staff/${membershipId}/permissions`) });
  const [current, setCurrent] = useState<MembershipPermissions | null>(null);
  const [selection, setSelection] = useState<string[] | null>(null);
  const [moduleName, setModuleName] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  const reg = registry.data;
  useEffect(() => { if (access.data && reg && !current) { setCurrent(access.data); setSelection(baseline(access.data, reg.data)); } }, [access.data, reg, current]);
  useEffect(() => { if (!moduleName && reg?.modules.length) setModuleName(reg.modules[0]); }, [reg, moduleName]);

  const afterWrite = (out: MembershipPermissions, msg: string) => {
    setCurrent(out); if (reg) setSelection(baseline(out, reg.data));
    qc.setQueryData(["staff_permissions", membershipId], out);
    qc.invalidateQueries({ queryKey: ["staff"] });
    toast.success(msg, `Mode: ${out.mode}. ${out.granted.length} permissions granted. Takes effect at the next sign-in.`);
  };
  const save = useMutation({
    mutationFn: (codes: string[]) => api<MembershipPermissions>(`/staff/${membershipId}/permissions`, { method: "PUT", body: { codes } }),
    onSuccess: (out) => afterWrite(out, "Access saved"),
    onError: (e) => toast.error("Could not save access", errorMessage(e)),
  });
  const reset = useMutation({
    mutationFn: () => api<MembershipPermissions>(`/staff/${membershipId}/permissions`, { method: "PUT", body: { reset: true } }),
    onSuccess: (out) => { setConfirmReset(false); afterWrite(out, "Access reset to the role"); },
    onError: (e) => toast.error("Could not reset access", errorMessage(e)),
  });

  const counts = useMemo(() => (reg && selection ? moduleCounts(reg, selection) : []), [reg, selection]);
  const implied = useMemo(() => (reg && selection ? impliedBy(reg.data, selection) : new Set<string>()), [reg, selection]);

  if (member.isError || access.isError || registry.isError) return <EmptyState title="Could not load this person's access" hint={errorMessage(member.error ?? access.error ?? registry.error)} />;
  if (!member.data || !reg || !current || !selection) return <Loading />;
  const m = member.data;
  const owner = current.owner;
  const base = baseline(current, reg.data);
  const dirty = !owner && !sameSelection(selection, base);
  const rows = reg.data.filter((p) => p.module === moduleName);
  const specTotal = reg.data.filter((p) => p.spec).length;
  const specGranted = reg.data.filter((p) => p.spec && selection.includes(p.code)).length;
  const sel = new Set(selection);
  const onReset = () => { if (current.mode === "custom") setConfirmReset(true); else setSelection(base); };

  return (
    <>
      <PageHeader icon={ShieldCheck} title={m.user?.name ?? "Staff member"} description={`Role: ${m.role.name}. Changes take effect at the user's next sign-in, not immediately.`}
        actions={<Link href={LIST_HREF[m.staff_type] ?? "/admin/staff/admin-staff"}><Button variant="secondary"><ArrowLeft className="h-4 w-4" /> Back to list</Button></Link>} />

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium tracking-[0.4px] text-fg-secondary">Presets</span>
          {(presets.data ?? []).map((p) => (
            <Button key={p.key} variant="secondary" size="sm" disabled={owner} onClick={() => setSelection(applyPreset(p))}>{p.name}</Button>
          ))}
          <Button variant="secondary" size="sm" disabled={owner} onClick={() => setSelection(selectAll(reg.data, selection))}>Select all</Button>
          <span className="mx-2 hidden h-6 border-l sm:block" />
          <Badge variant={owner ? "primary" : current.mode === "custom" ? "info" : "neutral"}>{owner ? "Owner" : current.mode === "custom" ? "Custom set" : "From role"}</Badge>
          <span className="text-xs tabular text-fg-secondary">{specGranted} of {specTotal} SPEC permissions</span>
          <span className="flex-1" />
          <Button variant="ghost" size="sm" disabled={owner || (current.mode === "role" && !dirty)} onClick={onReset} loading={reset.isPending}>Reset to role</Button>
          <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(selection)}>Save</Button>
        </CardBody>
        {owner ? <p className="border-t px-4 py-2 text-xs text-fg-secondary">The owner always holds every permission. Nothing here can be changed.</p>
          : current.mode === "role" ? <p className="border-t px-4 py-2 text-xs text-fg-secondary">Access comes from the role until you save a custom set.</p>
          : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardBody className="space-y-1 p-2">
            {counts.map((c) => (
              <button key={c.name} type="button" onClick={() => setModuleName(c.name)} aria-current={moduleName === c.name ? "true" : undefined}
                className={cn("flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted", moduleName === c.name && "bg-primary-soft font-medium")}>
                <span className="truncate">{c.name}</span>
                <Badge variant={c.granted === 0 ? "neutral" : c.granted === c.total ? "success" : "primary"} className="tabular">{c.granted}/{c.total}</Badge>
              </button>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2"><CardTitle>{moduleName}</CardTitle><span className="text-xs tabular text-fg-muted">{rows.filter((p) => sel.has(p.code)).length} of {rows.length} granted</span></div>
            {rows.some((p) => p.restriction) ? <span className="text-xs text-fg-secondary">RESTRICTION: ticking this adds a step rather than opening a door.</span> : null}
          </CardHeader>
          <CardBody className="p-0">
            {rows.map((p) => {
              const on = sel.has(p.code);
              return (
                <div key={p.code} className={cn("flex min-h-12 items-start gap-3 border-t px-4 py-2 first:border-t-0 hover:bg-fg/[0.04]", on && "bg-primary-soft/40")}>
                  <Checkbox className="mt-1" aria-label={p.code} checked={on} disabled={owner} onChange={() => setSelection(toggle(selection, p.code))} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="font-mono text-xs">{p.code}</code>
                      <span className="text-sm font-medium">{p.label}</span>
                      <Badge variant={SURFACE[p.surface].variant} title={SURFACE_HINT[p.surface]}>{SURFACE[p.surface].label}</Badge>
                      {p.restriction ? <Badge variant="warning" title="Ticking this adds a step rather than opening a door.">RESTRICTION</Badge> : null}
                      {!on && implied.has(p.code) ? <Badge variant="outline" title="Held through a ticked SPEC permission that implies it.">Implied</Badge> : null}
                    </div>
                    {p.description !== p.label ? <p className="mt-0.5 text-sm text-fg-secondary">{p.description}</p> : null}
                  </div>
                </div>
              );
            })}
            {rows.length === 0 ? <p className="p-4 text-sm text-fg-muted">No permissions in this module.</p> : null}
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog open={confirmReset} onClose={() => setConfirmReset(false)} onConfirm={() => reset.mutate()} title={`Reset ${m.user?.name ?? "this person"} to the role?`} description={`Their custom set is dropped and access follows the ${m.role.name} role again at the next sign-in.`} confirmLabel="Reset to role" destructive loading={reset.isPending} />
    </>
  );
}
