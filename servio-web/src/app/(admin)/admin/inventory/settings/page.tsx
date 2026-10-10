"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal, ClipboardCheck } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { InventorySettings } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Loading, Select, Switch } from "@/components/ui";
import { toast } from "@/store/toast";

export default function StockSettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["inventory_settings"], queryFn: () => api<InventorySettings>("/inventory_settings") });
  const [form, setForm] = useState<InventorySettings | null>(null);
  const [toggling, setToggling] = useState(false);
  useEffect(() => { if (q.data) setForm(q.data); }, [q.data]);
  const save = useMutation({
    mutationFn: (body: Partial<InventorySettings>) => api<InventorySettings>("/inventory_settings", { method: "PATCH", body }),
    onSuccess: (s) => { qc.setQueryData(["inventory_settings"], s); toast.success("Stock settings saved"); },
    onError: (e) => toast.error("Could not save", errorMessage(e)),
  });
  const set = <K extends keyof InventorySettings>(k: K, v: InventorySettings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const toggleCounting = async (open: boolean) => {
    setToggling(true);
    try {
      const s = await api<InventorySettings>("/inventory_settings/counting", { method: "POST", body: { open } });
      qc.setQueryData(["inventory_settings"], s);
      toast.success(open ? "Counting is open" : "Counting is closed");
    } catch (e) { toast.error("Could not change counting", errorMessage(e)); }
    finally { setToggling(false); }
  };
  if (!form) return <Loading />;
  const submit = () => save.mutate({
    day_lock_date: form.day_lock_date || null, allow_manual_below_zero: form.allow_manual_below_zero, return_on_cancel: form.return_on_cancel, weight_display: form.weight_display,
    volume_display: form.volume_display, food_cost_target_percent: Number(form.food_cost_target_percent) || 0, require_recipe_to_live: form.require_recipe_to_live, deduct_stock_on_sale: form.deduct_stock_on_sale,
  });
  return (
    <>
      <PageHeader icon={SlidersHorizontal} title="Stock settings" description="How stock is deducted, locked and displayed." actions={<Button onClick={submit} loading={save.isPending}>Save</Button>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className={form.counting_open ? "border-warning" : ""}>
          <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> Counting</CardTitle>{form.counting_open ? <Badge variant="warning">open</Badge> : <Badge>closed</Badge>}</CardHeader>
          <CardBody className="space-y-3">
            <Switch checked={form.counting_open} onChange={toggleCounting} disabled={toggling} label={form.counting_open ? "Counting is open" : "Counting is closed"} />
            <p className="text-sm text-fg-secondary">Counts can only be posted while counting is open. Open it before a stocktake so staff can enter counted quantities, then close it so nobody posts a stale count later. The switch is logged in the audit trail.</p>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Rules</CardTitle></CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Day lock date" hint="Documents on or before this day are refused. Set it after closing a period."><Input type="date" value={form.day_lock_date ?? ""} onChange={(e) => set("day_lock_date", e.target.value || null)} /></Field>
            <Field label="Food cost target (%)" hint="Used by recipe cost reports"><Input type="number" inputMode="decimal" min={0} max={100} step="0.5" className="tabular" value={form.food_cost_target_percent} onChange={(e) => set("food_cost_target_percent", Number(e.target.value))} /></Field>
            <div className="space-y-3 sm:col-span-2">
              <Switch checked={form.deduct_stock_on_sale} onChange={(v) => set("deduct_stock_on_sale", v)} label="Deduct stock on sale (recipes and packaging post when an order is paid or placed)" />
              <Switch checked={form.return_on_cancel} onChange={(v) => set("return_on_cancel", v)} label="Return stock when an order is voided or cancelled" />
              <Switch checked={form.allow_manual_below_zero} onChange={(v) => set("allow_manual_below_zero", v)} label="Allow manual documents (transfer, waste, return) to take stock below zero" />
              <Switch checked={form.require_recipe_to_live} onChange={(v) => set("require_recipe_to_live", v)} label="Require a recipe before a product can go live" />
            </div>
          </CardBody>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Display</CardTitle></CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Weight" hint="Auto shows kilograms from 1,000 g">
              <Select value={form.weight_display} onChange={(e) => set("weight_display", e.target.value as InventorySettings["weight_display"])}><option value="auto">Auto (g, kg from 1,000 g)</option><option value="g">Always grams</option><option value="kg">Always kilograms</option></Select>
            </Field>
            <Field label="Volume" hint="Auto shows litres from 1,000 ml">
              <Select value={form.volume_display} onChange={(e) => set("volume_display", e.target.value as InventorySettings["volume_display"])}><option value="auto">Auto (ml, l from 1,000 ml)</option><option value="ml">Always millilitres</option><option value="l">Always litres</option></Select>
            </Field>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
