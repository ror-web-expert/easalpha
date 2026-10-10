"use client";
// SPEC order story: who punched, completed and collected, the reopen-and-edit count, and a timeline of events
// stamped with user, role and time. An edit shows the item diff and the money diff.
import type { OrderStory as Story } from "@/lib/types";
import { formatDateTime } from "@/lib/dates";
import { Badge } from "@/components/ui";
import { eventTitle, reopenLine, storyLines } from "./order-helpers";

export function OrderStory({ story, currency }: { story: Story | undefined; currency?: string }) {
  if (!story) return null;
  const header = reopenLine(story.reopen_count, story.edit_count);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-secondary">Order story</h3>
        {header ? <Badge variant={story.reopen_count ? "warning" : "neutral"}>{header}</Badge> : null}
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2 rounded-lg border p-3 text-sm">
        <div><div className="text-xs text-fg-secondary">Punched by</div><div className="font-medium">{story.punched_by ?? "-"}</div></div>
        <div><div className="text-xs text-fg-secondary">Completed by</div><div className="font-medium">{story.completed_by ?? "-"}</div></div>
        <div><div className="text-xs text-fg-secondary">Collected by</div><div className="font-medium">{story.collected_by ?? "-"}</div></div>
      </div>
      {story.events.length ? (
        <ol className="relative ml-2 space-y-3 border-l pl-4">
          {story.events.map((e) => {
            const lines = storyLines(e, currency);
            return (
              <li key={e.id} className="relative text-sm">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden />
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium">{eventTitle(e.type)}</span>
                  <span className="text-xs text-fg-secondary tabular">{formatDateTime(e.at)}</span>
                </div>
                <div className="text-xs text-fg-secondary">{e.user ?? "System"}{e.role ? ` · ${e.role}` : ""}</div>
                {lines.length ? <ul className="mt-1 space-y-0.5 font-mono text-xs">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul> : null}
              </li>
            );
          })}
        </ol>
      ) : <p className="text-sm text-fg-muted">No events recorded yet.</p>}
    </div>
  );
}
