"use client";
// Meal Plans: for a day, each session's dishes with how many are cooked and what the worker pays; publish so the kiosk
// serves it; copy yesterday to save typing.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Copy, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { MealPlan, MealSession, Product } from "@/lib/types";
import { formatMoney, majorToMinor, minorToMajor } from "@/lib/money";
import { isoDay } from "@/lib/dates";
import { FilterBar, PageHeader } from "@/components/admin/page";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Loading, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { toast } from "@/store/toast";

interface Row { product_id: string; planned_qty: string; worker_price: string }

function shift(day: string, n: number): string { const d = new Date(day + "T00:00:00"); d.setDate(d.getDate() + n); return isoDay(d); }

export default function MealPlansPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(isoDay());
  const sessions = useQuery({ queryKey: ["canteen_sessions"], queryFn: () => api<{ data: MealSession[] }>("/canteen/sessions"), select: (r) => r.data.filter((s) => s.active) });
  const plans = useQuery({ queryKey: ["canteen_plans", date], queryFn: () => api<{ data: MealPlan[] }>("/canteen/plans", { query: { from: date, to: date } }), select: (r) => r.data });
  const products = useQuery({ queryKey: ["canteen_products"], queryFn: () => api<{ data: Product[] }>("/products", { query: { limit: 200 } }), select: (r) => r.data.filter((p) => p.active && !p.archived_at) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["canteen_plans"] }); void qc.invalidateQueries({ queryKey: ["canteen_today_admin"] }); };
  const copy = async () => {
    try { const r = await api<{ copied: number }>("/canteen/plans/copy", { method: "POST", body: { from: shift(date, -1), to: date } }); toast.success(`${r.copied} plan${r.copied === 1 ? "" : "s"} copied from the day before`); refresh(); }
    catch (e) { toast.error("Could not copy", errorMessage(e)); }
  };
  return (
    <>
      <PageHeader icon={CalendarDays} title="Meal Plans" description="For each session of the day: the dishes, how many are cooked and what the worker pays (blank means the menu price; less means the company pays the rest). Publish so the kiosk serves it."
        actions={<Button variant="secondary" onClick={copy}><Copy className="h-4 w-4" /> Copy from the day before</Button>} />
      <FilterBar>
        <Field label="Day"><Input type="date" className="w-auto" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="flex gap-1 self-end"><Button variant="ghost" size="sm" onClick={() => setDate(shift(date, -1))}>Previous</Button><Button variant="ghost" size="sm" onClick={() => setDate(isoDay())}>Today</Button><Button variant="ghost" size="sm" onClick={() => setDate(shift(date, 1))}>Next</Button></div>
      </FilterBar>
      {sessions.isLoading || plans.isLoading || products.isLoading ? <Loading /> : !sessions.data?.length ? (
        <Card><CardBody className="text-sm text-fg-muted">No meal sessions yet. Set them up under Meal Sessions first (Breakfast, Lunch, Dinner).</CardBody></Card>
      ) : (
        <div className="space-y-4">
          {sessions.data.map((s) => <SessionPlan key={s.id} session={s} date={date} plan={plans.data?.find((p) => p.meal_session_id === s.id) ?? null} products={products.data ?? []} onChange={refresh} />)}
        </div>
      )}
    </>
  );
}

