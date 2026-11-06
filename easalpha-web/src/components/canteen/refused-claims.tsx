"use client";
// Canteen, Today: the meals a kiosk took offline that the server refused when they arrived (6 Nov 2026 review, R19).
// The worker has the food and the token, nobody's account has the money: a manager puts it on the worker's account by
// hand and marks it fixed, or lets it go. Each stays listed until then (Settings, Needs attention shows them too).
import { AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import type { CanteenRefusedClaim } from "@/lib/types";
import { formatDateTime } from "@/lib/dates";
import { useAction } from "@/components/admin/crud";
import { Button, Card, CardBody, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export function RefusedClaimsCard({ rows, total }: { rows: CanteenRefusedClaim[]; total?: number }) {
  const resolve = useAction<{ id: string; resolution: "fixed" | "dismissed" }>(["canteen_today_admin", "sync_rejections", "dashboard"],
    ({ id, resolution }) => api(`/canteen/refused/${id}/resolve`, { method: "POST", body: { resolution } }), "Resolved");
  if (!rows.length) return null;
  const count = Math.max(total ?? 0, rows.length);
  return (
    <Card className="mb-4 border-danger/40" data-testid="refused-claims">
      <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-danger" /> Refused at sync ({count})</CardTitle></CardHeader>
      <CardBody className="space-y-3 p-0">
        <p className="px-5 pt-4 text-sm text-fg-muted">A kiosk took these meals while it was offline and the server refused them when they arrived, so they are on no worker&apos;s account. Put a meal on the worker&apos;s account by hand and mark it fixed, or dismiss it.{count > rows.length ? ` The latest ${rows.length} are shown.` : ""}</p>
        <Table>
          <THead><tr><TH>Taken</TH><TH>Worker</TH><TH>Dish</TH><TH>Token</TH><TH>Kiosk</TH><TH>Why it was refused</TH><TH right></TH></tr></THead>
          <TBody>{rows.map((r) => (
            <TR key={r.id}>
              <TD className="tabular text-fg-secondary">{formatDateTime(r.taken_at ?? r.refused_at)}</TD>
              <TD className="font-medium">{r.employee_name ?? (r.fingerprint_id ? `Finger ${r.fingerprint_id}` : "Unknown worker")}</TD>
              <TD className="text-fg-secondary">{[r.dish, r.session].filter(Boolean).join(" · ")}</TD>
              <TD className="font-mono">{r.token_label}</TD>
              <TD>{r.device}</TD>
              <TD className="max-w-md text-danger">{r.message}</TD>
              <TD right>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="secondary" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r.id, resolution: "fixed" })}>Mark fixed</Button>
                  <Button size="sm" variant="ghost" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r.id, resolution: "dismissed" })}>Dismiss</Button>
                </div>
              </TD>
            </TR>
          ))}</TBody>
        </Table>
      </CardBody>
    </Card>
  );
}
