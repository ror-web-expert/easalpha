"use client";
import { useState } from "react";
import { Layers, Plus, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { api } from "@/lib/api";
import type { Category, Menu, Station } from "@/lib/types";
import { FilterBar, PageHeader } from "@/components/admin/page";
import { useAction, useList, useRemove, useSave } from "@/components/admin/crud";
import { Badge, Button, Checkbox, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

type Form = { id?: string; menu_id: string; name: string; name_ur: string; station_id: string; show_online: boolean };

export default function CategoriesPage() {
  const menus = useList<Menu>("menus", "/menus");
  const stations = useList<Station>("stations", "/stations");
  const [menuId, setMenuId] = useState("");
  const list = useList<Category>("categories", "/categories", { menu_id: menuId });
  const save = useSave<Form>(["categories"], (f) => (f.id ? `/categories/${f.id}` : "/categories"), { onSuccess: () => setForm(null) });
  const remove = useRemove(["categories"], (id) => `/categories/${id}`);
  const reorder = useAction<string[]>(["categories"], (ids) => api("/categories/reorder", { method: "POST", body: { ids } }));
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<Category | null>(null);
  const rows = list.data ?? [];
  const move = (i: number, dir: -1 | 1) => {
    const ids = rows.map((r) => r.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate(ids);
  };
  const blank = (): Form => ({ menu_id: menuId || menus.data?.[0]?.id || "", name: "", name_ur: "", station_id: "", show_online: true });
  return (
    <>
      <PageHeader icon={Layers} title="Categories" description="Categories appear as the left column on the till." actions={<Button onClick={() => setForm(blank())}><Plus className="h-4 w-4" /> New category</Button>} />
      <FilterBar>
        <Select className="w-auto" value={menuId} onChange={(e) => setMenuId(e.target.value)}><option value="">All menus</option>{menus.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Name</TH><TH>Menu</TH><TH>Station</TH><TH>Online</TH><TH right>Products</TH><TH right>Order</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {rows.length ? rows.map((c, i) => (
              <TR key={c.id}>
                <TD className="font-medium">{c.name}{c.name_ur ? <span className="ml-2 text-fg-muted">{c.name_ur}</span> : null}</TD>
                <TD className="text-fg-secondary">{menus.data?.find((m) => m.id === c.menu_id)?.name ?? "-"}</TD>
                <TD className="text-fg-secondary">{stations.data?.find((s) => s.id === c.station_id)?.name ?? "-"}</TD>
                <TD>{c.show_online ? <Badge variant="success">online</Badge> : <Badge>hidden</Badge>}</TD>
                <TD right>{c.product_count ?? 0}</TD>
                <TD right>
                  <Button variant="ghost" size="icon-sm" onClick={() => move(i, -1)} disabled={i === 0 || !!menuId === false && false} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
                </TD>
                <TD right>
                  <Button variant="ghost" size="icon-sm" onClick={() => setForm({ id: c.id, menu_id: c.menu_id, name: c.name, name_ur: c.name_ur ?? "", station_id: c.station_id ?? "", show_online: c.show_online })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setDel(c)} aria-label="Delete"><Trash2 className="h-4 w-4 text-danger" /></Button>
                </TD>
              </TR>
            )) : <EmptyRow colSpan={7}>No categories yet.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit category" : "New category"} size="sm"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name || !form?.menu_id} onClick={() => form && save.mutate({ ...form, station_id: form.station_id || (null as unknown as string) })}>Save</Button></>}>
        {form ? (
          <div className="space-y-3">
            <Field label="Menu"><Select value={form.menu_id} onChange={(e) => setForm({ ...form, menu_id: e.target.value })}>{menus.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            <Field label="Name (Urdu)"><Input dir="rtl" value={form.name_ur} onChange={(e) => setForm({ ...form, name_ur: e.target.value })} /></Field>
            <Field label="Kitchen station" hint="Items without their own station go here"><Select value={form.station_id} onChange={(e) => setForm({ ...form, station_id: e.target.value })}><option value="">None</option>{stations.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Checkbox label="Show online" checked={form.show_online} onChange={(e) => setForm({ ...form, show_online: e.target.checked })} />
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => { if (del) remove.mutate(del.id, { onSuccess: () => setDel(null) }); }} title={`Archive ${del?.name}?`} description="A category with products cannot be archived; move them first." confirmLabel="Archive" destructive loading={remove.isPending} />
    </>
  );
}
