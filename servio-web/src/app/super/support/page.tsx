"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useSuperApi, superKey } from "@/components/super/api";
import { SuperPageHeader, ErrorNote } from "@/components/super/shell";
import { businessStatusVariant, supportRequestCategoryVariant, supportRequestStatusVariant, supportSessionStatusVariant } from "@/components/super/super-helpers";
import { useAction } from "@/components/admin/crud";
import { FilterBar, LoadMore } from "@/components/admin/page";
import type { Page, SuperSupportRequest, SuperSupportSession } from "@/lib/types";
import { Badge, Button, Card, CardBody, EmptyRow, EmptyState, Loading, Select, TBody, TD, TH, THead, TR, Table, Tabs, Textarea } from "@/components/ui";
import { formatAgo, formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";

type Tab = "requests" | "sessions";
type StatusFilter = "open" | "answered" | "closed" | "";

export default function SuperSupportPage() {
  return <Suspense fallback={<Loading />}><SupportScreen /></Suspense>;
}

function SupportScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const businessId = params.get("business_id") ?? "";
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "requests");
  const [status, setStatus] = useState<StatusFilter>(businessId ? "" : "open");

  return (
    <>
      <SuperPageHeader title="Support" description="Messages from restaurants and the access sessions owners have been asked to approve." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onChange={setTab} items={[{ value: "requests", label: "Requests" }, { value: "sessions", label: "Access sessions" }]} />
        {tab === "requests" ? (
          <FilterBar className="mb-0">
            <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Status">
              <option value="open">Open</option><option value="answered">Answered</option><option value="closed">Closed</option><option value="">All</option>
            </Select>
            {businessId ? <Button variant="ghost" size="sm" onClick={() => router.replace("/super/support")}>Clear business filter ×</Button> : null}
          </FilterBar>
        ) : null}
      </div>
      {tab === "requests" ? <Requests status={status} businessId={businessId} /> : <Sessions />}
    </>
  );
}

function Requests({ status, businessId }: { status: StatusFilter; businessId: string }) {
  const sapi = useSuperApi();
  const list = useInfiniteQuery({
    queryKey: superKey("support_requests", { status, business_id: businessId, page: true }),
    queryFn: ({ pageParam }) => sapi<Page<SuperSupportRequest>>("/super/support_requests", { query: { status, business_id: businessId, cursor: pageParam, limit: 30 } }),
    initialPageParam: "" as string,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  if (list.isLoading) return <Loading />;
  return (
    <>
      <ErrorNote error={list.error} />
      {rows.length === 0 ? <EmptyState title="No support requests" hint={status === "open" ? "Nothing is waiting on a reply." : "No requests match this filter."} /> : (
        <div className="space-y-3">{rows.map((r) => <RequestCard key={r.id} r={r} />)}</div>
      )}
      <LoadMore cursor={list.hasNextPage ? "more" : null} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
    </>
  );
}

function RequestCard({ r }: { r: SuperSupportRequest }) {
  const sapi = useSuperApi();
  const [reply, setReply] = useState("");
  const send = useAction<string>(["super"], (text) => sapi(`/super/support_requests/${r.id}/reply`, { method: "POST", body: { reply: text } }), "Reply sent. The business gets a notification.");
  const close = useAction<void>(["super"], () => sapi(`/super/support_requests/${r.id}/close`, { method: "POST" }), "Request closed");
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={supportRequestStatusVariant(r.status)}>{titleCase(r.status)}</Badge>
          <Badge variant={supportRequestCategoryVariant(r.category)}>{titleCase(r.category)}</Badge>
          <Link href={`/super/businesses/${r.business.id}`} className="font-medium text-heading hover:text-primary hover:underline">{r.business.name}</Link>
          <Badge variant={businessStatusVariant(r.business.status)}>{titleCase(r.business.status)}</Badge>
          <span className="text-sm text-fg-secondary">{r.by?.name ?? "Unknown"}{r.by?.email ? ` · ${r.by.email}` : ""}</span>
          <span className="ml-auto text-xs text-fg-muted" title={formatDateTime(r.created_at)}>{formatAgo(r.created_at)}</span>
        </div>
        <div>
          <h3 className="text-base font-semibold leading-6 text-heading">{r.subject}</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm">{r.message}</p>
          {r.page ? <p className="mt-1 text-xs text-fg-muted">Sent from <span className="font-mono">{r.page}</span></p> : null}
        </div>
        {r.reply ? (
          <div className="rounded-xl bg-primary-soft/60 px-4 py-3 text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.04em] text-fg-muted">EasAlpha replied {r.replied_at ? formatDateTime(r.replied_at) : ""}</div>
            <p className="whitespace-pre-wrap">{r.reply}</p>
          </div>
        ) : null}
        {r.status !== "closed" ? (
          <div className="space-y-2 border-t pt-3">
            <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder={r.reply ? "Send another reply…" : "Write a reply…"} rows={2} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="sm" loading={close.isPending} onClick={() => close.mutate()}>Close</Button>
              <Button size="sm" disabled={reply.trim().length === 0} loading={send.isPending} onClick={() => send.mutate(reply.trim(), { onSuccess: () => setReply("") })}>Send reply</Button>
            </div>
          </div>
        ) : <p className="text-xs text-fg-muted">Closed {r.closed_at ? formatDateTime(r.closed_at) : ""}</p>}
      </CardBody>
    </Card>
  );
}

function Sessions() {
  const sapi = useSuperApi();
  const list = useQuery({ queryKey: superKey("support_sessions"), queryFn: () => sapi<{ data: SuperSupportSession[] }>("/super/support_sessions") });
  const rows = list.data?.data ?? [];
  return (
    <>
      <ErrorNote error={list.error} />
      <Table compact>
        <THead><tr><TH>Business</TH><TH>Status</TH><TH>Reason</TH><TH>Asked</TH><TH>Approved</TH><TH>Expires</TH></tr></THead>
        <TBody>
          {list.isLoading ? <tr><td colSpan={6}><Loading /></td></tr> : rows.length === 0 ? <EmptyRow colSpan={6}>No access sessions yet</EmptyRow> : rows.map((s) => (
            <TR key={s.id}>
              <TD><Link href={`/super/businesses/${s.business.id}`} className="font-medium hover:text-primary hover:underline">{s.business.name}</Link></TD>
              <TD><Badge variant={supportSessionStatusVariant(s.status, s.active)}>{s.status === "approved" && !s.active ? "Expired" : titleCase(s.status)}</Badge></TD>
              <TD className="max-w-[360px] truncate" title={s.reason}>{s.reason}</TD>
              <TD className="whitespace-nowrap">{formatDateTime(s.created_at)}</TD>
              <TD className="whitespace-nowrap">{s.approved_at ? formatDateTime(s.approved_at) : <span className="text-fg-muted">-</span>}</TD>
              <TD className="whitespace-nowrap">{s.expires_at ? formatDateTime(s.expires_at) : <span className="text-fg-muted">-</span>}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </>
  );
}
