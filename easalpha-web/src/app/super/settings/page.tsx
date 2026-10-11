"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, MessageCircle, Phone, BookOpen, LifeBuoy, Clock } from "lucide-react";
import { useSuperApi, superKey } from "@/components/super/api";
import { SuperPageHeader, ErrorNote } from "@/components/super/shell";
import { ANNOUNCEMENT_LEVELS, PLATFORM_FIELDS, effectivePlatformValues, platformForm, platformPayload, whatsappHref } from "@/components/super/super-helpers";
import { useAction } from "@/components/admin/crud";
import type { PlatformSettingsResponse } from "@/lib/types";
import { Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Loading, Select, Textarea } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

export default function SuperSettingsPage() {
  const sapi = useSuperApi();
  const settings = useQuery({ queryKey: superKey("platform_settings"), queryFn: () => sapi<PlatformSettingsResponse>("/super/platform_settings") });
  const [form, setForm] = useState<Record<string, string> | null>(null);
  useEffect(() => { if (settings.data && form === null) setForm(platformForm(settings.data.values)); }, [settings.data, form]);
  const save = useAction<Record<string, string>>(["super"], (f) => sapi("/super/platform_settings", { method: "PUT", body: platformPayload(f) }), "Branding saved. Every admin panel picks it up on its next load.");

  if (settings.isLoading || !form) return settings.error ? <ErrorNote error={settings.error} /> : <Loading />;
  const d = settings.data!;
  const eff = effectivePlatformValues({ ...form, announcement_level: form.announcement_level as "info" | "warning" }, d.defaults);
  const set = (k: string, v: string) => setForm((f) => ({ ...(f ?? {}), [k]: v }));
  const dirty = JSON.stringify(form) !== JSON.stringify(platformForm(d.values));

  return (
    <>
      <SuperPageHeader title="EasAlpha branding" description="How restaurants reach you. These values appear in every restaurant's Help & Support box, footer and receipts."
        actions={<Button loading={save.isPending} disabled={!dirty} onClick={() => save.mutate(form)}>Save</Button>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader><CardTitle>Contact and messages</CardTitle><span className="text-xs text-fg-muted">Blank restores the default</span></CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            {PLATFORM_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} hint={`${f.hint}${d.defaults[f.key] ? ` Default: ${d.defaults[f.key]}.` : ""}`} className={f.type === "textarea" ? "sm:col-span-2" : undefined}>
                {f.type === "textarea" ? <Textarea value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} rows={2} placeholder={d.defaults[f.key] ?? ""} />
                  : <Input type={f.type} value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} placeholder={d.defaults[f.key] ?? ""} />}
              </Field>
            ))}
            <Field label="Announcement level" hint="Info is a calm blue bar; warning is orange for outages and deadlines.">
              <Select value={form.announcement_level} onChange={(e) => set("announcement_level", e.target.value)}>
                {ANNOUNCEMENT_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </Select>
            </Field>
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Preview</CardTitle><span className="text-xs text-fg-muted">As a restaurant sees it</span></CardHeader>
            <CardBody className="space-y-3">
              {eff.announcement ? (
                <div className={cn("rounded-xl px-4 py-2.5 text-sm", eff.announcement_level === "warning" ? "bg-cta-soft text-cta-ink" : "bg-primary-soft text-primary-ink")}>{eff.announcement}</div>
              ) : null}
              <div className="rounded-2xl border bg-page p-4">
                <div className="flex items-center gap-2"><LifeBuoy className="h-5 w-5 text-cta-ink" /><h3 className="text-base font-semibold text-heading">{eff.product_name} Help & Support</h3></div>
                <ul className="mt-3 space-y-2 text-sm">
                  {eff.support_whatsapp ? <li className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-fg-muted" /><a className="font-medium text-primary hover:underline" href={whatsappHref(eff.support_whatsapp) ?? undefined}>WhatsApp {eff.support_whatsapp}</a></li> : null}
                  {eff.support_email ? <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-fg-muted" /><a className="font-medium text-primary hover:underline" href={`mailto:${eff.support_email}`}>{eff.support_email}</a></li> : null}
                  {eff.support_phone ? <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-fg-muted" /><a className="font-medium text-primary hover:underline" href={`tel:${eff.support_phone}`}>{eff.support_phone}</a></li> : null}
                  {eff.support_hours ? <li className="flex items-center gap-2 text-fg-secondary"><Clock className="h-4 w-4 text-fg-muted" />{eff.support_hours}</li> : null}
                  {eff.docs_url ? <li className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-fg-muted" /><a className="font-medium text-primary hover:underline" href={eff.docs_url}>User guide</a></li> : null}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex h-8 items-center rounded-full bg-cta px-4 text-[13px] font-semibold text-cta-fg">Message EasAlpha</span>
                  {eff.support_url ? <span className="inline-flex h-8 items-center rounded-full border border-primary px-4 text-[13px] font-medium text-primary">Support page</span> : null}
                </div>
                {eff.powered_by ? <p className="mt-3 text-xs text-fg-muted">{eff.powered_by}</p> : null}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Super admins</CardTitle><span className="text-xs text-fg-muted">Managed on the server</span></CardHeader>
            <CardBody>
              <ul className="divide-y text-sm">
                {d.admins.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0"><div className="truncate font-medium">{a.name}</div><div className="truncate text-xs text-fg-secondary">{a.email}</div></div>
                    <span className="shrink-0 text-xs text-fg-muted">{a.last_login_at ? `Last login ${formatDateTime(a.last_login_at)}` : "Never logged in"}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
