"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Store } from "lucide-react";
import { api } from "@/lib/api";
import type { Business, SettingKey } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { useAction } from "@/components/admin/crud";
import { useSettings } from "@/components/admin/settings-screen";
import { Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Loading, Select } from "@/components/ui";
import { useAuthStore } from "@/store/auth";

// SPEC Store Profile: the business name and phones that print on the receipt, plus currency and time zone.
// Selling rules and receipt design moved to Point of Sale and Charges & Tax (the settings registry screens).

const SECONDARY_PHONE = "store.secondary_phone";
interface Profile { name: string; legal_name: string; phone: string; email: string; currency: string; time_zone: string }

export default function StoreProfilePage() {
  const q = useQuery({ queryKey: ["business"], queryFn: () => api<Business>("/business") });
  const settings = useSettings();
  const qc = useQueryClient();
  const setSession = useAuthStore((s) => s.setSession);
  const session = useAuthStore((s) => s.session);
  const [b, setB] = useState<Profile>({ name: "", legal_name: "", phone: "", email: "", currency: "PKR", time_zone: "Asia/Karachi" });
  const [secondary, setSecondary] = useState("");
  useEffect(() => {
    if (!q.data) return;
    setB({ name: q.data.name, legal_name: q.data.legal_name ?? "", phone: q.data.phone ?? "", email: q.data.email ?? "", currency: q.data.currency, time_zone: q.data.time_zone });
  }, [q.data]);
  const secondaryKey: SettingKey | undefined = settings.data?.groups.store?.screens["Store Profile"]?.find((k) => k.key === SECONDARY_PHONE);
  const storedSecondary = typeof secondaryKey?.value === "string" ? secondaryKey.value : "";
  useEffect(() => { setSecondary(storedSecondary); }, [storedSecondary]);

  const save = useAction<{ profile: Profile; secondary: string | null }, Business>(["business", "settings"], async ({ profile, secondary: phone }) => {
    const biz = await api<Business>("/business", { method: "PATCH", body: profile });
    if (phone !== null) await api("/settings", { method: "PATCH", body: { values: { [SECONDARY_PHONE]: phone === "" ? null : phone } } });
    return biz;
  }, "Store profile saved");
  const onSave = () => save.mutate(
    { profile: b, secondary: secondary !== storedSecondary ? secondary : null },
    { onSuccess: (biz) => { if (session) setSession({ ...session, business: biz }); qc.invalidateQueries({ queryKey: ["me"] }); } },
  );

  if (q.isLoading) return <Loading />;
  return (
    <>
      <PageHeader icon={Store} title="Store Profile" description="The business name, phones and contact details that print on every receipt." actions={<Button onClick={onSave} loading={save.isPending}>Save</Button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Business</CardTitle></CardHeader>
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} /></Field>
            <Field label="Legal name"><Input value={b.legal_name} onChange={(e) => setB({ ...b, legal_name: e.target.value })} /></Field>
            <Field label="Phone (WhatsApp)"><Input value={b.phone} onChange={(e) => setB({ ...b, phone: e.target.value })} /></Field>
            <Field label="Secondary phone" hint="Printed on the receipt under the primary number"><Input value={secondary} onChange={(e) => setSecondary(e.target.value)} disabled={settings.isLoading} /></Field>
            <Field label="Email"><Input value={b.email} onChange={(e) => setB({ ...b, email: e.target.value })} /></Field>
            <Field label="Currency"><Select value={b.currency} onChange={(e) => setB({ ...b, currency: e.target.value })}>{["PKR", "AED", "SAR", "USD", "GBP"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Time zone"><Input value={b.time_zone} onChange={(e) => setB({ ...b, time_zone: e.target.value })} /></Field>
            <p className="text-xs text-fg-muted sm:col-span-2">Plan: {q.data?.plan?.name ?? "trial"} · status {q.data?.status}{q.data?.trial_days_left ? ` · ${q.data.trial_days_left} trial days left` : ""}</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Other settings</CardTitle></CardHeader>
          <CardBody className="space-y-2 text-sm text-fg-secondary">
            <p>Order flow, customer rules, alerts and receipt branding are under <Link href="/admin/settings/point-of-sale" className="font-medium text-primary">Point of Sale</Link>.</p>
            <p>Service charge, delivery charge, cash rounding and PRA e-IMS are under <Link href="/admin/settings/charges-tax" className="font-medium text-primary">Charges &amp; Tax</Link>.</p>
            <p>Branch addresses and the business-day window are under <Link href="/admin/settings/store-management" className="font-medium text-primary">Store Management</Link> and <Link href="/admin/settings/business-hours" className="font-medium text-primary">Business Hours</Link>.</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
