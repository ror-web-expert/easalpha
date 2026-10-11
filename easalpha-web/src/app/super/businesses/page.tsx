"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSuperApi, superKey } from "@/components/super/api";
import { SuperPageHeader, ErrorNote } from "@/components/super/shell";
import { BUSINESS_STATUSES, businessStatusVariant } from "@/components/super/super-helpers";
import { FilterBar, LoadMore, SearchInput } from "@/components/admin/page";
import type { Page, SuperBusinessRow } from "@/lib/types";
import { Badge, EmptyRow, Loading, Select, TBody, TD, TH, THead, TR, Table } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { titleCase } from "@/lib/utils";

export default function SuperBusinessesPage() {
  const sapi = useSuperApi();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const list = useInfiniteQuery({
    queryKey: superKey("businesses", { q, status }),
    queryFn: ({ pageParam }) => sapi<Page<SuperBusinessRow>>("/super/businesses", { query: { q, status, cursor: pageParam, limit: 50 } }),
    initialPageParam: "" as string,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <>
      <SuperPageHeader title="Businesses" description="Every restaurant account: plan, status, trial and size. Click a row to manage it." />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Search name or slug" />
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {BUSINESS_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </Select>
        {list.data ? <span className="text-sm text-fg-muted">{rows.length}{list.hasNextPage ? "+" : ""} shown</span> : null}
      </FilterBar>
      <ErrorNote error={list.error} />
      <Table compact>
        <THead><tr><TH>Name</TH><TH>Slug</TH><TH>Plan</TH><TH>Status</TH><TH right>Members</TH><TH>Trial ends</TH><TH>Created</TH></tr></THead>
        <TBody>
          {list.isLoading ? <tr><td colSpan={7}><Loading /></td></tr> : rows.length === 0 ? <EmptyRow colSpan={7}>No businesses match</EmptyRow> : rows.map((b) => (
            <TR key={b.id} onClick={() => router.push(`/super/businesses/${b.id}`)}>
              <TD className="font-medium">{b.name}</TD>
              <TD className="font-mono text-xs text-fg-secondary">{b.slug}</TD>
              <TD>{b.plan?.name ?? <span className="text-fg-muted">None</span>}</TD>
              <TD><Badge variant={businessStatusVariant(b.status)}>{titleCase(b.status)}</Badge></TD>
              <TD right>{b.members}</TD>
              <TD>{b.trial_ends_on ? <>{formatDate(b.trial_ends_on)} <span className="text-xs text-fg-muted">({b.trial_days_left}d)</span></> : <span className="text-fg-muted">-</span>}</TD>
              <TD>{formatDate(b.created_at)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <LoadMore cursor={list.hasNextPage ? "more" : null} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
    </>
  );
}
