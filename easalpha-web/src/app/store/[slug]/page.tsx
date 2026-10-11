"use client";
import { useParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { Loading } from "@/components/ui";
import { StorefrontNotFound, StorefrontView, useStorefront } from "@/components/store/storefront";

// Public storefront at /store/<slug>, driven by Website Config. Unpublished or unknown slugs show a plain 404 state.

export default function StorePage() {
  const { slug } = useParams<{ slug: string }>();
  const q = useStorefront(slug);
  if (q.isLoading) return <main className="min-h-screen bg-page"><Loading /></main>;
  if (q.error || !q.data) {
    if (q.error instanceof ApiError && q.error.status !== 404 && q.error.status !== 0) return <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 px-4 text-center"><h1 className="text-[22px] leading-7">Something went wrong</h1><p className="text-sm text-fg-secondary">{q.error.message}</p></main>;
    return <StorefrontNotFound slug={slug} />;
  }
  return <StorefrontView slug={slug} data={q.data} />;
}
