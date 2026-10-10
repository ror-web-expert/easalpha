"use client";
import { useState } from "react";
import { Users, Plus, Pencil, Trash2 } from "lucide-react";
import type { CustomerGroup } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { useList, useRemove, useSave } from "@/components/admin/crud";
import { Button, ConfirmDialog, Dialog, EmptyRow, Field, Input, Loading, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

interface Form { id?: string; name: string; discount_percent: number }

export default function GroupsPage() {
  const list = useList<CustomerGroup>("customer_groups", "/customer_groups");
  const save = useSave<Form>(["customer_groups"], (f) => (f.id ? `/customer_groups/${f.id}` : "/customer_groups"), { onSuccess: () => setForm(null) });
  const remove = useRemove(["customer_groups"], (id) => `/customer_groups/${id}`);
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<CustomerGroup | null>(null);
  return (
    <>
      <PageHeader icon={Users} title="Customer groups" description="Groups carry a standing discount, e.g. Staff 20%, Corporate 10%." actions={<Button onClick={() => setForm({ name: "", discount_percent: 0 })}><Plus className="h-4 w-4" /> New group</Button>} />
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Group</TH><TH right>Discount</TH><TH right>Customers</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {list.data?.length ? list.data.map((g) => (
              <TR key={g.id}>
                <TD className="font-medium">{g.name}</TD>
                <TD right>{g.discount_percent}%</TD>
                <TD right>{g.customer_count ?? 0}</TD>
                <TD right>
                  <Button variant="ghost" size="icon-sm" onClick={() => setForm({ id: g.id, name: g.name, discount_percent: g.discount_percent })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setDel(g)} aria-label="Delete"><Trash2 className="h-4 w-4 text-danger" /></Button>
                </TD>
              </TR>
            )) : <EmptyRow colSpan={4}>No groups yet.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit group" : "New group"} size="sm"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.name} onClick={() => form && save.mutate(form)}>Save</Button></>}>
        {form ? <div className="space-y-3"><Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field><Field label="Discount %"><Input type="number" min={0} max={100} value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: Number(e.target.value) })} /></Field></div> : null}
      </Dialog>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => { if (del) remove.mutate(del.id, { onSuccess: () => setDel(null) }); }} title={`Archive ${del?.name}?`} description="Its customers are left without a group." confirmLabel="Archive" destructive loading={remove.isPending} />
    </>
  );
}
