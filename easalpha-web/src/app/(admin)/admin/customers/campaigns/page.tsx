"use client";
import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";
import type { Campaign } from "@/lib/types";
import { formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { usePagedList } from "@/lib/hooks";
import { LoadMore, PageHeader } from "@/components/admin/page";
import { campaignStatusVariant, segmentLabel } from "@/components/admin/phase3";
import { Badge, Button, EmptyRow, Loading, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default function CampaignsPage() {
  const list = usePagedList<Campaign>(["campaigns"], "/campaigns");
  return (
    <>
      <PageHeader icon={Megaphone} title="Campaigns" description="WhatsApp messages to a customer segment. Only opted-in customers receive them; replying STOP opts out." actions={<Link href="/admin/customers/campaigns/new"><Button><Plus className="h-4 w-4" /> New campaign</Button></Link>} />
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>Campaign</TH><TH>Segment</TH><TH>Status</TH><TH>When</TH><TH right>Audience</TH><TH right>Sent</TH><TH right>Skipped</TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((c) => (
              <TR key={c.id}>
                <TD><Link href={`/admin/customers/campaigns/${c.id}`} className="font-medium text-primary hover:underline">{c.name}</Link>{c.coupon_code ? <Badge variant="accent" className="ml-2 font-mono">{c.coupon_code}</Badge> : null}<div className="max-w-md truncate text-xs text-fg-muted">{c.body}</div></TD>
                <TD className="text-fg-secondary">{segmentLabel(c)}</TD>
                <TD><Badge variant={campaignStatusVariant(c.status)}>{titleCase(c.status)}</Badge></TD>
                <TD className="text-fg-secondary">{c.status === "scheduled" && c.scheduled_at ? `Scheduled ${formatDateTime(c.scheduled_at)}` : c.finished_at ? formatDateTime(c.finished_at) : formatDateTime(c.created_at)}</TD>
                <TD right>{c.audience_count}</TD>
                <TD right className="font-medium">{c.sent_count}</TD>
                <TD right className="text-fg-secondary">{c.skipped_count}</TD>
              </TR>
            )) : <EmptyRow colSpan={7}>No campaigns yet. Try an Eid offer to everyone, or a come-back coupon for inactive customers.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
    </>
  );
}
