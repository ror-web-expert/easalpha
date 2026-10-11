"use client";
import { windowSentence } from "@/lib/business-day";
import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import type { Branch } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { useList, useSave } from "@/components/admin/crud";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, EmptyState, Field, Input, Loading } from "@/components/ui";

// SPEC "Business Hours is two fields, start and end, and the end may fall on the next day": the window every daily
// figure is derived from. Stored per branch (business_day_start, day_end_time) so each outlet can close at its own hour.

const DEFAULT_START = "06:01";
const DEFAULT_END = "02:01";

/** The sentence the screen states plainly, per SPEC. */

function BranchHoursCard({ branch }: { branch: Branch }) {
  const seed = { start: branch.business_day_start ?? DEFAULT_START, end: branch.day_end_time ?? DEFAULT_END };
  const [f, setF] = useState(seed);
  useEffect(() => { setF({ start: branch.business_day_start ?? DEFAULT_START, end: branch.day_end_time ?? DEFAULT_END }); }, [branch.business_day_start, branch.day_end_time]);
  const save = useSave<{ business_day_start: string; day_end_time: string }>(["branches"], (x) => `/branches/${x.id}`, { method: "PATCH", success: "Business hours saved" });
  const dirty = f.start !== seed.start || f.end !== seed.end;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{branch.name} <span className="font-mono text-xs text-fg-muted">{branch.code}</span> {branch.is_main ? <Badge variant="primary">main</Badge> : null}</CardTitle>
        <Button size="sm" disabled={!dirty || !f.start || !f.end} loading={save.isPending} onClick={() => save.mutate({ id: branch.id, business_day_start: f.start, day_end_time: f.end })}>Save</Button>
      </CardHeader>
      <CardBody className="grid gap-3 sm:grid-cols-2">
        <Field label="Start" hint="When the business day opens"><Input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
        <Field label="End" hint="May fall on the next day"><Input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
        <p className="text-sm text-fg-secondary sm:col-span-2">{windowSentence(f.start || "--:--", f.end || "--:--")}</p>
      </CardBody>
    </Card>
  );
}

export default function BusinessHoursPage() {
  const list = useList<Branch>("branches", "/branches");
  return (
    <>
      <PageHeader icon={Timer} title="Business Hours" description="The business day each branch reports on. The dashboard, every daily report and the attendance rules read this window; attendance treats the start as the last fallback for a shift start." />
      {list.isLoading ? <Loading /> : list.data?.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.data.map((b) => <BranchHoursCard key={b.id} branch={b} />)}
        </div>
      ) : <EmptyState title="No branches yet" hint="Add a branch under Store Management to set its business day." />}
    </>
  );
}
