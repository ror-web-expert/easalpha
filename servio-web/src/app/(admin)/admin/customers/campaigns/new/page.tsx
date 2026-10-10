"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Send, CalendarClock, Users } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Campaign, CampaignAudience, CustomerGroup, Promotion } from "@/lib/types";
import { useDebounced } from "@/lib/hooks";
import { PageHeader } from "@/components/admin/page";
import { useList } from "@/components/admin/crud";
import { MONTHS, SEGMENT_KINDS, fromLocalInput, toLocalInput } from "@/components/admin/phase3";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Spinner, Textarea } from "@/components/ui";
import { toast } from "@/store/toast";

interface Form { name: string; kind: string; group_id: string; days: string; month: string; limit: string; body: string; promotion_id: string; when: "now" | "schedule"; scheduled_at: string }

export default function NewCampaignPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const groups = useList<CustomerGroup>("customer_groups", "/customer_groups");
  const promos = useList<Promotion>("promotions", "/promotions");
  const coupons = useMemo(() => promos.data?.filter((p) => p.kind === "coupon" && p.coupon_code && p.active) ?? [], [promos.data]);
  const [f, setF] = useState<Form>({ name: "", kind: "all", group_id: "", days: "30", month: String(new Date().getMonth() + 1), limit: "50", body: "Hi {name}, ", promotion_id: "", when: "now", scheduled_at: toLocalInput(new Date(Date.now() + 3600_000)) });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const segment = useMemo(() => {
    const s: Record<string, string | number> = { kind: f.kind };
    if (f.kind === "group" && f.group_id) s.group_id = f.group_id;
    if (f.kind === "inactive") s.days = Number(f.days) || 30;
    if (f.kind === "birthday_month") s.month = Number(f.month) || 1;
    if (f.kind === "top_spenders") s.limit = Number(f.limit) || 50;
    return s;
  }, [f.kind, f.group_id, f.days, f.month, f.limit]);
  const dseg = useDebounced(segment, 300);
  const audience = useQuery({ queryKey: ["campaign_audience", dseg], queryFn: () => api<CampaignAudience>("/campaigns/audience", { query: dseg }), enabled: f.kind !== "group" || !!f.group_id });
  const promo = coupons.find((p) => p.id === f.promotion_id);
  const preview = f.body.replace("{name}", "Ahmed").replace("{code}", promo?.coupon_code ?? "").replace("{balance}", "Rs 1,500");
  const create = useMutation({
    mutationFn: (sendNow: boolean) => api<Campaign>("/campaigns", { method: "POST", body: { name: f.name, body: f.body, segment, promotion_id: f.promotion_id || null, scheduled_at: f.when === "schedule" ? fromLocalInput(f.scheduled_at) : null, send_now: sendNow } }),
    onSuccess: (c, sendNow) => { qc.invalidateQueries({ queryKey: ["campaigns"] }); toast.success(sendNow ? (c.status === "scheduled" ? "Campaign scheduled" : `Campaign sent to ${c.sent_count}`) : "Draft saved"); router.replace(`/admin/customers/campaigns/${c.id}`); },
    onError: (e) => toast.error("Could not save campaign", errorMessage(e)),
  });
  const valid = f.name.trim() && f.body.trim() && (f.kind !== "group" || f.group_id) && (f.when === "now" || fromLocalInput(f.scheduled_at));
  const a = audience.data;
  return (
    <>
      <PageHeader icon={Megaphone} title="New campaign" description="Pick who gets it, write the message, optionally attach a coupon, then send now or schedule." actions={<>
        <Button variant="secondary" onClick={() => create.mutate(false)} disabled={!valid} loading={create.isPending && create.variables === false}>Save draft</Button>
        <Button onClick={() => create.mutate(true)} disabled={!valid} loading={create.isPending && create.variables === true}>{f.when === "schedule" ? <><CalendarClock className="h-4 w-4" /> Schedule</> : <><Send className="h-4 w-4" /> Send now</>}</Button>
      </>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Who</CardTitle></CardHeader>
            <CardBody className="grid gap-3 sm:grid-cols-2">
              <Field label="Campaign name" className="sm:col-span-2"><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Eid 15% off" autoFocus /></Field>
              <Field label="Segment" hint={SEGMENT_KINDS.find((s) => s.value === f.kind)?.hint}><Select value={f.kind} onChange={(e) => set("kind", e.target.value)}>{SEGMENT_KINDS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select></Field>
              {f.kind === "group" ? <Field label="Group"><Select value={f.group_id} onChange={(e) => set("group_id", e.target.value)}><option value="">Choose…</option>{groups.data?.filter((g) => !g.archived_at).map((g) => <option key={g.id} value={g.id}>{g.name}{g.customer_count != null ? ` (${g.customer_count})` : ""}</option>)}</Select></Field> : null}
              {f.kind === "inactive" ? <Field label="No order for (days)"><Input type="number" min={1} className="tabular" value={f.days} onChange={(e) => set("days", e.target.value)} /></Field> : null}
              {f.kind === "birthday_month" ? <Field label="Month"><Select value={f.month} onChange={(e) => set("month", e.target.value)}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Select></Field> : null}
              {f.kind === "top_spenders" ? <Field label="How many"><Input type="number" min={1} className="tabular" value={f.limit} onChange={(e) => set("limit", e.target.value)} /></Field> : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader><CardTitle>Message</CardTitle></CardHeader>
            <CardBody className="space-y-3">
              <Field label="Text" hint="Placeholders: {name} the customer's name · {code} the coupon code · {balance} their khata balance"><Textarea className="min-h-32" value={f.body} onChange={(e) => set("body", e.target.value)} /></Field>
              <div className="flex flex-wrap gap-1 text-xs">{["{name}", "{code}", "{balance}"].map((p) => <button key={p} type="button" className="rounded-full border px-2 py-0.5 font-mono hover:bg-muted" onClick={() => set("body", f.body + p)}>{p}</button>)}</div>
              <Field label="Coupon (optional)" hint={promo ? `${promo.value}% off · code ${promo.coupon_code}${promo.unit_limit ? ` · ${promo.unit_limit} uses` : ""}` : "Attach a coupon promotion so {code} fills in and redemptions are tracked"}>
                <Select value={f.promotion_id} onChange={(e) => set("promotion_id", e.target.value)}><option value="">None</option>{coupons.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.coupon_code})</option>)}</Select>
              </Field>
            </CardBody>
          </Card>
          <Card>
            <CardHeader><CardTitle>When</CardTitle></CardHeader>
            <CardBody className="grid gap-3 sm:grid-cols-2">
              <Field label="Send"><Select value={f.when} onChange={(e) => set("when", e.target.value as Form["when"])}><option value="now">Now</option><option value="schedule">At a set time</option></Select></Field>
              {f.when === "schedule" ? <Field label="Date and time"><Input type="datetime-local" value={f.scheduled_at} onChange={(e) => set("scheduled_at", e.target.value)} /></Field> : null}
            </CardBody>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> Audience</CardTitle>{audience.isFetching ? <Spinner className="h-4 w-4" /> : null}</CardHeader>
            <CardBody className="space-y-2 text-sm">
              {f.kind === "group" && !f.group_id ? <p className="text-fg-muted">Choose a group to see the audience.</p> : a ? (
                <>
                  <div className="text-3xl font-semibold tabular">{a.reachable}</div>
                  <p className="text-fg-secondary">will receive this message</p>
                  <div className="flex flex-wrap gap-1 pt-1"><Badge variant="neutral">{a.total} in segment</Badge>{a.not_opted_in ? <Badge variant="warning">{a.not_opted_in} not opted in</Badge> : null}</div>
                </>
              ) : <p className="text-fg-muted">Counting…</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader><CardTitle>Preview</CardTitle></CardHeader>
            <CardBody><div className="rounded-xl rounded-tl-sm bg-success-soft px-3 py-2 text-sm whitespace-pre-wrap">{preview || <span className="text-fg-muted">Your message…</span>}</div></CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
