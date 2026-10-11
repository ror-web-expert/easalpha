"use client";
import { useState } from "react";
import { Star, Trash2, Pencil } from "lucide-react";
import type { Review, ReviewsPage } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { usePagedList } from "@/lib/hooks";
import { api } from "@/lib/api";
import { Cards, DateRangePicker, FilterBar, LoadMore, PageHeader } from "@/components/admin/page";
import { useAction, useRemove } from "@/components/admin/crud";
import { averageRatingLabel, RATING_WORDS, ratingVariant, ratingWord, REVIEW_SOURCES } from "@/components/admin/marketing-helpers";
import { Badge, Button, Checkbox, ConfirmDialog, Dialog, EmptyRow, Field, Loading, Select, SummaryCard, Table, TBody, TD, TH, THead, TR, Textarea, orderTypeVariant } from "@/components/ui";

// SPEC Reviews: from the tablet and the website, each tied to an order and its amount, 1-to-5 rating shown as a word,
// optional comment, order type and date. Totals, average, 5-star and 1-star counts; filters by rating, source, type
// and a Pending (Unrated) state.

export default function ReviewsPage() {
  const [rating, setRating] = useState("");
  const [source, setSource] = useState("");
  const [orderType, setOrderType] = useState("");
  const [pending, setPending] = useState(false);
  const [range, setRange] = useState({ from: "", to: "" });
  const list = usePagedList<Review>(["reviews"], "/reviews", { rating, source, order_type: orderType, pending: pending ? "true" : "", from: range.from, to: range.to });
  const summary = (list.data?.pages[0] as ReviewsPage | undefined)?.summary;
  const [rate, setRate] = useState<{ review: Review; rating: string; comment: string } | null>(null);
  const [removing, setRemoving] = useState<Review | null>(null);
  const rateM = useAction<{ id: string; rating: number; comment: string }>(["reviews"], ({ id, ...body }) => api(`/reviews/${id}/rate`, { method: "PATCH", body }), "Review rated");
  const remove = useRemove(["reviews"], (id) => `/reviews/${id}`, "Review removed");
  return (
    <>
      <PageHeader icon={Star} title="Reviews" description="Ratings from the tablet and the website, each tied to an order. A review without a rating is Pending until someone rates it." />
      <Cards>
        <SummaryCard label="Total reviews" value={summary?.total ?? 0} sub={`${summary?.pending ?? 0} pending`} />
        <SummaryCard label="Average rating" value={averageRatingLabel(summary?.average)} sub={summary?.rated ? `${summary.rated} rated` : "Nobody has rated yet"} tone="info" />
        <SummaryCard label="5-star" value={summary?.five_star ?? 0} tone="success" />
        <SummaryCard label="1-star" value={summary?.one_star ?? 0} tone="danger" />
      </Cards>
      <FilterBar>
        <Select className="w-auto" value={rating} onChange={(e) => setRating(e.target.value)}><option value="">Any rating</option>{[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} - {RATING_WORDS[r]}</option>)}</Select>
        <Select className="w-auto" value={source} onChange={(e) => setSource(e.target.value)}><option value="">Any source</option>{REVIEW_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select>
        <Select className="w-auto" value={orderType} onChange={(e) => setOrderType(e.target.value)}><option value="">Any type</option><option value="dine_in">Dine-in</option><option value="takeaway">Takeaway</option><option value="delivery">Delivery</option><option value="walk_in">Walk-in</option><option value="online">Online</option></Select>
        <Checkbox label="Pending (unrated) only" checked={pending} onChange={(e) => setPending(e.target.checked)} />
        <DateRangePicker value={range} onChange={setRange} />
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>When</TH><TH>Order</TH><TH>Customer</TH><TH>Rating</TH><TH>Comment</TH><TH>Source</TH><TH>Type</TH><TH right>Order total</TH><TH right></TH></tr></THead>
          <TBody>
            {list.rows.length ? list.rows.map((r) => (
              <TR key={r.id}>
                <TD className="text-fg-secondary">{formatDateTime(r.created_at)}</TD>
                <TD className="font-mono text-xs">{r.order_label ?? "-"}</TD>
                <TD>{r.customer_name ?? <span className="text-fg-muted">Guest</span>}</TD>
                <TD><Badge variant={ratingVariant(r.rating)}>{r.rating ? `${r.rating} ` : ""}{r.rating_word ?? ratingWord(r.rating)}</Badge></TD>
                <TD className="max-w-xs truncate text-fg-secondary" title={r.comment ?? undefined}>{r.comment ?? "-"}</TD>
                <TD className="text-fg-secondary">{titleCase(r.source)}</TD>
                <TD>{r.order_type ? <Badge variant={orderTypeVariant(r.order_type)}>{titleCase(r.order_type)}</Badge> : "-"}</TD>
                <TD right>{r.order_total_minor != null ? formatMoney(r.order_total_minor) : "-"}</TD>
                <TD right className="whitespace-nowrap">
                  {r.pending ? <Button size="sm" variant="soft" onClick={() => setRate({ review: r, rating: "5", comment: r.comment ?? "" })}><Pencil className="h-4 w-4" /> Rate</Button> : null}
                  <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setRemoving(r)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                </TD>
              </TR>
            )) : <EmptyRow colSpan={9}>No reviews match these filters.</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
      <Dialog open={!!rate} onClose={() => setRate(null)} title="Rate this review" description={rate ? `Order ${rate.review.order_label ?? "-"}${rate.review.customer_name ? ` · ${rate.review.customer_name}` : ""}` : undefined} size="sm"
        footer={<><Button variant="secondary" onClick={() => setRate(null)}>Cancel</Button><Button loading={rateM.isPending} onClick={() => rate && rateM.mutate({ id: rate.review.id, rating: Number(rate.rating), comment: rate.comment }, { onSuccess: () => setRate(null) })}>Save rating</Button></>}>
        {rate ? (
          <div className="space-y-3">
            <Field label="Rating"><Select value={rate.rating} onChange={(e) => setRate({ ...rate, rating: e.target.value })}>{[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} - {RATING_WORDS[r]}</option>)}</Select></Field>
            <Field label="Comment"><Textarea value={rate.comment} onChange={(e) => setRate({ ...rate, comment: e.target.value })} placeholder="What the customer said" /></Field>
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title="Remove this review?" description="It disappears from the totals and the storefront." confirmLabel="Remove" destructive loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id, { onSuccess: () => setRemoving(null) })} />
    </>
  );
}