function SessionPlan({ session, date, plan, products, onChange }: { session: MealSession; date: string; plan: MealPlan | null; products: Product[]; onChange: () => void }) {
  const fromPlan = useMemo<Row[]>(() => (plan?.items ?? []).map((i) => ({ product_id: i.product_id, planned_qty: i.planned_qty?.toString() ?? "", worker_price: i.worker_price_minor != null ? minorToMajor(i.worker_price_minor) : "" })), [plan]);
  const [rows, setRows] = useState<Row[]>(fromPlan);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => setRows(fromPlan), [fromPlan]);
  const dirty = JSON.stringify(rows) !== JSON.stringify(fromPlan);
  const save = async (publish: boolean) => {
    setBusy(publish ? "publish" : "save");
    try {
      const items = rows.filter((r) => r.product_id).map((r) => ({ product_id: r.product_id, planned_qty: r.planned_qty ? Number(r.planned_qty) : null, worker_price_minor: r.worker_price.trim() ? majorToMinor(r.worker_price) : null }));
      await api("/canteen/plans", { method: "POST", body: { meal_session_id: session.id, plan_date: date, items, publish } });
      toast.success(publish ? `${session.name} published` : `${session.name} saved as draft`);
      onChange();
    } catch (e) { toast.error("Could not save the plan", errorMessage(e)); }
    finally { setBusy(null); }
  };
  const action = async (path: string, label: string, method: "POST" | "DELETE" = "POST") => {
    if (!plan) return;
    setBusy(label);
    try { await api(`/canteen/plans/${plan.id}${path}`, { method }); toast.success(label); onChange(); }
    catch (e) { toast.error(`Could not ${label.toLowerCase()}`, errorMessage(e)); }
    finally { setBusy(null); }
  };
  const used = new Set(rows.map((r) => r.product_id));
  return (
    <Card data-session={session.name}>
      <CardHeader>
        <CardTitle>{session.name} <span className="text-sm font-normal text-fg-muted">{session.starts_at} to {session.ends_at}</span></CardTitle>
        <div className="flex items-center gap-2">
          {plan ? <Badge variant={plan.status === "published" ? "success" : "warning"}>{plan.status}</Badge> : <Badge>no plan</Badge>}
          {plan ? <span className="text-sm text-fg-muted">{plan.claims} taken</span> : null}
        </div>
      </CardHeader>
      <CardBody className="space-y-3">
        <Table>
          <THead><tr><TH>Dish</TH><TH>Menu price</TH><TH>Cooked (qty)</TH><TH>Worker pays (Rs)</TH><TH right></TH></tr></THead>
          <TBody>
            {rows.map((r, idx) => {
              const product = products.find((p) => p.id === r.product_id);
              const taken = plan?.items.find((i) => i.product_id === r.product_id)?.claims_count ?? 0;
              return (
                <TR key={idx}>
                  <TD>
                    <Select value={r.product_id} onChange={(e) => setRows(rows.map((x, i) => (i === idx ? { ...x, product_id: e.target.value } : x)))}>
                      <option value="">Choose a dish</option>
                      {products.filter((p) => p.id === r.product_id || !used.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  </TD>
                  <TD className="tabular text-fg-secondary">{product ? formatMoney(product.base_price_minor) : "-"}</TD>
                  <TD><Input type="number" min={1} className="w-28" value={r.planned_qty} placeholder="open" onChange={(e) => setRows(rows.map((x, i) => (i === idx ? { ...x, planned_qty: e.target.value } : x)))} /></TD>
                  <TD><Input type="number" min={0} step="1" className="w-32" value={r.worker_price} placeholder={product ? minorToMajor(product.base_price_minor) : "menu price"} onChange={(e) => setRows(rows.map((x, i) => (i === idx ? { ...x, worker_price: e.target.value } : x)))} /></TD>
                  <TD right>{taken ? <span className="text-xs text-fg-muted">{taken} taken</span> : <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setRows(rows.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4 text-danger" /></Button>}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setRows([...rows, { product_id: "", planned_qty: "", worker_price: "" }])}><Plus className="h-4 w-4" /> Add dish</Button>
          <div className="flex-1" />
          {plan && plan.status === "published" ? <Button variant="ghost" size="sm" loading={busy === "Unpublished"} onClick={() => action("/unpublish", "Unpublished")}>Unpublish</Button> : null}
          {plan && !plan.claims ? <Button variant="ghost" size="sm" loading={busy === "Plan deleted"} onClick={() => action("", "Plan deleted", "DELETE")}><Trash2 className="h-4 w-4" /> Delete</Button> : null}
          <Button variant="secondary" size="sm" loading={busy === "save"} disabled={!dirty && !!plan} onClick={() => save(false)}>Save draft</Button>
          <Button size="sm" loading={busy === "publish"} disabled={!rows.some((r) => r.product_id)} onClick={() => save(true)}>{plan?.status === "published" ? "Save & keep published" : "Save & publish"}</Button>
        </div>
      </CardBody>
    </Card>
  );
}
