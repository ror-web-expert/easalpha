"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, KeyRound } from "lucide-react";
import { useSuperApi, superKey } from "@/components/super/api";
import { ErrorNote } from "@/components/super/shell";
import {
  BUSINESS_STATUSES, BUSINESS_STATUS_HINTS, businessStatusVariant, composeSupportSession, supportRequestCategoryVariant,
  supportSessionStatusVariant, type BusinessStatus, type MePayload, type SupportTokenResponse,
} from "@/components/super/super-helpers";
import { useAction } from "@/components/admin/crud";
import type { Page, SuperBusinessDetail, SuperSupportRequest } from "@/lib/types";
import { api, errorMessage } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Dialog, Field, Input, KeyValue, Loading, Select, Textarea } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";

export default function SuperBusinessPage() {
  const { id } = useParams<{ id: string }>();
  const sapi = useSuperApi();
  const qc = useQueryClient();
  const key = superKey("business", id);
  const detail = useQuery({ queryKey: key, queryFn: () => sapi<SuperBusinessDetail>(`/super/businesses/${id}`) });
  const openRequests = useQuery({ queryKey: superKey("support_requests", { business_id: id, status: "open" }), queryFn: () => sapi<Page<SuperSupportRequest>>("/super/support_requests", { query: { business_id: id, status: "open" } }) });
  const b = detail.data;

  const [statusOpen, setStatusOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<BusinessStatus>("trial");
  const [typedSlug, setTypedSlug] = useState("");
  const [trialEnd, setTrialEnd] = useState<string | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [opening, setOpening] = useState<string | null>(null);

  const patch = useAction<Record<string, unknown>>(["super"], (body) => sapi(`/super/businesses/${id}`, { method: "PATCH", body }), "Business updated");
  const requestAccess = useAction<string>(["super"], (r) => sapi("/super/support_sessions", { method: "POST", body: { business_id: id, reason: r } }), "Access requested. The owner sees it in their admin panel.");

  const changeStatus = () => {
    patch.mutate({ status: nextStatus }, { onSuccess: () => { setStatusOpen(false); setTypedSlug(""); } });
  };
  const plans = useQuery({ queryKey: superKey("plans"), queryFn: () => sapi<{ data: { id: string; code: string; name: string; active: boolean }[] }>("/super/plans") });
  const [planId, setPlanId] = useState<string | null>(null);
  const currentPlanId = (plans.data?.data ?? []).find((pl) => pl.code === detail.data?.plan?.code)?.id ?? null;
  const saveTrial = () => { if (trialEnd !== null) patch.mutate({ trial_ends_on: trialEnd || null }, { onSuccess: () => setTrialEnd(null) }); };

  /** Approved session -> owner-level admin token -> GET /me -> a Session shaped like POST /auth/login -> /admin in a new tab. */
  const openAsSupport = async (sessionId: string) => {
    setOpening(sessionId);
    // Open the tab synchronously so popup blockers allow it; point it at /admin once the session is stored.
    const win = window.open("about:blank", "_blank");
    try {
      const tok = await sapi<SupportTokenResponse>(`/super/support_sessions/${sessionId}/token`, { method: "POST" });
      const me = await api<MePayload>("/me", { auth: "none", headers: { Authorization: `Bearer ${tok.access_token}` } });
      const session = composeSupportSession(tok, me);
      useAuthStore.getState().setSession(session);
      if (win) win.location.href = "/admin"; else window.open("/admin", "_blank");
      toast.success("Opened the admin panel as support", `Access ends ${formatDateTime(tok.expires_at)}. Every action is logged for the owner.`);
      qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      win?.close();
      toast.error("Could not open as support", errorMessage(e));
    } finally { setOpening(null); }
  };

  if (detail.isLoading) return <Loading />;
  if (detail.error || !b) return <ErrorNote error={detail.error ?? new Error("Business not found")} />;

  const deletedGuard = nextStatus === "deleted" && typedSlug.trim() !== b.slug;

  return (
    <>
      <Link href="/super/businesses" className="mb-3 inline-block text-sm text-fg-secondary hover:text-primary hover:underline">← All businesses</Link>
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <Logo src={b.logo_key} name={b.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em] text-heading">{b.name}</h1>
            <Badge variant={businessStatusVariant(b.status)}>{titleCase(b.status)}</Badge>
            {b.read_only ? <Badge variant="danger">Read only</Badge> : null}
          </div>
          <p className="mt-0.5 text-sm text-fg-muted"><span className="font-mono">{b.slug}</span> · {b.country} · {b.currency} · {b.time_zone}{b.email ? ` · ${b.email}` : ""}{b.phone ? ` · ${b.phone}` : ""}</p>
        </div>
        <a href={`/store/${b.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-strong px-4 text-sm font-medium text-primary hover:bg-primary/8">Storefront <ExternalLink className="h-4 w-4" /></a>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Account</CardTitle></CardHeader>
          <CardBody>
            <KeyValue items={[
              { label: "Plan", value: b.plan ? `${b.plan.name} (${b.plan.code})` : "None" },
              { label: "Status", value: <Badge variant={businessStatusVariant(b.status)}>{titleCase(b.status)}</Badge> },
              { label: "Trial ends", value: b.trial_ends_on ? `${formatDate(b.trial_ends_on)} (${b.trial_days_left}d)` : "-" },
              { label: "Staff", value: b.staff },
              { label: "Devices", value: b.devices },
              { label: "Orders, 30 days", value: b.orders_30_days },
              { label: "Last order", value: b.last_order_at ? formatDateTime(b.last_order_at) : "Never" },
              { label: "Created", value: formatDateTime(b.created_at) },
            ]} />
            <h4 className="mb-1.5 mt-5 text-[12px] font-semibold uppercase tracking-[0.04em] text-fg-muted">Branches</h4>
            {b.branches.length === 0 ? <p className="text-sm text-fg-muted">No branches</p> : (
              <ul className="space-y-1 text-sm">
                {b.branches.map((br) => <li key={br.id} className="flex items-center justify-between gap-2"><span>{br.name} <span className="font-mono text-xs text-fg-muted">{br.code}</span>{br.city ? <span className="text-fg-secondary"> · {br.city}</span> : null}</span>{br.is_main ? <Badge variant="primary">Main</Badge> : br.archived_at ? <Badge variant="outline">Archived</Badge> : null}</li>)}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Lifecycle</CardTitle></CardHeader>
          <CardBody className="space-y-5">
            <div>
              <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-fg-muted">Change status</h4>
              <p className="mb-2 text-sm text-fg-secondary">{BUSINESS_STATUS_HINTS[b.status as BusinessStatus] ?? ""}</p>
              <div className="flex gap-2">
                <Select value={nextStatus} onChange={(e) => setNextStatus(e.target.value as BusinessStatus)} aria-label="New status">
                  {BUSINESS_STATUSES.map((s) => <option key={s} value={s} disabled={s === b.status}>{titleCase(s)}{s === b.status ? " (current)" : ""}</option>)}
                </Select>
                <Button variant={nextStatus === "deleted" ? "destructive" : "secondary"} disabled={nextStatus === b.status} onClick={() => setStatusOpen(true)}>Change</Button>
              </div>
            </div>
            <div>
              <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-fg-muted">Trial end</h4>
              <div className="flex gap-2">
                <Input type="date" value={trialEnd ?? b.trial_ends_on ?? ""} onChange={(e) => setTrialEnd(e.target.value)} aria-label="Trial ends on" />
                <Button variant="secondary" disabled={trialEnd === null || trialEnd === (b.trial_ends_on ?? "")} loading={patch.isPending} onClick={saveTrial}>Save</Button>
              </div>
              <p className="mt-1 text-xs text-fg-muted">Extending a trial keeps the business on the free trial until this date. Clear to remove the date.</p>
            </div>
            <div>
              <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-fg-muted">Plan</h4>
              <div className="flex gap-2">
                <Select value={planId ?? currentPlanId ?? ""} onChange={(e) => setPlanId(e.target.value)} aria-label="Plan">
                  {!currentPlanId ? <option value="">No plan</option> : null}
                  {(plans.data?.data ?? []).map((pl) => <option key={pl.id} value={pl.id}>{pl.name} ({pl.code}){pl.active ? "" : " · inactive"}</option>)}
                </Select>
                <Button variant="secondary" disabled={!planId || planId === currentPlanId} loading={patch.isPending} onClick={() => patch.mutate({ plan_id: planId }, { onSuccess: () => setPlanId(null) })}>Save</Button>
              </div>
              <p className="mt-1 text-xs text-fg-muted">{b.plan ? `Now on ${b.plan.name}: ${Object.entries(b.plan.limits).map(([k, v]) => `${titleCase(k)} ${v ?? "unlimited"}`).join(", ")}.` : "No plan yet."} The business can also pick a plan from its own Billing page.</p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Support access</CardTitle>
            <Button size="sm" variant="secondary" onClick={() => setAccessOpen(true)}><KeyRound className="h-4 w-4" /> Request access</Button>
          </CardHeader>
          <CardBody className="space-y-4">
            <p className="text-sm text-fg-secondary">Ask the owner for a one-hour login to their admin panel. They approve it in Settings → Support; every action is logged.</p>
            {b.support_sessions.length === 0 ? <p className="text-sm text-fg-muted">No access sessions yet.</p> : (
              <ul className="divide-y rounded-xl border">
                {b.support_sessions.map((s) => (
                  <li key={s.id} className="space-y-1.5 px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={supportSessionStatusVariant(s.status, s.active)}>{s.status === "approved" && !s.active ? "Expired" : titleCase(s.status)}</Badge>
                      <span className="text-xs text-fg-muted" title={formatDateTime(s.created_at)}>asked {formatDateTime(s.created_at)}</span>
                      {s.expires_at ? <span className="text-xs text-fg-muted">· {s.active ? "ends" : "ended"} {formatDateTime(s.expires_at)}</span> : null}
                    </div>
                    <p className="text-fg-secondary">{s.reason}</p>
                    {s.active ? <Button size="sm" loading={opening === s.id} onClick={() => openAsSupport(s.id)}>Open admin as support <ExternalLink className="h-4 w-4" /></Button> : null}
                  </li>
                ))}
              </ul>
            )}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <h4 className="text-[12px] font-semibold uppercase tracking-[0.04em] text-fg-muted">Open support requests</h4>
                <Link href={`/super/support?business_id=${b.id}`} className="text-xs font-medium text-primary hover:underline">All requests</Link>
              </div>
              {openRequests.isLoading ? <Loading /> : (openRequests.data?.data.length ?? 0) === 0 ? <p className="text-sm text-fg-muted">Nothing open from this business.</p> : (
                <ul className="divide-y rounded-xl border">
                  {openRequests.data!.data.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                      <Badge variant={supportRequestCategoryVariant(r.category)}>{titleCase(r.category)}</Badge>
                      <span className="min-w-0 flex-1 truncate font-medium">{r.subject}</span>
                      <span className="text-xs text-fg-muted">{formatDate(r.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      <Dialog open={statusOpen} onClose={() => setStatusOpen(false)} size="sm" title={`Set ${b.name} to ${titleCase(nextStatus)}?`} description={BUSINESS_STATUS_HINTS[nextStatus]}
        footer={<>
          <Button variant="secondary" onClick={() => setStatusOpen(false)}>Cancel</Button>
          <Button variant={nextStatus === "deleted" ? "destructive" : "primary"} disabled={deletedGuard} loading={patch.isPending} onClick={changeStatus}>{nextStatus === "deleted" ? "Delete business" : `Set ${titleCase(nextStatus)}`}</Button>
        </>}>
        {nextStatus === "deleted" ? (
          <Field label={`Type the slug to confirm: ${b.slug}`} hint="Staff and tills lose access at once.">
            <Input value={typedSlug} onChange={(e) => setTypedSlug(e.target.value)} autoFocus className="font-mono" />
          </Field>
        ) : null}
      </Dialog>

      <Dialog open={accessOpen} onClose={() => setAccessOpen(false)} size="sm" title="Request support access" description="The owner sees this reason and approves or denies it from their admin panel. Approved access lasts one hour."
        footer={<>
          <Button variant="secondary" onClick={() => setAccessOpen(false)}>Cancel</Button>
          <Button disabled={reason.trim().length < 5} loading={requestAccess.isPending} onClick={() => requestAccess.mutate(reason.trim(), { onSuccess: () => { setAccessOpen(false); setReason(""); } })}>Send request</Button>
        </>}>
        <Field label="Reason" hint="Say what you will look at, e.g. 'Checking why Z-report totals differ on 9 Oct'.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus rows={3} />
        </Field>
      </Dialog>
    </>
  );
}

function Logo({ src, name }: { src: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  // eslint-disable-next-line @next/next/no-img-element
  if (src && !broken) return <img src={src} alt="" onError={() => setBroken(true)} className="h-14 w-14 shrink-0 rounded-xl border bg-card object-contain p-1" />;
  return <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-primary-soft text-lg font-bold text-primary-ink" aria-hidden="true">{initials || "?"}</span>;
}
