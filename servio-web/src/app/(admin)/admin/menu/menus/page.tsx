"use client";
import { useState } from "react";
import { UtensilsCrossed, Plus, Pencil, Trash2 } from "lucide-react";
import type { Menu } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { useList, useRemove, useSave } from "@/components/admin/crud";
import { Badge, Button, Checkbox, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

type Form = { id?: string; name: string; show_online: boolean; is_default: boolean };
const empty: Form = { name: "", show_online: true, is_default: false };

export default function MenusPage() {
  const list = useList<Menu>("menus", "/menus");
  const save = useSave<Form>(["menus"], (f) => (f.id ? `/menus/${f.id}` : "/menus"), { onSuccess: () => setForm(null) });
  const remove = useRemove(["menus"], (id) => `/menus/${id}`);
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<Menu | null>(null);
  return (
    <>
      <PageHeader icon={UtensilsCrossed} title="Menus" description="A menu groups categories; time rules decide when it shows online." actions={<Button onClick={() => setForm(empty)}><Plus className="h-4 w-4" /> New menu</Button>} />
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Name</TH><TH>Online</TH><TH right>Categories</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {list.data?.length ? list.data.map((m) => (
              <TR key={m.id}>
                <TD className="font-medium">{m.name} {m.is_default ? <Badge variant="primary">default</Badge> : null}</TD>
                <TD>{m.show_online ? <Badge variant="success">online</Badge> : <Badge>hidden</Badge>}</TD>
                <TD right>{m.category_count ?? 0}</TD>
                <TD right>
                  <Button variant="ghost" size="icon-sm" onClick={() => setForm({ id: m.id, name: m.name, show_online: m.show_online, is_default: m.is_default })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setDel(m)} aria-label="Delete"><Trash2 className="h-4 w-4 text-danger" /></Button>
                </TD>
              </TR>
            )) : <EmptyRow colSpan={4}>No menus yet. Create the first one.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit menu" : "New menu"} size="sm"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name} onClick={() => form && save.mutate(form)}>Save</Button></>}>
        {form ? (
          <div className="space-y-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            <Checkbox label="Show online" checked={form.show_online} onChange={(e) => setForm({ ...form, show_online: e.target.checked })} />
            <Checkbox label="Default menu" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => { if (del) remove.mutate(del.id, { onSuccess: () => setDel(null) }); }} title={`Archive ${del?.name}?`} description="Its categories keep their products but the menu disappears from tills." confirmLabel="Archive" destructive loading={remove.isPending} />
    </>
  );
}
