"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Settings } from "lucide-react";
import { api } from "@/lib/api";
import type { Business, BusinessSettings } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { useSave } from "@/components/admin/crud";
import { Button, Card, CardBody, CardHeader, CardTitle, Checkbox, Field, Input, Loading, Select, Textarea } from "@/components/ui";
import { useAuthStore } from "@/store/auth";

const ORDER_TYPES = ["dine_in", "takeaway", "delivery", "walk_in"];

export default function BusinessSettingsPage() {
  const q = useQuery({ queryKey: ["business"], queryFn: () => api<Business>("/business") });
  const setSession = useAuthStore((s) => s.setSession);
  const session = useAuthStore((s) => s.session);
  const [b, setB] = useState<{ name: string; legal_name: string; phone: string; email: string; currency: string; time_zone: string }>({ name: "", legal_name: "", phone: "", email: "", currency: "PKR", time_zone: "Asia/Karachi" });
  const [s, setS] = useState<BusinessSettings>({});
  useEffect(() => {
    if (!q.data) return;
    setB({ name: q.data.name, legal_name: q.data.legal_name ?? "", phone: q.data.phone ?? "", email: q.data.email ?? "", currency: q.data.currency, time_zone: q.data.time_zone });
    setS({ service_charge_percent: 0, service_charge_order_types: ["dine_in"], cash_rounding: 0, staff_meal_requires_approval: true, discount_requires_reason: true, kitchen_ticket_print: true, default_order_type: "walk_in", ...q.data.settings, receipt: { header: "", footer: "Thank you", show_logo: true, language: "en", paper: "80", ...(q.data.settings?.receipt ?? {}) } });
  }, [q.data]);
  const save = useSave<Record<string, unknown>, Business>(["business"], () => "/business", { method: "PATCH", onSuccess: (biz) => { if (session) setSession({ ...session, business: biz }); }, success: "Settings saved" });
  if (q.isLoading) return <Loading />;
  const set = (k: keyof BusinessSettings, v: unknown) => setS({ ...s, [k]: v });
  const receipt = s.receipt ?? {};
  const types = s.service_charge_order_types ?? [];
  return (
    <>
      <PageHeader icon={Settings} title="Business settings" description="Name, service charge, cash rounding and receipt design. Tills pick these up on the next sync." actions={<Button onClick={() => save.mutate({ id: "x", ...b, settings: s })} loading={save.isPending}>Save</Button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Business</CardTitle></CardHeader>
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} /></Field>
            <Field label="Legal name"><Input value={b.legal_name} onChange={(e) => setB({ ...b, legal_name: e.target.value })} /></Field>
            <Field label="Phone (WhatsApp)"><Input value={b.phone} onChange={(e) => setB({ ...b, phone: e.target.value })} /></Field>
            <Field label="Email"><Input value={b.email} onChange={(e) => setB({ ...b, email: e.target.value })} /></Field>
            <Field label="Currency"><Select value={b.currency} onChange={(e) => setB({ ...b, currency: e.target.value })}>{["PKR", "AED", "SAR", "USD", "GBP"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Time zone"><Input value={b.time_zone} onChange={(e) => setB({ ...b, time_zone: e.target.value })} /></Field>
            <p className="text-xs text-fg-muted sm:col-span-2">Plan: {q.data?.plan?.name ?? "trial"} · status {q.data?.status}{q.data?.trial_days_left ? ` · ${q.data.trial_days_left} trial days left` : ""}</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Selling rules</CardTitle></CardHeader>
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Field label="Service charge %"><Input type="number" min={0} step="0.5" value={String(s.service_charge_percent ?? 0)} onChange={(e) => set("service_charge_percent", Number(e.target.value))} /></Field>
            <Field label="Cash rounding (Rs)" hint="0 = none; 5 rounds to the nearest Rs 5"><Input type="number" min={0} value={String(s.cash_rounding ?? 0)} onChange={(e) => set("cash_rounding", Number(e.target.value))} /></Field>
            <div className="sm:col-span-2"><div className="mb-1 text-xs font-medium text-fg-secondary">Service charge applies to</div><div className="flex flex-wrap gap-3">{ORDER_TYPES.map((t) => <Checkbox key={t} label={t.replace("_", "-")} checked={types.includes(t)} onChange={(e) => set("service_charge_order_types", e.target.checked ? [...types, t] : types.filter((x) => x !== t))} />)}</div></div>
            <Field label="Default order type"><Select value={String(s.default_order_type ?? "walk_in")} onChange={(e) => set("default_order_type", e.target.value)}>{ORDER_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", "-")}</option>)}</Select></Field>
            <div className="space-y-2 sm:col-span-2">
              <Checkbox label="Staff meals need manager approval" checked={!!s.staff_meal_requires_approval} onChange={(e) => set("staff_meal_requires_approval", e.target.checked)} />
              <Checkbox label="Discounts need a reason" checked={!!s.discount_requires_reason} onChange={(e) => set("discount_requires_reason", e.target.checked)} />
              <Checkbox label="Print kitchen tickets" checked={!!s.kitchen_ticket_print} onChange={(e) => set("kitchen_ticket_print", e.target.checked)} />
            </div>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Receipt</CardTitle></CardHeader>
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Field label="Header"><Textarea value={receipt.header ?? ""} onChange={(e) => set("receipt", { ...receipt, header: e.target.value })} /></Field>
            <Field label="Footer"><Textarea value={receipt.footer ?? ""} onChange={(e) => set("receipt", { ...receipt, footer: e.target.value })} /></Field>
            <Field label="Paper"><Select value={receipt.paper ?? "80"} onChange={(e) => set("receipt", { ...receipt, paper: e.target.value })}><option value="80">80 mm (48 chars)</option><option value="58">58 mm (32 chars)</option></Select></Field>
            <Field label="Language"><Select value={receipt.language ?? "en"} onChange={(e) => set("receipt", { ...receipt, language: e.target.value })}><option value="en">English</option><option value="ur">Urdu</option></Select></Field>
            <Checkbox label="Show logo" checked={receipt.show_logo !== false} onChange={(e) => set("receipt", { ...receipt, show_logo: e.target.checked })} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
