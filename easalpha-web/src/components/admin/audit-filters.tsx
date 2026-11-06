"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AuditEntities, Membership, Page } from "@/lib/types";
import type { BadgeVariant } from "@/components/ui";
import { Input, Select } from "@/components/ui";
import { DateRangePicker, FilterBar, type DateRange } from "@/components/admin/page";

export interface AuditFilters { range: DateRange; userId: string; action: string; table: string; recordId: string }

/** Query params for /audit_logs, /audit_logs/insights and the CSV export; empty values are left out. */
export function auditQuery(f: AuditFilters): Record<string, string> {
  const pairs: [string, string][] = [
    ["from", f.range.from], ["to", f.range.to], ["user_id", f.userId], ["action_name", f.action], ["table_name", f.table], ["record_id", f.recordId.trim()],
  ];
  return Object.fromEntries(pairs.filter(([, v]) => v !== ""));
}

const DANGER = ["void", "refund", "delete", "bulk_delete", "cancel", "revoke_device", "pin_failed", "stock_cancel", "goods_receipt_cancel", "po_cancel", "qr_reject", "reverse"];
// Changes worth a second look, including what the server corrected or let through when an offline sale was replayed.
const WARNING = ["price_change", "permission_change", "settings_change", "status_change", "approve", "client_time_clamped", "offline_payment_adjusted", "khata_over_limit_offline", "khata_overdue_offline"];

export function actionVariant(action: string): BadgeVariant {
  if (DANGER.includes(action)) return "danger";
  if (WARNING.includes(action)) return "warning";
  return "neutral";
}

/** The label the API gives an action ("Till clock corrected"); an action it has no label for reads as its words. */
export function actionLabel(action: string, labels?: Record<string, string>): string {
  return labels?.[action] ?? action.replace(/_/g, " ");
}

export function useAuditOptions() {
  const entities = useQuery({ queryKey: ["audit_logs", "entities"], queryFn: () => api<AuditEntities>("/audit_logs/entities"), staleTime: 5 * 60_000 });
  const staff = useQuery({ queryKey: ["staff", "all"], queryFn: () => api<Page<Membership>>("/staff", { query: { limit: 200 } }), staleTime: 5 * 60_000 });
  const actors = (staff.data?.data ?? []).map((m) => ({ id: m.user_id, name: m.user?.name ?? m.user_id.slice(0, 8) })).sort((a, b) => a.name.localeCompare(b.name));
  return { actions: entities.data?.actions ?? [], labels: entities.data?.action_labels ?? {}, entities: entities.data?.data ?? [], actors };
}

/** Date range, actor, action and entity filters; the record id box only on the Log tab. */
export function AuditFilterBar({ value, onChange, showRecord, children }: { value: AuditFilters; onChange: (f: AuditFilters) => void; showRecord?: boolean; children?: React.ReactNode }) {
  const opts = useAuditOptions();
  const set = (patch: Partial<AuditFilters>) => onChange({ ...value, ...patch });
  return (
    <FilterBar>
      <DateRangePicker value={value.range} onChange={(range) => set({ range })} />
      <Select className="w-auto" value={value.userId} onChange={(e) => set({ userId: e.target.value })} aria-label="Actor">
        <option value="">All actors</option>
        {opts.actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </Select>
      <Select className="w-auto" value={value.action} onChange={(e) => set({ action: e.target.value })} aria-label="Action">
        <option value="">All actions</option>
        {opts.actions.map((a) => <option key={a} value={a}>{actionLabel(a, opts.labels)}</option>)}
      </Select>
      <Select className="w-auto" value={value.table} onChange={(e) => set({ table: e.target.value })} aria-label="Entity">
        <option value="">All entities</option>
        {opts.entities.map((t) => <option key={t} value={t}>{t}</option>)}
      </Select>
      {showRecord ? <Input className="w-48 font-mono text-xs" placeholder="Record ID" value={value.recordId} onChange={(e) => set({ recordId: e.target.value })} aria-label="Record ID" /> : null}
      {children}
    </FilterBar>
  );
}
