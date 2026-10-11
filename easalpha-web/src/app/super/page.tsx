"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, Building2, Inbox, KeyRound, ShoppingBag, UserPlus } from "lucide-react";
import { useSuperApi, superKey } from "@/components/super/api";
import { SuperPageHeader, ErrorNote } from "@/components/super/shell";
import { businessStatusVariant, healthChecks, supportRequestCategoryVariant } from "@/components/super/super-helpers";
import type { Page, SuperHealth, SuperStats, SuperSupportRequest, SuperSupportSession } from "@/lib/types";
import { Badge, Card, CardBody, CardHeader, CardTitle, Loading, SummaryCard } from "@/components/ui";
import { formatAgo, formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";

export default function SuperDashboardPage() {
  const sapi = useSuperApi();
  const stats = useQuery({ queryKey: superKey("stats"), queryFn: () => sapi<SuperStats>("/super/stats"), refetchInterval: 60_000 });
  const health = useQuery({ queryKey: superKey("health"), queryFn: () => sapi<SuperHealth>("/super/health"), refetchInterval: 60_000 });
  const requests = useQuery({ queryKey: superKey("support_requests", { status: "open", limit: 5 }), queryFn: () => sapi<Page<SuperSupportRequest>>("/super/support_requests", { query: { status: "open", limit: 5 } }) });
  const sessions = useQuery({ queryKey: superKey("support_sessions"), queryFn: () => sapi<{ data: SuperSupportSession[] }>("/super/support_sessions") });

  const s = stats.data;
  const totalBusinesses = s ? Object.values(s.businesses).reduce((a, b) => a + b, 0) : 0;
  const pending = (sessions.data?.data ?? []).filter((x) => x.status === "requested");

  return (
    <>
      <SuperPageHeader title="Dashboard" description="Every restaurant on EasAlpha, the API's health and what needs you today." />
      <ErrorNote error={stats.error} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Businesses" icon={Building2} value={s ? totalBusinesses : "…"}
          sub={s ? <span className="flex flex-wrap gap-1">{Object.entries(s.businesses).map(([k, v]) => <Badge key={k} variant={businessStatusVariant(k)}>{titleCase(k)} {v}</Badge>)}</span> : undefined} />
        <SummaryCard label="Signups, 30 days" icon={UserPlus} tone="success" value={s ? s.signups_last_30_days : "…"} sub={s ? Object.entries(s.plans).map(([k, v]) => `${titleCase(k)} ${v}`).join(" · ") || "No plans yet" : undefined} />
        <SummaryCard label="Orders today" icon={ShoppingBag} tone="info" value={s ? s.orders_today : "…"} sub="Across every business" />
        <SummaryCard label="Open support requests" icon={Inbox} tone={s && s.open_support_requests > 0 ? "warning" : "neutral"} value={s ? s.open_support_requests : "…"} sub={<Link className="text-primary hover:underline" href="/super/support">Go to Support</Link>} />
        <SummaryCard label="Pending access sessions" icon={KeyRound} tone={s && s.pending_support_sessions > 0 ? "warning" : "neutral"} value={s ? s.pending_support_sessions : "…"} sub="Waiting for an owner to approve" />
        <SummaryCard label="API" icon={Activity} tone={health.data ? (health.data.database ? "success" : "danger") : "neutral"} value={health.data ? titleCase(health.data.status) : "…"} sub={health.data ? `v${health.data.version}` : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Needs you</CardTitle><Link href="/super/support" className="text-sm font-medium text-primary hover:underline">Open Support</Link></CardHeader>
          <CardBody className="space-y-5">
            <section>
              <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-fg-muted">Open support requests</h4>
              {requests.isLoading ? <Loading /> : (requests.data?.data.length ?? 0) === 0 ? <p className="text-sm text-fg-muted">No open requests. Nice.</p> : (
                <ul className="divide-y rounded-xl border">
                  {requests.data!.data.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                      <Badge variant={supportRequestCategoryVariant(r.category)}>{titleCase(r.category)}</Badge>
                      <span className="min-w-0 flex-1 truncate font-medium">{r.subject}</span>
                      <Link href={`/super/businesses/${r.business.id}`} className="text-fg-secondary hover:text-primary hover:underline">{r.business.name}</Link>
                      <span className="text-xs text-fg-muted" title={formatDateTime(r.created_at)}>{formatAgo(r.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-fg-muted">Pending access sessions</h4>
              {sessions.isLoading ? <Loading /> : pending.length === 0 ? <p className="text-sm text-fg-muted">No access requests waiting on an owner.</p> : (
                <ul className="divide-y rounded-xl border">
                  {pending.map((x) => (
                    <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                      <Badge variant="warning">Requested</Badge>
                      <Link href={`/super/businesses/${x.business.id}`} className="font-medium hover:text-primary hover:underline">{x.business.name}</Link>
                      <span className="min-w-0 flex-1 truncate text-fg-secondary">{x.reason}</span>
                      <span className="text-xs text-fg-muted" title={formatDateTime(x.created_at)}>{formatAgo(x.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Health</CardTitle>{health.data ? <span className="text-xs text-fg-muted" title={formatDateTime(health.data.time)}>checked {formatAgo(health.data.time)}</span> : null}</CardHeader>
          <CardBody>
            <ErrorNote error={health.error} />
            {health.isLoading ? <Loading /> : health.data ? (
              <ul className="space-y-2.5">
                {healthChecks(health.data).map((c) => (
                  <li key={c.label} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-fg-secondary">{c.label}</span>
                    <Badge variant={c.ok ? "success" : "danger"}>{c.value}</Badge>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 border-t pt-2.5 text-sm"><span className="text-fg-secondary">Live businesses</span><span className="font-medium tabular">{health.data.businesses}</span></li>
                <li className="flex items-center justify-between gap-3 text-sm"><span className="text-fg-secondary">Orders today</span><span className="font-medium tabular">{health.data.orders_today}</span></li>
              </ul>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
