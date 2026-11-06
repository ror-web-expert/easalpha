"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ListChecks, CheckCircle2, Circle } from "lucide-react";
import { api } from "@/lib/api";
import type { ChecklistItem } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { useAction } from "@/components/admin/crud";
import { Badge, Button, Card, CardBody, Loading } from "@/components/ui";

// Where each step is done, and what ticks it. The hours step is the Business Hours screen (the business day window);
// it pointed at Store Management, which has no opening hours, so it never completed (S10).
const CHECKLIST_LINKS: Record<string, string> = {
  business_info: "/admin/settings/store", branch_hours: "/admin/settings/business-hours", menu: "/admin/products/catalog", tax: "/admin/products/tax-rates",
  payment_methods: "/admin/settings/payment-methods", staff: "/admin/staff/admin-staff", tables: "/admin/tables", printer: "/admin/settings/devices", devices: "/admin/settings/devices",
  whatsapp: "/admin/settings/whatsapp",
};
const CHECKLIST_HINTS: Record<string, string> = {
  business_info: "Name and phone on Store Profile, the logo on Branding. Ticks itself once all three are saved.",
  branch_hours: "Save each branch's business day on Business Hours, even if the default 06:01 to 02:01 suits you.",
  menu: "Add a category, then its products, or load the sample menu from the Catalog and change it.",
};

export default function ChecklistPage() {
  const q = useQuery({ queryKey: ["setup_checklist"], queryFn: () => api<{ data: ChecklistItem[]; done: number; total: number }>("/setup_checklist") });
  const complete = useAction<string>(["setup_checklist", "dashboard"], (key) => api(`/setup_checklist/${key}/complete`, { method: "POST" }), "Marked done");
  if (q.isLoading || !q.data) return <Loading />;
  const pct = q.data.total ? Math.round((q.data.done / q.data.total) * 100) : 0;
  return (
    <>
      <PageHeader icon={ListChecks} title="Setup checklist" description={`${q.data.done} of ${q.data.total} done (${pct}%).`} />
      <div className="mb-4 h-2 w-full max-w-xl rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
      <Card className="max-w-xl">
        <CardBody className="divide-y p-0">
          {q.data.data.map((i) => (
            <div key={i.id} className="flex items-center gap-3 px-4 py-3">
              {i.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : <Circle className="h-5 w-5 shrink-0 text-fg-muted" />}
              <div className="flex-1">
                <div className={`text-sm ${i.done ? "text-fg-secondary line-through" : "font-medium"}`}>{i.title}</div>
                {!i.done && CHECKLIST_HINTS[i.key] ? <p className="mt-0.5 text-xs text-fg-muted">{CHECKLIST_HINTS[i.key]}</p> : null}
                {i.plan_feature_off ? <Badge variant="outline">not in plan</Badge> : null}
              </div>
              {!i.done ? (
                <div className="flex gap-2">
                  {CHECKLIST_LINKS[i.key] ? <Link href={CHECKLIST_LINKS[i.key]}><Button size="sm">Go</Button></Link> : null}
                  <Button size="sm" variant="ghost" onClick={() => complete.mutate(i.key)}>Mark done</Button>
                </div>
              ) : null}
            </div>
          ))}
        </CardBody>
      </Card>
    </>
  );
}
