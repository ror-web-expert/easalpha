"use client";
import { useEffect, useState } from "react";
import { Shield, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Permission, Role } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { useAction, useList, useRemove, useSave } from "@/components/admin/crud";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Checkbox, ConfirmDialog, Dialog, Field, Input, Loading, Select } from "@/components/ui";

export default function RolesPage() {
  const roles = useList<Role>("roles", "/roles");
  const perms = useList<Permission>("permissions", "/roles/permissions");
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
  const groups = (perms.data ?? []).reduce<Record<string, Permission[]>>((acc, p) => { const g = p.code.split(".")[0]; (acc[g] ??= []).push(p); return acc; }, {});
  const limitable = (code: string) => code === "discounts.apply";
  return (
    <>
      <PageHeader icon={Shield} title="Roles and permissions" description="System roles can change permissions but not names. Copy one to make a custom role." actions={<Button onClick={() => setCreate({ name: "", copy_from_role_id: sel })}><Plus className="h-4 w-4" /> New role</Button>} />
      {roles.isLoading || perms.isLoading ? <Loading /> : (
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
                <div className="flex items-center gap-2"><CardTitle>{role.name}</CardTitle><span className="text-xs text-fg-muted">{Object.values(map).filter((v) => v.on).length} permissions</span></div>
                <div className="flex gap-2">
                  {!role.is_system ? <Button variant="ghost" size="sm" onClick={() => setDel(true)}><Trash2 className="h-4 w-4 text-danger" /></Button> : null}
                  <Button size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={role.system_key === "owner"}>Save</Button>
                </div>
              </CardHeader>
              <CardBody className="space-y-4">
                {!role.is_system ? <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" /></Field> : null}
                {Object.entries(groups).map(([g, list]) => (
                  <div key={g}>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-secondary">{g}</div>
                    <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                      {list.map((p) => (
                        <div key={p.code} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-muted/60">
                          <Checkbox label={p.description} checked={!!map[p.code]?.on} disabled={role.system_key === "owner"} onChange={(e) => setMap({ ...map, [p.code]: { on: e.target.checked, limit: map[p.code]?.limit ?? "" } })} />
                          {limitable(p.code) && map[p.code]?.on ? <Input type="number" className="h-7 w-20 text-xs" placeholder="limit %" value={map[p.code].limit} onChange={(e) => setMap({ ...map, [p.code]: { on: true, limit: e.target.value } })} /> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
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
