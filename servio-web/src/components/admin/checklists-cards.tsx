"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { ChecklistKind, ChecklistRun, ChecklistTemplate, ChecklistTemplateItem, Membership } from "@/lib/types";
import { formatTime } from "@/lib/dates";
import { useAction } from "@/components/admin/crud";
import { staffName } from "@/components/admin/phase3";
import { KIND_LABELS, RUN_STATUS_META, cleanItems, moveItem, nextItemKey, progressPct, runStatus, sameItems } from "@/components/admin/checklists-helpers";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Checkbox, Input, Loading, ErrorState, Switch } from "@/components/ui";

export const RUN_KEYS = ["checklist_today", "checklist_runs"];

/** Today's opening or closing run: GET /checklists/today starts it if it has not started yet. */
export function RunCard({ kind, staff, canTick }: { kind: ChecklistKind; staff: Membership[] | undefined; canTick: boolean }) {
  const q = useQuery({ queryKey: ["checklist_today", kind], queryFn: () => api<ChecklistRun>("/checklists/today", { query: { kind } }) });
  const tick = useAction<{ id: string; key: string; done: boolean }>(RUN_KEYS, (b) => api(`/checklists/runs/${b.id}/tick`, { method: "POST", body: { key: b.key, done: b.done } }));
  const complete = useAction<string>(RUN_KEYS, (id) => api(`/checklists/runs/${id}/complete`, { method: "POST" }), `${KIND_LABELS[kind]} checklist complete`);
  const run = q.data;
  const status = run ? runStatus(run) : null;
  const pct = run ? progressPct(run.done_count, run.total_count) : 0;
  const locked = !canTick || !run || !!run.completed_at || tick.isPending;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{KIND_LABELS[kind]}</CardTitle>
          {run ? <div className="text-xs text-fg-secondary">{run.done_count} of {run.total_count} done ({pct}%)</div> : null}
        </div>
        {status ? <Badge variant={RUN_STATUS_META[status].variant}>{RUN_STATUS_META[status].label}</Badge> : null}
      </CardHeader>
      {run ? <div className="mx-4 mt-3 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} /></div> : null}
      <CardBody className="p-0">
        {q.isLoading ? <Loading /> : null}
        {q.isError ? <ErrorState message={`Could not load the ${KIND_LABELS[kind].toLowerCase()} checklist`} onRetry={() => q.refetch()} /> : null}
        {run ? (
          <ul className="divide-y">
            {run.items.length === 0 ? <li className="px-4 py-6 text-center text-sm text-fg-muted">No items. Add some under Templates.</li> : null}
            {run.items.map((it) => (
              <li key={it.key} className="flex items-start gap-3 px-4 py-3">
                <Checkbox className="mt-0.5" checked={it.done} disabled={locked} aria-label={it.label} onChange={(e) => tick.mutate({ id: run.id, key: it.key, done: e.target.checked })} />
                <div className="min-w-0 flex-1">
                  <div className={`text-sm ${it.done ? "text-fg-secondary line-through" : ""}`}>{it.label}</div>
                  {it.done && it.at ? <div className="text-xs text-fg-muted">{staffName(staff, it.by_membership_id)} at {formatTime(it.at)}</div> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </CardBody>
      {run ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
          {run.completed_at ? (
            <div className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> Completed by {staffName(staff, run.completed_by_membership_id)} at {formatTime(run.completed_at)}</div>
          ) : (
            <div className="text-xs text-fg-secondary">{run.total_count - run.done_count > 0 ? `${run.total_count - run.done_count} item(s) still open` : "All items ticked"}</div>
          )}
          {!run.completed_at ? <Button size="sm" disabled={!canTick || run.done_count < run.total_count || run.total_count === 0} loading={complete.isPending} onClick={() => complete.mutate(run.id)}>Complete</Button> : null}
        </div>
      ) : null}
    </Card>
  );
}

/** Editable item list for one template. Remount (key) when the saved template changes so the draft follows the server. */
export function TemplateEditor({ template, canEdit }: { template: ChecklistTemplate; canEdit: boolean }) {
  const [items, setItems] = useState<ChecklistTemplateItem[]>(template.items);
  const [required, setRequired] = useState(template.required_for_shift);
  const save = useAction<void>(["checklist_templates", ...RUN_KEYS], () => api(`/checklists/templates/${template.kind}`, { method: "PUT", body: { items: cleanItems(items), required_for_shift: required } }), `${KIND_LABELS[template.kind]} checklist saved`);
  const dirty = !sameItems(cleanItems(items), template.items) || required !== template.required_for_shift;
  const update = (idx: number, label: string) => setItems((ls) => ls.map((x, i) => (i === idx ? { ...x, label } : x)));
  const add = () => setItems((ls) => [...ls, { key: nextItemKey(ls), label: "" }]);
  const remove = (idx: number) => setItems((ls) => ls.filter((_, i) => i !== idx));
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{KIND_LABELS[template.kind]}</CardTitle>
          <div className="text-xs text-fg-secondary">{template.branch_id ? "This branch only" : "All branches"}</div>
        </div>
        <span className="text-xs text-fg-muted">{cleanItems(items).length} item(s)</span>
      </CardHeader>
      <CardBody className="space-y-2">
        {items.length === 0 ? <p className="py-4 text-center text-sm text-fg-muted">No items yet.</p> : null}
        {items.map((it, i) => (
          <div key={it.key} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-right text-xs tabular text-fg-muted">{i + 1}.</span>
            <Input value={it.label} disabled={!canEdit} placeholder="What should be checked?" aria-label={`Item ${i + 1}`} onChange={(e) => update(i, e.target.value)} />
            <Button variant="ghost" size="icon-sm" disabled={!canEdit || i === 0} aria-label="Move up" onClick={() => setItems((ls) => moveItem(ls, i, -1))}><ArrowUp className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon-sm" disabled={!canEdit || i === items.length - 1} aria-label="Move down" onClick={() => setItems((ls) => moveItem(ls, i, 1))}><ArrowDown className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon-sm" disabled={!canEdit} aria-label="Remove" onClick={() => remove(i)}><Trash2 className="h-4 w-4 text-danger" /></Button>
          </div>
        ))}
        {canEdit ? <Button variant="secondary" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add item</Button> : null}
      </CardBody>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
        <Switch checked={required} disabled={!canEdit} onChange={setRequired} label={`Cashiers must finish this before ${template.kind === "opening" ? "opening" : "closing"} a shift`} />
        {canEdit ? (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={!dirty || save.isPending} onClick={() => { setItems(template.items); setRequired(template.required_for_shift); }}>Discard</Button>
            <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
