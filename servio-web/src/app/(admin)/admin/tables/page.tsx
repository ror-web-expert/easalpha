"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Grid3X3, Plus, Trash2, Save } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { DiningTable, Floor } from "@/lib/types";
import { titleCase } from "@/lib/utils";
import { Cards, PageHeader } from "@/components/admin/page";
import { useRemove, useSave } from "@/components/admin/crud";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, ConfirmDialog, Dialog, Field, Input, Loading, Select, SummaryCard, Tabs, tableStatusVariant } from "@/components/ui";
import { toast } from "@/store/toast";

interface TableForm { id?: string; code: string; name: string; seats: number; floor_id: string; location: string }
type Pos = { x: number; y: number; w: number; h: number };

export default function TablesPage() {
  const qc = useQueryClient();
  const floors = useQuery({ queryKey: ["floors"], queryFn: () => api<{ data: Floor[]; unassigned: DiningTable[] }>("/tables/floors") });
  const tables = useQuery({ queryKey: ["tables"], queryFn: () => api<{ data: DiningTable[]; summary: { total: number; available: number; occupied: number; seats: number } }>("/tables") });
  const [floorId, setFloorId] = useState<string>("");
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [dirty, setDirty] = useState(false);
  const [form, setForm] = useState<TableForm | null>(null);
  const [floorName, setFloorName] = useState<string | null>(null);
  const [del, setDel] = useState<DiningTable | null>(null);
  const [saving, setSaving] = useState(false);
  const saveTable = useSave<TableForm>(["tables", "floors"], (f) => (f.id ? `/tables/${f.id}` : "/tables"), { onSuccess: () => setForm(null) });
  const saveFloor = useSave<{ name: string }>(["floors"], () => "/tables/floors", { onSuccess: () => setFloorName(null), success: "Floor added" });
  const removeTable = useRemove(["tables", "floors"], (id) => `/tables/${id}`);
  const all = tables.data?.data ?? [];
  const floorList = useMemo(() => floors.data?.data ?? [], [floors.data]);
  useEffect(() => { if (!floorId && floorList.length) setFloorId(floorList[0].id); }, [floorList, floorId]);
  useEffect(() => {
    const p: Record<string, Pos> = {};
    all.forEach((t) => { p[t.id] = { x: t.position?.x ?? 0, y: t.position?.y ?? 0, w: t.position?.w ?? 2, h: t.position?.h ?? 2 }; });
    setPositions(p); setDirty(false);
  }, [tables.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = all.filter((t) => (floorId === "none" ? !t.floor_id : t.floor_id === floorId));
  const saveLayout = async () => {
    setSaving(true);
    try {
      await api("/tables/layout", { method: "PUT", body: { tables: shown.map((t) => ({ id: t.id, position: positions[t.id], floor_id: t.floor_id })) } });
      toast.success("Layout saved"); setDirty(false); qc.invalidateQueries({ queryKey: ["tables"] });
    } catch (e) { toast.error("Could not save layout", errorMessage(e)); }
    finally { setSaving(false); }
  };
  const setPos = (id: string, k: keyof Pos, v: number) => { setPositions((p) => ({ ...p, [id]: { ...p[id], [k]: v } })); setDirty(true); };
  const cols = 12;
  const s = tables.data?.summary;
  return (
    <>
      <PageHeader icon={Grid3X3} title="Tables and floors" description="Position tables on a grid; the till shows this plan for dine-in." actions={<>
        <Button variant="secondary" onClick={() => setFloorName("")}><Plus className="h-4 w-4" /> Floor</Button>
        <Button variant="secondary" onClick={() => setForm({ code: "", name: "", seats: 4, floor_id: floorId === "none" ? "" : floorId, location: "" })}><Plus className="h-4 w-4" /> Table</Button>
        <Button onClick={saveLayout} loading={saving} disabled={!dirty}><Save className="h-4 w-4" /> Save layout</Button>
      </>} />
      <Cards>
        <SummaryCard label="Tables" value={s?.total ?? 0} sub={`${s?.seats ?? 0} seats`} />
        <SummaryCard label="Available" value={s?.available ?? 0} tone="success" />
        <SummaryCard label="Occupied" value={s?.occupied ?? 0} tone="warning" />
        <SummaryCard label="Floors" value={floorList.length} tone="neutral" />
      </Cards>
      {floors.isLoading || tables.isLoading ? <Loading /> : (
        <>
          <Tabs value={floorId} onChange={setFloorId} items={[...floorList.map((f) => ({ value: f.id, label: f.name, count: all.filter((t) => t.floor_id === f.id).length })), { value: "none", label: "Unassigned", count: all.filter((t) => !t.floor_id).length }]} className="mb-4 w-fit" />
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <Card>
              <CardHeader><CardTitle>Floor plan</CardTitle><span className="text-xs text-fg-muted">{cols} columns grid</span></CardHeader>
              <CardBody>
                <div className="relative grid gap-1 rounded-lg border bg-muted/40 p-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: "40px" }}>
                  {shown.length ? shown.map((t) => {
                    const p = positions[t.id] ?? { x: 0, y: 0, w: 2, h: 2 };
                    return (
                      <div key={t.id} className="flex flex-col items-center justify-center rounded-md border bg-card p-1 text-center text-xs shadow-sm" style={{ gridColumn: `${Math.min(cols, p.x + 1)} / span ${Math.max(1, Math.min(cols - p.x, p.w))}`, gridRow: `${p.y + 1} / span ${Math.max(1, p.h)}` }}>
                        <div className="font-semibold">{t.code}</div>
                        <div className="text-fg-muted">{t.seats} seats</div>
                        <Badge variant={tableStatusVariant(t.status)} className="mt-0.5">{titleCase(t.status)}</Badge>
                      </div>
                    );
                  }) : <div className="col-span-full py-10 text-center text-sm text-fg-muted">No tables on this floor</div>}
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardHeader><CardTitle>Tables</CardTitle></CardHeader>
              <CardBody className="space-y-3">
                {shown.map((t) => {
                  const p = positions[t.id] ?? { x: 0, y: 0, w: 2, h: 2 };
                  return (
                    <div key={t.id} className="rounded-md border p-2">
                      <div className="flex items-center justify-between">
                        <button className="text-sm font-semibold text-primary hover:underline" onClick={() => setForm({ id: t.id, code: t.code, name: t.name ?? "", seats: t.seats, floor_id: t.floor_id ?? "", location: t.location ?? "" })}>{t.code}{t.name ? ` · ${t.name}` : ""}</button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setDel(t)} aria-label="Remove"><Trash2 className="h-4 w-4 text-danger" /></Button>
                      </div>
                      <div className="mt-1 grid grid-cols-4 gap-1">
                        {(["x", "y", "w", "h"] as const).map((k) => (
                          <label key={k} className="text-[10px] uppercase text-fg-muted">{k}<Input type="number" min={0} className="h-8 px-2 text-xs" value={p[k]} onChange={(e) => setPos(t.id, k, Math.max(0, Number(e.target.value)))} /></label>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {!shown.length ? <p className="text-sm text-fg-muted">Add a table to this floor.</p> : null}
              </CardBody>
            </Card>
          </div>
        </>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit table" : "New table"} size="sm"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={saveTable.isPending} disabled={!form?.code} onClick={() => form && saveTable.mutate({ ...form, floor_id: form.floor_id || (null as unknown as string) })}>Save</Button></>}>
        {form ? (
          <div className="space-y-3">
            <Field label="Code" hint="Short, e.g. T1, A4"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} autoFocus /></Field>
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Seats"><Input type="number" min={1} value={form.seats} onChange={(e) => setForm({ ...form, seats: Number(e.target.value) })} /></Field>
            <Field label="Floor"><Select value={form.floor_id} onChange={(e) => setForm({ ...form, floor_id: e.target.value })}><option value="">Unassigned</option>{floorList.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
            <Field label="Location"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Window, terrace…" /></Field>
          </div>
        ) : null}
      </Dialog>
      <Dialog open={floorName !== null} onClose={() => setFloorName(null)} title="New floor" size="sm" footer={<><Button variant="secondary" onClick={() => setFloorName(null)}>Cancel</Button><Button loading={saveFloor.isPending} disabled={!floorName} onClick={() => saveFloor.mutate({ name: floorName! })}>Add</Button></>}>
        <Field label="Name"><Input value={floorName ?? ""} onChange={(e) => setFloorName(e.target.value)} placeholder="Ground, Rooftop, Family hall" autoFocus /></Field>
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => { if (del) removeTable.mutate(del.id, { onSuccess: () => setDel(null) }); }} title={`Remove table ${del?.code}?`} description="A table with an open order cannot be removed." confirmLabel="Remove" destructive loading={removeTable.isPending} />
    </>
  );
}
