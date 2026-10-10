"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { api } from "@/lib/api";
import type { LoyaltySettings } from "@/lib/types";
import { formatMoney, majorToMinor, minorToMajor } from "@/lib/money";
import { PageHeader } from "@/components/admin/page";
import { useSave } from "@/components/admin/crud";
import { Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Loading, Switch } from "@/components/ui";

interface Form { enabled: boolean; rupees_per_point: string; point_value: string; min_redeem: string; max_redeem_percent: string; birthday_percent: string; birthday_days: string }
const truthy = (v: unknown) => v === true || v === "true" || v === 1 || v === "1";

export default function LoyaltyPage() {
  const q = useQuery({ queryKey: ["loyalty_settings"], queryFn: () => api<LoyaltySettings>("/loyalty/settings") });
  const [f, setF] = useState<Form | null>(null);
  useEffect(() => {
    if (!q.data || f) return;
    const s = q.data;
    setF({ enabled: truthy(s.loyalty_enabled), rupees_per_point: String(s.loyalty_rupees_per_point ?? 100), point_value: minorToMajor(Number(s.loyalty_point_value_minor ?? 100)), min_redeem: String(s.loyalty_min_redeem_points ?? 100), max_redeem_percent: String(s.loyalty_max_redeem_percent ?? 50), birthday_percent: String(s.birthday_discount_percent ?? 10), birthday_days: String(s.birthday_offer_days ?? 7) });
  }, [q.data, f]);
  const save = useSave<Record<string, unknown>, LoyaltySettings>(["loyalty_settings"], () => "/loyalty/settings", { method: "PATCH", success: "Loyalty settings saved" });
  if (q.isLoading || !f) return <Loading />;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF({ ...f, [k]: v });
  const rpp = Math.max(1, Number(f.rupees_per_point) || 1);
  const pv = majorToMinor(f.point_value);
  const example = Math.floor(2000 / rpp);
  const submit = () => save.mutate({ id: "x", loyalty_enabled: f.enabled, loyalty_rupees_per_point: Number(f.rupees_per_point) || 100, loyalty_point_value_minor: pv, loyalty_min_redeem_points: Number(f.min_redeem) || 0, loyalty_max_redeem_percent: Number(f.max_redeem_percent) || 0, birthday_discount_percent: Number(f.birthday_percent) || 0, birthday_offer_days: Number(f.birthday_days) || 0 });
  return (
    <>
      <PageHeader icon={Star} title="Loyalty" description="Points earned on paid orders for named customers, redeemed as a discount before payment. Birthday offers go out by WhatsApp as a one-use coupon." actions={<Button onClick={submit} loading={save.isPending}>Save</Button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Points</CardTitle><Switch checked={f.enabled} onChange={(v) => set("enabled", v)} label={f.enabled ? "On" : "Off"} /></CardHeader>
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Field label="Rupees spent per point" hint="Rs 100 per point means a Rs 2,000 bill earns 20 points"><Input type="number" min={1} className="tabular" value={f.rupees_per_point} onChange={(e) => set("rupees_per_point", e.target.value)} /></Field>
            <Field label="Value of one point (Rs)" hint="What a point is worth when redeemed"><Input type="number" min={0} step="any" className="tabular" value={f.point_value} onChange={(e) => set("point_value", e.target.value)} /></Field>
            <Field label="Minimum points to redeem"><Input type="number" min={0} className="tabular" value={f.min_redeem} onChange={(e) => set("min_redeem", e.target.value)} /></Field>
            <Field label="Max % of a bill paid with points" hint="Caps how much of the subtotal points can cover"><Input type="number" min={0} max={100} className="tabular" value={f.max_redeem_percent} onChange={(e) => set("max_redeem_percent", e.target.value)} /></Field>
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-fg-secondary sm:col-span-2">Example: a Rs 2,000 bill earns <span className="font-medium text-fg">{example} points</span>, worth <span className="font-medium text-fg">{formatMoney(example * pv)}</span> on a later visit. Walk-in and staff-meal orders never earn points.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Birthday offer</CardTitle></CardHeader>
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Field label="Discount %"><Input type="number" min={0} max={100} className="tabular" value={f.birthday_percent} onChange={(e) => set("birthday_percent", e.target.value)} /></Field>
            <Field label="Valid for (days)"><Input type="number" min={1} className="tabular" value={f.birthday_days} onChange={(e) => set("birthday_days", e.target.value)} /></Field>
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-fg-secondary sm:col-span-2">On their birthday, every opted-in customer with a birthday on file gets a {f.birthday_percent || 0}% one-use coupon by WhatsApp, valid {f.birthday_days || 0} days. Set 0% to turn this off.</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
