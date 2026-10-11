"use client";
import { useState } from "react";
import { Star } from "lucide-react";
import type { Review } from "@/lib/types";
import { errorMessage } from "@/lib/api";
import { createReview, ratingWord } from "@/lib/pos-discounts";
import { Button, Textarea } from "@/components/ui";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";

/**
 * SPEC Reviews "from the tablet": after an order is completed the receipt step offers a review tied to that order, a
 * 1-to-5 rating shown as a word and an optional comment (POST /reviews with source "tablet"). It can be skipped, and
 * it only shows while the till is online because the review has to reach the server.
 */
export function ReviewCard({ orderId, orderLabel, className }: { orderId: string; orderLabel?: string | null; className?: string }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<Review | null>(null);
  const [skipped, setSkipped] = useState(false);
  if (skipped) return null;
  const shown = hover || rating;
  const send = async () => {
    if (!rating) return;
    setSending(true);
    try { setDone(await createReview({ order_id: orderId, rating, comment })); }
    catch (e) { toast.error("Could not save the review", errorMessage(e)); }
    finally { setSending(false); }
  };
  return (
    <div className={cn("rounded-lg border p-3", className)} data-testid="review-card">
      <div className="mb-1 text-sm font-semibold">{done ? "Thank you" : "Leave a review"}</div>
      {done ? (
        <p className="text-sm text-fg-secondary">{orderLabel ?? "This order"} rated <strong>{done.rating_word ?? ratingWord(done.rating)}</strong>{done.comment ? ` with a comment` : ""}.</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-fg-muted">How was {orderLabel ?? "the order"}? Tap a star; the comment is optional.</p>
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} ${n === 1 ? "star" : "stars"}: ${ratingWord(n)}`} onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} className="grid h-11 w-11 place-items-center rounded-md hover:bg-muted">
                <Star className={cn("h-7 w-7", n <= shown ? "fill-warning text-warning" : "text-fg-muted")} />
              </button>
            ))}
            <span className="ml-2 min-w-20 text-sm font-medium">{shown ? ratingWord(shown) : ""}</span>
          </div>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment (optional)" className="mt-2 min-h-16 text-base" aria-label="Review comment" />
          <div className="mt-2 flex gap-2">
            <Button className="flex-1" size="lg" onClick={send} loading={sending} disabled={!rating}>Send review</Button>
            <Button variant="ghost" size="lg" onClick={() => setSkipped(true)} disabled={sending}>Skip</Button>
          </div>
        </>
      )}
    </div>
  );
}
