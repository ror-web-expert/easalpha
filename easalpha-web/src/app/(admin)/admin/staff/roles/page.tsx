"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Lock, Plus, Search, Shield, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Permission, PermissionRegistry, Role } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { useAction, useList, useRemove, useSave } from "@/components/admin/crud";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Checkbox, ConfirmDialog, Dialog, Field, Input, Loading, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import { permissionSections } from "@/components/admin/permission-sections";

export default function RolesPage() {
  const roles = useList<Role>("roles", "/roles");
  const registry = useQuery({ queryKey: ["permissions", "registry"], queryFn: () => api<PermissionRegistry>("/roles/permissions") });
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string>("");
  const [map, setMap] = useState<Record<string, { on: boolean; limit: string }>>({});
  const [name, setName] = useState("");
  const [create, setCreate] = useState<{ name: string; copy_from_role_id: string } | null>(null);
  const [del, setDel] = useState(false);
  const role = roles.data?.find((r) => r.id === sel);
  useEffect(() => { if (!sel && roles.data?.length) setSel(roles.data[0].id); }, [roles.data, sel]);
  useEffect(() => {
    if (!role) return;
    const m: Record<string, { on: boolean; limit: string }> = {};
    role.permissions.forEach((p) => { m[p.code] = { on: true, limit: p.limit === null || p.limit === undefined ? "" : String(p.limit) }; });
    setMap(m); setName(role.name);
  }, [role]);
  const save = useAction<void>(["roles"], () => api(`/roles/${sel}`, { method: "PUT", body: { name, permissions: Object.entries(map).filter(([, v]) => v.on).map(([code, v]) => ({ code, limit: v.limit === "" ? null : Number(v.limit) })) } }), "Role saved");
  const createM = useSave<{ name: string; copy_from_role_id: string }, Role>(["roles"], () => "/roles", { onSuccess: (r) => { setCreate(null); setSel(r.id); }, success: "Role created" });
  const remove = useRemove(["roles"], (id) => `/roles/${id}`);
  // Review 4.6: sections by module in the registry's order (the old grouping split codes on "." and gave every
  // VIEW_DAILY_SALES-style code a section of its own, headed by the raw code), a search, and no codes on screen.
  const sections = useMemo(() => permissionSections(registry.data, query), [registry.data, query]);
  const limitable = (code: string) => code === "discounts.apply";
  const readOnly = role?.system_key === "owner";
  // The owner holds every permission on the server whatever its stored list says, so every box shows ticked; a
  // restriction limits a role instead of granting something, and the owner has none.
  const isOn = (p: Permission) => (readOnly ? !p.restriction : !!map[p.code]?.on);
  const setMany = (list: Permission[], on: boolean) => setMap((m) => { const next = { ...m }; for (const p of list) next[p.code] = { on, limit: m[p.code]?.limit ?? "" }; return next; });
  const toggleOpen = (name: string) => setClosed((c) => { const n = new Set(c); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  return (
    <>
      <PageHeader icon={Shield} title="Roles" description="System roles can change permissions but not names. Copy one to make a custom role." actions={<Button onClick={() => setCreate({ name: "", copy_from_role_id: sel })}><Plus className="h-4 w-4" /> New role</Button>} />
      {roles.isLoading || registry.isLoading ? <Loading /> : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Card>
            <CardBody className="space-y-1 p-2">
              {roles.data?.map((r) => (
                <button key={r.id} onClick={() => setSel(r.id)} className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted ${sel === r.id ? "bg-primary-soft font-medium" : ""}`}>
                  <span>{r.name}</span>{r.is_system ? <Badge variant="outline">system</Badge> : null}
                </button>
              ))}
            </CardBody>
          </Card>
          {role ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2"><CardTitle>{role.name}</CardTitle><span className="text-xs text-fg-muted">{readOnly ? "Every permission" : `${Object.values(map).filter((v) => v.on).length} permissions`}</span></div>
                <div className="flex gap-2">
                  {!role.is_system ? <Button variant="ghost" size="sm" onClick={() => setDel(true)}><Trash2 className="h-4 w-4 text-danger" /></Button> : null}
                  <Button size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={readOnly}>Save</Button>
                </div>
              </CardHeader>
              <CardBody className="space-y-4">
                {readOnly ? <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-fg-secondary"><Lock className="h-4 w-4 shrink-0" /> The owner role always holds every permission, so it cannot be edited or saved.</p> : null}
                {!role.is_system ? <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" /></Field> : null}
                <div className="relative max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search permissions" className="pl-9" aria-label="Search permissions" />
                </div>
                {sections.map((sec) => {
                  const granted = sec.items.filter((p) => isOn(p)).length;
                  const open = query.trim() !== "" || !closed.has(sec.name);
                  const all = granted === sec.items.length;
                  return (
                    <section key={sec.name} className="rounded-xl border">
                      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                        <button type="button" onClick={() => toggleOpen(sec.name)} aria-expanded={open} className="flex min-h-10 flex-1 items-center gap-2 text-left text-sm font-semibold">
                          <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} /> {sec.name}
                          <Badge variant={granted === 0 ? "neutral" : all ? "success" : "primary"} className="tabular">{granted}/{sec.items.length}</Badge>
                        </button>
                        <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => setMany(sec.items, !all)}>{all ? "Clear this section" : "Select all in this section"}</Button>
                      </div>
                      {open ? (
                        <div className="grid gap-x-4 gap-y-1 border-t px-3 py-2 sm:grid-cols-2">
                          {sec.items.map((p) => (
                            <div key={p.code} className="flex items-start justify-between gap-2 rounded px-1 py-1 hover:bg-muted/60">
                              <Checkbox label={<span><span className="font-medium">{p.label}</span>{p.description && p.description !== p.label ? <span className="block text-xs text-fg-secondary">{p.description}</span> : null}{p.restriction ? <Badge variant="warning" className="ml-1">Restriction</Badge> : null}</span>} checked={isOn(p)} disabled={readOnly} onChange={(e) => setMap({ ...map, [p.code]: { on: e.target.checked, limit: map[p.code]?.limit ?? "" } })} />
                              {limitable(p.code) && map[p.code]?.on ? <Input type="number" className="h-8 w-24 text-xs" placeholder="limit %" value={map[p.code].limit} onChange={(e) => setMap({ ...map, [p.code]: { on: true, limit: e.target.value } })} aria-label="Discount limit in percent" /> : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </section>
                  );
                })}
                {!sections.length ? <p className="py-6 text-center text-sm text-fg-muted">No permission matches “{query}”.</p> : null}
              </CardBody>
            </Card>
          ) : null}
        </div>
      )}
      <Dialog open={!!create} onClose={() => setCreate(null)} title="New role" size="sm" footer={<><Button variant="secondary" onClick={() => setCreate(null)}>Cancel</Button><Button loading={createM.isPending} disabled={!create?.name || !create?.copy_from_role_id} onClick={() => create && createM.mutate(create)}>Create</Button></>}>
        {create ? <div className="space-y-3"><Field label="Name"><Input value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} autoFocus /></Field><Field label="Copy permissions from"><Select value={create.copy_from_role_id} onChange={(e) => setCreate({ ...create, copy_from_role_id: e.target.value })}>{roles.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field></div> : null}
      </Dialog>
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={() => remove.mutate(sel, { onSuccess: () => { setDel(false); setSel(""); } })} title={`Delete role ${role?.name}?`} description="Members must be moved to another role first." confirmLabel="Delete" destructive loading={remove.isPending} />
    </>
  );
}
