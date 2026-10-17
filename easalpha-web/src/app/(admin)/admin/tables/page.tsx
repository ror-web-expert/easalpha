"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Grid3X3, LayoutGrid, Plus, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { DiningTable, Floor } from "@/lib/types";
import { titleCase } from "@/lib/utils";
import { Cards, PageHeader } from "@/components/admin/page";
import { useRemove, useSave } from "@/components/admin/crud";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, ConfirmDialog, Dialog, Field, Input, Loading, Select, SummaryCard, Tabs, tableStatusVariant } from "@/components/ui";
import { toast } from "@/store/toast";
import { FloorPlanEditor } from "@/components/admin/floor-plan-editor";
import { DEFAULT_SIZE, autoArrange, firstFreeSpot } from "@/components/admin/floor-plan";

interface TableForm { id?: string; code: string; name: string; seats: number; floor_id: string; location: string; status?: string }
// SPEC table statuses: Available, Occupied, Reserved or Maintenance (bill_requested is set by the QR flow).
const TABLE_STATUSES = ["available", "occupied", "reserved", "bill_requested", "maintenance"];
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
  const [advanced, setAdvanced] = useState(false);
  // Tables saved without a position used to stack at the top-left corner, so only the last one showed on the plan.
  // They now wait in a "Not placed yet" tray until placed (or arranged) and saved.
  const [placedLocally, setPlacedLocally] = useState<Set<string>>(new Set());
  const saveTable = useSave<TableForm>(["tables", "floors"], (f) => (f.id ? `/tables/${f.id}` : "/tables"), { onSuccess: () => setForm(null) });
  const saveFloor = useSave<{ name: string }>(["floors"], () => "/tables/floors", { onSuccess: () => setFloorName(null), success: "Floor added" });
  const removeTable = useRemove(["tables", "floors"], (id) => `/tables/${id}`);
  const all = tables.data?.data ?? [];
  const floorList = useMemo(() => floors.data?.data ?? [], [floors.data]);
  useEffect(() => { if (!floorId && floorList.length) setFloorId(floorList[0].id); }, [floorList, floorId]);
  useEffect(() => {
    const p: Record<string, Pos> = {};
    all.forEach((t) => { if (t.position) p[t.id] = { x: t.position.x ?? 0, y: t.position.y ?? 0, w: t.position.w ?? 2, h: t.position.h ?? 2 }; });
    setPositions(p); setDirty(false); setPlacedLocally(new Set());
  }, [tables.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = all.filter((t) => (floorId === "none" ? !t.floor_id : t.floor_id === floorId));
  const placed = shown.filter((t) => positions[t.id]);
  const unplaced = shown.filter((t) => !positions[t.id]);
  const placeOne = (id: string) => { setPositions((p) => ({ ...p, [id]: firstFreeSpot(placed.map((t) => p[t.id]).filter(Boolean)) })); setPlacedLocally((s) => new Set(s).add(id)); setDirty(true); };
  const arrangeAll = () => {
    const rects = autoArrange(shown.map((t) => positions[t.id] ?? DEFAULT_SIZE));
    setPositions((p) => { const n = { ...p }; shown.forEach((t, i) => { n[t.id] = rects[i]; }); return n; });
    setPlacedLocally(new Set(shown.map((t) => t.id))); setDirty(true);
  };
  const saveLayout = async () => {
    setSaving(true);
    try {
      await api("/tables/layout", { method: "PUT", body: { tables: placed.map((t) => ({ id: t.id, position: positions[t.id], floor_id: t.floor_id })) } });
      toast.success("Layout saved"); setDirty(false); qc.invalidateQueries({ queryKey: ["tables"] });
    } catch (e) { toast.error("Could not save layout", errorMessage(e)); }
    finally { setSaving(false); }
  };
  const setPos = (id: string, k: keyof Pos, v: number) => { setPositions((p) => ({ ...p, [id]: { ...p[id], [k]: v } })); setDirty(true); };
  const s = tables.data?.summary;
  return (
    <>
      <PageHeader icon={Grid3X3} title="Tables and floors" description="Position tables on a grid; the till shows this plan for dine-in." actions={<>
        <Button variant="secondary" onClick={() => setFloorName("")}><Plus className="h-4 w-4" /> Floor</Button>
        <Button variant="secondary" onClick={() => setForm({ code: "", name: "", seats: 4, floor_id: floorId === "none" ? "" : floorId, location: "" })}><Plus className="h-4 w-4" /> Table</Button>
        <span title={dirty ? "Save the new positions" : "Nothing to save yet: drag a table, resize it or place one first"}><Button onClick={saveLayout} loading={saving} disabled={!dirty}><Save className="h-4 w-4" /> {dirty ? "Save layout" : "Layout saved"}</Button></span>
      </>} />
      <Cards>
        <SummaryCard label="Tables" value={s?.total ?? 0} sub={`${s?.seats ?? 0} seats`} />
        <SummaryCard label="Available" value={s?.available ?? 0} tone="success" />
        <SummaryCard label="Occupied" value={s?.occupied ?? 0} tone="warning" />
        <SummaryCard label="Maintenance" value={all.filter((t) => t.status === "maintenance").length} sub="Out of service" tone="neutral" />
      </Cards>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
        <span>Legend:</span>
        {TABLE_STATUSES.map((st) => <Badge key={st} variant={tableStatusVariant(st)}>{titleCase(st)}</Badge>)}
        <span className="ml-auto">{floorList.length} {floorList.length === 1 ? "floor" : "floors"}</span>
      </div>
      {floors.isLoading || tables.isLoading ? <Loading /> : (
        <>
          <Tabs value={floorId} onChange={setFloorId} items={[...floorList.map((f) => ({ value: f.id, label: f.name, count: all.filter((t) => t.floor_id === f.id).length })), { value: "none", label: "Unassigned", count: all.filter((t) => !t.floor_id).length }]} className="mb-4 w-fit" />
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <Card>
              <CardHeader>
                <CardTitle>Floor plan</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="hidden text-xs text-fg-muted sm:inline">Drag to move · drag the corner to resize</span>
                  {shown.length ? <Button variant="secondary" size="sm" onClick={arrangeAll}><LayoutGrid className="h-4 w-4" /> Auto arrange</Button> : null}
                </div>
              </CardHeader>
              <CardBody className="space-y-3">
                {unplaced.length ? (
                  <div className="rounded-lg border border-dashed border-warning bg-warning-soft/40 p-3">
                    <div className="mb-2 text-sm font-medium text-warning-ink">Not placed yet ({unplaced.length})</div>
                    <div className="flex flex-wrap gap-2">
                      {unplaced.map((t) => <button key={t.id} type="button" onClick={() => placeOne(t.id)} className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-dashed bg-card px-3 text-sm font-medium hover:border-primary"><Plus className="h-3.5 w-3.5" /> Place {t.code}</button>)}
                    </div>
                  </div>
                ) : null}
                {shown.length ? <FloorPlanEditor tables={placed} positions={positions} onChange={(id, r) => { setPositions((p) => ({ ...p, [id]: r })); setDirty(true); }} />
                  : <div className="rounded-lg border bg-muted/40 py-10 text-center text-sm text-fg-muted">No tables on this floor. Add one with + Table.</div>}
                {placedLocally.size ? <p className="text-xs text-fg-muted">Placed tables are saved when you press Save layout.</p> : null}
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Tables</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setAdvanced((a) => !a)} aria-expanded={advanced}><SlidersHorizontal className="h-4 w-4" /> {advanced ? "Hide positions" : "Advanced"}</Button>
              </CardHeader>
              <CardBody className="space-y-3">
                {shown.map((t) => {
                  const p = positions[t.id];
                  return (
                    <div key={t.id} className="rounded-md border p-2">
                      <div className="flex items-center justify-between">
                        <button className="text-sm font-semibold text-primary hover:underline" onClick={() => setForm({ id: t.id, code: t.code, name: t.name ?? "", seats: t.seats, floor_id: t.floor_id ?? "", location: t.location ?? "", status: t.status })}>{t.code}{t.name ? ` · ${t.name}` : ""}</button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setDel(t)} aria-label="Remove"><Trash2 className="h-4 w-4 text-danger" /></Button>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-fg-muted">{t.seats} seats · <Badge variant={tableStatusVariant(t.status)}>{titleCase(t.status)}</Badge>{!p ? <Badge variant="warning">not placed</Badge> : null}</div>
                      {advanced && p ? (
                        <div className="mt-2 grid grid-cols-4 gap-1">
                          {([["x", "Column"], ["y", "Row"], ["w", "Width"], ["h", "Height"]] as const).map(([k, label]) => (
                            <label key={k} className="text-[11px] text-fg-muted">{label}<Input type="number" min={k === "w" || k === "h" ? 1 : 0} className="h-8 px-2 text-xs" value={p[k] + (k === "x" || k === "y" ? 1 : 0)} onChange={(e) => setPos(t.id, k, Math.max(k === "w" || k === "h" ? 1 : 0, Number(e.target.value) - (k === "x" || k === "y" ? 1 : 0)))} /></label>
                          ))}
                        </div>
                      ) : null}
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
            {form.id ? <Field label="Status" hint="Maintenance takes the table out of service on the till and the QR menu"><Select value={form.status ?? "available"} onChange={(e) => setForm({ ...form, status: e.target.value })}>{TABLE_STATUSES.map((st) => <option key={st} value={st}>{titleCase(st)}</option>)}</Select></Field> : null}
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
