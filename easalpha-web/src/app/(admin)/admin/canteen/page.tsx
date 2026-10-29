"use client";
// Canteen, Today: what is being served now, how many meals so far, each session's plan and the latest tokens.
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Fingerprint, MonitorSmartphone, Utensils } from "lucide-react";
import { api } from "@/lib/api";
import type { CanteenToday, MealClaim } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatTime } from "@/lib/dates";
import { Cards, PageHeader } from "@/components/admin/page";
import { Badge, Card, CardBody, CardHeader, CardTitle, EmptyRow, Loading, SummaryCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { sessionWindow } from "@/components/canteen/helpers";

export default function CanteenTodayPage() {
  const today = useQuery({ queryKey: ["canteen_today_admin"], queryFn: () => api<CanteenToday>("/canteen/today"), refetchInterval: 15_000 });
  const claims = useQuery({ queryKey: ["canteen_claims_admin_recent"], queryFn: () => api<{ data: MealClaim[] }>("/canteen/claims", { query: { limit: 25 } }), refetchInterval: 15_000, select: (r) => r.data });
  const t = today.data;
  return (
    <>
      <PageHeader icon={Utensils} title="Canteen" description="Workers scan a finger at the kiosk, take one dish per meal session and collect with a token. Every meal goes on the worker's account."
        actions={<><Link href="/admin/canteen/plans" className="inline-flex h-10 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium text-fg hover:bg-muted"><CalendarDays className="h-4 w-4" /> Plan meals</Link><Link href="/admin/settings/devices" className="inline-flex h-10 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium text-fg hover:bg-muted"><MonitorSmartphone className="h-4 w-4" /> Kiosks</Link></>} />
      {today.isLoading || !t ? <Loading /> : (
        <>
          <Cards>
            <SummaryCard label="Serving now" value={t.session ? t.session.name : "Between meals"} sub={t.session ? sessionWindow(t.session) : t.sessions.map(sessionWindow).join(", ") || "No sessions set up"} />
            <SummaryCard label="Meals today" value={t.counts.claimed} tone="primary" />
            <SummaryCard label="Collected" value={t.counts.served} tone="success" sub={`${t.counts.claimed - t.counts.served} waiting at the counter`} />
            <SummaryCard label="Workers" value={t.counts.workers} sub="active employees" />
          </Cards>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card>
              <CardHeader><CardTitle>Plans for today</CardTitle><Link href="/admin/canteen/plans" className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-sm font-medium text-primary hover:bg-muted">Edit</Link></CardHeader>
              <CardBody className="space-y-4">
                {t.plans.length ? t.plans.map((p) => (
                  <div key={p.id}>
                    <div className="mb-1 flex items-center gap-2 text-sm font-semibold">{p.session?.name}{p.session ? <span className="font-normal text-fg-muted">{p.session.starts_at} to {p.session.ends_at}</span> : null}<Badge variant={p.status === "published" ? "success" : "warning"}>{p.status}</Badge></div>
                    <Table>
                      <THead><tr><TH>Dish</TH><TH right>Worker pays</TH><TH right>Planned</TH><TH right>Taken</TH><TH>Progress</TH></tr></THead>
                      <TBody>{p.items.map((i) => (
                        <TR key={i.id}>
                          <TD className="font-medium">{i.name}{i.sold_out ? <Badge variant="danger" className="ml-2">finished</Badge> : null}</TD>
                          <TD right className="tabular">{formatMoney(i.worker_price_minor ?? i.price_minor)}{i.worker_price_minor != null && i.worker_price_minor < i.price_minor ? <div className="text-xs text-fg-muted">of {formatMoney(i.price_minor)}</div> : null}</TD>
                          <TD right className="tabular">{i.planned_qty ?? "open"}</TD>
                          <TD right className="tabular">{i.claims_count}</TD>
                          <TD><div className="h-2 w-32 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${i.planned_qty ? Math.min(100, Math.round((i.claims_count / i.planned_qty) * 100)) : 0}%` }} /></div></TD>
                        </TR>
                      ))}</TBody>
                    </Table>
                  </div>
                )) : <p className="text-sm text-fg-muted">No plan for today yet. <Link className="text-primary" href="/admin/canteen/plans">Plan the meals for today</Link>, then publish so the kiosk can serve.</p>}
              </CardBody>
            </Card>
            <Card>
              <CardHeader><CardTitle>Latest tokens</CardTitle><Link href="/admin/canteen/claims" className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-sm font-medium text-primary hover:bg-muted">All meals</Link></CardHeader>
              <CardBody className="p-0">
                <Table>
                  <THead><tr><TH>Token</TH><TH>Worker</TH><TH>Dish</TH><TH>Time</TH><TH>Status</TH></tr></THead>
                  <TBody>{claims.data?.length ? claims.data.map((c) => (
                    <TR key={c.id}><TD className="font-mono font-semibold">{c.token_label}</TD><TD>{c.employee_name}</TD><TD className="text-fg-secondary">{c.dish}</TD><TD className="tabular">{formatTime(c.scanned_at)}</TD><TD><Badge variant={c.status === "served" ? "success" : c.status === "cancelled" ? "danger" : "info"}>{c.status}</Badge></TD></TR>
                  )) : <EmptyRow colSpan={5}>No meals yet today.</EmptyRow>}</TBody>
                </Table>
              </CardBody>
            </Card>
          </div>
          <p className="mt-4 text-sm text-fg-muted"><Fingerprint className="mr-1 inline h-4 w-4" />Set a machine up as a kiosk or counter from <code>/setup</code> on that machine (Canteen kiosk, Canteen counter), or pair it from Devices with kind Kiosk. Workers are enrolled under <Link className="text-primary" href="/admin/canteen/workers">Workers</Link>.</p>
        </>
      )}
    </>
  );
}
