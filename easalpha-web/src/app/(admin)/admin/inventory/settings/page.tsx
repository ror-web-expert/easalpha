"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal, ClipboardCheck, Bell, Eraser, RefreshCw } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { InventorySettings, RebuildBalancesResult, StockDocument, StockResetResult } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { useSections } from "@/components/admin/stock";
import { SettingsScreenCard, useSettings } from "@/components/admin/settings-screen";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, ConfirmDialog, Field, Input, KeyValue, Loading, PinDialog, Select, Switch } from "@/components/ui";
import { toast } from "@/store/toast";

export default function StockSettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["inventory_settings"], queryFn: () => api<InventorySettings>("/inventory_settings") });
  const settings = useSettings();
  const sections = useSections();
  const [form, setForm] = useState<InventorySettings | null>(null);
  const [toggling, setToggling] = useState(false);
  useEffect(() => { if (q.data) setForm(q.data); }, [q.data]);
  const save = useMutation({
    mutationFn: (body: Partial<InventorySettings>) => api<InventorySettings>("/inventory_settings", { method: "PATCH", body }),
    onSuccess: (s) => { qc.setQueryData(["inventory_settings"], s); toast.success("Inventory settings saved"); },
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

  // SPEC Reset Stock: zero a section (or the branch) through posted adjustment documents, behind a manager PIN.
  const [resetSection, setResetSection] = useState("");
  const [resetReason, setResetReason] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetPin, setResetPin] = useState(false);
  const [resetPinError, setResetPinError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetDocs, setResetDocs] = useState<StockDocument[] | null>(null);
  const resetTarget = resetSection ? sections.data?.find((s) => s.id === resetSection)?.name ?? "this section" : "every section";
  const runReset = async (pin: string) => {
    setResetting(true);
    setResetPinError(null);
    try {
      const r = await api<StockResetResult>("/stock/reset", { method: "POST", body: { section_id: resetSection || undefined, reason: resetReason.trim() || undefined, approver_pin: pin } });
      setResetDocs(r.documents);
      setResetPin(false);
      ["stock_levels", "stock_valuation", "stock_items", "stock_item", "stock_item_ledger", "stock_documents", "daily_sheet"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(r.documents.length ? `Stock reset: ${r.documents.map((d) => d.label).join(", ")}` : "Nothing to reset", r.documents.length ? undefined : "Every level was already zero.");
    } catch (e) {
      if (e instanceof ApiError && (e.code === "approval.invalid" || e.code === "approval.required" || e.code === "pin.invalid")) setResetPinError("Wrong PIN or not allowed. Try again.");
      else { setResetPin(false); toast.error("Could not reset stock", errorMessage(e)); }
    } finally { setResetting(false); }
  };

  // SPEC "For the clone": balances are caches of the ledgers; rebuild them on demand.
  const [rebuilt, setRebuilt] = useState<RebuildBalancesResult | null>(null);
  const rebuild = useMutation({
    mutationFn: () => api<RebuildBalancesResult>("/stock/rebuild_balances", { method: "POST" }),
    onSuccess: (r) => { setRebuilt(r); ["stock_levels", "stock_valuation", "stock_items", "stock_item", "suppliers", "customers", "payment_accounts"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); toast.success("Balances rebuilt"); },
    onError: (e) => toast.error("Could not rebuild balances", errorMessage(e)),
  });

  if (!form) return <Loading />;
  const submit = () => save.mutate({
    day_lock_date: form.day_lock_date || null, allow_manual_below_zero: form.allow_manual_below_zero, return_on_cancel: form.return_on_cancel, weight_display: form.weight_display,
    volume_display: form.volume_display, food_cost_target_percent: Number(form.food_cost_target_percent) || 0, require_recipe_to_live: form.require_recipe_to_live, deduct_stock_on_sale: form.deduct_stock_on_sale,
  });
  const alertKeys = settings.data?.groups.inventory?.screens["Stock Alerts"] ?? [];
  return (
    <>
      <PageHeader icon={SlidersHorizontal} title="Inventory Settings" description="The rules every stock surface obeys: day lock, counting, negative stock on manual movements, return on cancellation, display units, alerts and resets." actions={<Button onClick={submit} loading={save.isPending}>Save</Button>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className={form.counting_open ? "border-warning" : ""}>
          <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> Stock counting</CardTitle>{form.counting_open ? <Badge variant="warning">open</Badge> : <Badge>closed</Badge>}</CardHeader>
          <CardBody className="space-y-3">
            <Switch checked={form.counting_open} onChange={toggleCounting} disabled={toggling} label={form.counting_open ? "Counting is open" : "Counting is closed"} />
            <p className="text-sm text-fg-secondary">A global switch that closes counting entirely. Posted counts are untouched and every other action carries on. Open it before a stocktake, then close it so nobody posts a stale count later. The switch is logged in the audit trail.</p>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Rules</CardTitle></CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Day lock date" hint="No stock movement may be dated on or before this day, so a checked and closed day cannot change. Sales are exempt: an order on a locked day still deducts and a cancellation still returns stock."><Input type="date" value={form.day_lock_date ?? ""} onChange={(e) => set("day_lock_date", e.target.value || null)} /></Field>
            <Field label="Food cost target (%)" hint="Used by recipe cost reports"><Input type="number" inputMode="decimal" min={0} max={100} step="0.5" className="tabular" value={form.food_cost_target_percent} onChange={(e) => set("food_cost_target_percent", Number(e.target.value))} /></Field>
            <div className="space-y-3 sm:col-span-2">
              <Switch checked={form.deduct_stock_on_sale} onChange={(v) => set("deduct_stock_on_sale", v)} label="Deduct stock on sale (recipes and packaging post once, when the order completes; the safety net sweeps missed orders)" />
              <Switch checked={form.return_on_cancel} onChange={(v) => set("return_on_cancel", v)} label="Return stock on cancellation (off: staff record waste instead)" />
              <Switch checked={form.allow_manual_below_zero} onChange={(v) => set("allow_manual_below_zero", v)} label="Allow negative on manual movements (off: a transfer, return or production that would go below zero is refused with the quantity on hand; sales and waste are always allowed)" />
              <Switch checked={form.require_recipe_to_live} onChange={(v) => set("require_recipe_to_live", v)} label="Require a recipe before a product can go live" />
            </div>
          </CardBody>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Display units</CardTitle><span className="text-xs text-fg-muted">Separate from storage: 25,000 g reads as 25 kg while nothing stored changes</span></CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Weight" hint="Automatic shows kilograms from 1,000 g">
              <Select value={form.weight_display} onChange={(e) => set("weight_display", e.target.value as InventorySettings["weight_display"])}><option value="auto">Automatic (g, kg from 1,000 g)</option><option value="g">Always grams</option><option value="kg">Always kilograms</option></Select>
            </Field>
            <Field label="Volume" hint="Automatic shows litres from 1,000 ml">
              <Select value={form.volume_display} onChange={(e) => set("volume_display", e.target.value as InventorySettings["volume_display"])}><option value="auto">Automatic (ml, l from 1,000 ml)</option><option value="ml">Always millilitres</option><option value="l">Always litres</option></Select>
            </Field>
          </CardBody>
        </Card>
        {settings.isLoading ? (
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-4 w-4" /> Stock Alerts</CardTitle></CardHeader><Loading /></Card>
        ) : alertKeys.length ? (
          <SettingsScreenCard screen="Stock Alerts" keys={alertKeys} />
        ) : (
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-4 w-4" /> Stock Alerts</CardTitle></CardHeader><CardBody className="text-sm text-fg-secondary">Alert settings are managed from the main settings store. They were not returned for this account.</CardBody></Card>
        )}
        <Card className="border-danger/40">
          <CardHeader><CardTitle className="flex items-center gap-2"><Eraser className="h-4 w-4" /> Reset Stock</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-fg-secondary">Zeroes every level in the chosen section through a posted adjustment document, so the ledger keeps the trail and nothing is deleted. Needs a manager PIN.</p>
            <Field label="Section"><Select value={resetSection} onChange={(e) => setResetSection(e.target.value)}><option value="">All sections in this branch</option>{sections.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Reason"><Input value={resetReason} onChange={(e) => setResetReason(e.target.value)} placeholder="Stock reset" /></Field>
            <Button variant="destructive" onClick={() => setResetConfirm(true)} disabled={resetting}>Reset stock…</Button>
            {resetDocs ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                {resetDocs.length ? <>
                  <div className="mb-1 font-medium">Adjustment documents created</div>
                  <ul className="space-y-1">{resetDocs.map((d) => <li key={d.id}><Link href={`/admin/inventory/stock-actions/${d.id}`} className="font-mono text-primary hover:underline">{d.label}</Link><span className="text-fg-secondary"> · {d.line_count} line{d.line_count === 1 ? "" : "s"}</span></li>)}</ul>
                </> : <span className="text-fg-secondary">Nothing to reset: every level was already zero.</span>}
              </div>
            ) : null}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Rebuild balances</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-fg-secondary">Stock levels, payment accounts, customer and supplier balances are caches of their ledgers. Rebuild them if a figure looks wrong; the ledgers themselves are never changed.</p>
            <Button variant="secondary" onClick={() => rebuild.mutate()} loading={rebuild.isPending}><RefreshCw className="h-4 w-4" /> Rebuild now</Button>
            {rebuilt ? <KeyValue items={[{ label: "Stock levels", value: rebuilt.stock_levels }, { label: "Payment accounts", value: rebuilt.payment_accounts }, { label: "Customers", value: rebuilt.customers }, { label: "Suppliers", value: rebuilt.suppliers }]} /> : null}
          </CardBody>
        </Card>
      </div>
      <ConfirmDialog open={resetConfirm} onClose={() => setResetConfirm(false)} onConfirm={() => { setResetConfirm(false); setResetPinError(null); setResetPin(true); }} title={`Reset stock in ${resetTarget}?`} description="Every non-zero level is adjusted to zero in a posted document dated today. A manager PIN is asked for next." confirmLabel="Continue" destructive />
      <PinDialog open={resetPin} onClose={() => setResetPin(false)} onSubmit={runReset} what={`Reset stock in ${resetTarget}`} error={resetPinError} loading={resetting} />
    </>
  );
}
