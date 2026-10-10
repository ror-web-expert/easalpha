"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Send, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Campaign, CampaignStats } from "@/lib/types";
import { formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { Cards, PageHeader } from "@/components/admin/page";
import { campaignStatusVariant, segmentLabel } from "@/components/admin/phase3";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, ConfirmDialog, KeyValue, Loading, SummaryCard } from "@/components/ui";
import { toast } from "@/store/toast";

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["campaign", id], queryFn: () => api<Campaign>(`/campaigns/${id}`) });
  const stats = useQuery({ queryKey: ["campaign_stats", id], queryFn: () => api<CampaignStats>(`/campaigns/${id}/stats`), refetchInterval: (x) => (x.state.data && q.data?.status === "sending" ? 3000 : false) });
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["campaign", id] }); qc.invalidateQueries({ queryKey: ["campaign_stats", id] }); qc.invalidateQueries({ queryKey: ["campaigns"] }); };
  const send = useMutation({ mutationFn: () => api<Campaign>(`/campaigns/${id}/send`, { method: "POST" }), onSuccess: (c) => { toast.success(`Sent to ${c.sent_count}`, c.skipped_count ? `${c.skipped_count} skipped (not opted in)` : undefined); setConfirmSend(false); refresh(); }, onError: (e) => toast.error("Could not send", errorMessage(e)) });
  const del = useMutation({ mutationFn: () => api(`/campaigns/${id}`, { method: "DELETE" }), onSuccess: () => { toast.success(q.data?.status === "sent" ? "Campaign cancelled" : "Campaign deleted"); qc.invalidateQueries({ queryKey: ["campaigns"] }); router.replace("/admin/customers/campaigns"); }, onError: (e) => toast.error("Could not delete", errorMessage(e)) });
  const c = q.data;
  if (!c) return <Loading />;
  const s = stats.data ?? c.stats;
  const canSend = c.status === "draft" || c.status === "scheduled";
  const rate = (n: number) => (s && s.sent ? `${Math.round((n * 100) / s.sent)}%` : "-");
  return (
    <>
      <PageHeader icon={Megaphone} title={c.name} description={`${segmentLabel(c)} · created ${formatDateTime(c.created_at)}`} actions={<>
        <Badge variant={campaignStatusVariant(c.status)} className="h-8 px-3 text-sm">{titleCase(c.status)}</Badge>
        {canSend ? <Button onClick={() => setConfirmSend(true)}><Send className="h-4 w-4" /> Send now</Button> : null}
        {c.status !== "cancelled" ? <Button variant="ghost" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4 text-danger" /> {canSend ? "Delete" : "Cancel"}</Button> : null}
      </>} />
      <Cards>
        <SummaryCard label="Audience" value={s?.audience ?? c.audience_count} sub="Customers in the segment when sent" tone="neutral" />
        <SummaryCard label="Sent" value={s?.sent ?? c.sent_count} sub={`${s?.skipped ?? c.skipped_count} skipped (not opted in)`} tone="primary" />
        <SummaryCard label="Delivered" value={s?.delivered ?? 0} sub={`${rate(s?.delivered ?? 0)} of sent · ${s?.read ?? 0} read · ${s?.failed ?? 0} failed`} tone="success" />
        <SummaryCard label="Coupon redeemed" value={s?.redeemed ?? 0} sub={c.coupon_code ? `Code ${c.coupon_code}` : "No coupon attached"} tone="info" />
      </Cards>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Message</CardTitle></CardHeader>
          <CardBody><div className="rounded-xl rounded-tl-sm bg-success-soft px-3 py-2 text-sm whitespace-pre-wrap">{c.body}</div></CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardBody>
            <KeyValue items={[
              { label: "Status", value: titleCase(c.status) }, { label: "Segment", value: segmentLabel(c) }, { label: "Coupon", value: c.coupon_code ?? "-" },
              { label: "Scheduled for", value: c.scheduled_at ? formatDateTime(c.scheduled_at) : "-" }, { label: "Started", value: c.started_at ? formatDateTime(c.started_at) : "-" }, { label: "Finished", value: c.finished_at ? formatDateTime(c.finished_at) : "-" },
              { label: "Opted out after", value: s?.opted_out_after ?? 0 },
            ]} />
          </CardBody>
        </Card>
      </div>
      <ConfirmDialog open={confirmSend} onClose={() => setConfirmSend(false)} onConfirm={() => send.mutate()} title={`Send "${c.name}" now?`} description={`WhatsApp messages go to about ${c.audience_count} opted-in customers. This cannot be undone.`} confirmLabel="Send" loading={send.isPending} />
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={() => del.mutate()} title={canSend ? `Delete "${c.name}"?` : `Cancel "${c.name}"?`} description={canSend ? "The draft is removed." : "Marks the campaign cancelled; messages already sent stay sent."} confirmLabel={canSend ? "Delete" : "Cancel campaign"} destructive loading={del.isPending} />
    </>
  );
}
