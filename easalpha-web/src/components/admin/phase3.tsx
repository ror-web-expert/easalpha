"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { API_URL, ApiError } from "@/lib/api";
import { api } from "@/lib/api";
import type { BadgeVariant } from "@/components/ui";
import type { Branch, Campaign, Customer, Department, Employee, Membership, Page, Role, SalaryComponent } from "@/lib/types";
import { useDebounced } from "@/lib/hooks";
import { useList } from "@/components/admin/crud";
import { Input } from "@/components/ui";
import { useAuthStore } from "@/store/auth";
import { cn, titleCase } from "@/lib/utils";

// ---- Badges ----
export function campaignStatusVariant(s: string | null | undefined): BadgeVariant {
  switch (s) {
    case "draft": return "neutral";
    case "scheduled": return "info";
    case "sending": return "warning";
    case "sent": return "success";
    case "cancelled": return "danger";
    default: return "neutral";
  }
}
export function reservationStatusVariant(s: string | null | undefined): BadgeVariant {
  switch (s) {
    case "booked": return "info";
    case "confirmed": return "primary";
    case "seated": return "success";
    case "completed": return "neutral";
    case "no_show": return "warning";
    case "cancelled": return "danger";
    default: return "neutral";
  }
}
export function attendanceStatusVariant(s: string | null | undefined): BadgeVariant {
  switch (s) {
    case "present": return "success";
    case "half_day": return "warning";
    case "absent": return "danger";
    case "leave": return "info";
    case "holiday": return "accent";
    default: return "neutral";
  }
}
export function decisionVariant(s: string | null | undefined): BadgeVariant {
  switch (s) {
    case "pending": return "warning";
    case "approved": return "info";
    case "rejected": case "cancelled": return "danger";
    case "paid": return "success";
    case "repaid": return "primary";
    case "generated": return "info";
    default: return "neutral";
  }
}
export function loyaltyKindVariant(k: string | null | undefined): BadgeVariant {
  switch (k) {
    case "earn": return "success";
    case "redeem": return "primary";
    case "refund": return "info";
    case "adjust": return "warning";
    default: return "neutral";
  }
}

// ---- Labels ----
export const SEGMENT_KINDS: { value: string; label: string; hint: string }[] = [
  { value: "all", label: "Everyone", hint: "Every customer with a phone number" },
  { value: "group", label: "Customer group", hint: "Members of one group, e.g. VIP or Corporate" },
  { value: "inactive", label: "Inactive", hint: "No order in the last N days" },
  { value: "birthday_month", label: "Birthday month", hint: "Birthday falls in the chosen month" },
  { value: "top_spenders", label: "Top spenders", hint: "The N customers who have spent the most" },
  { value: "khata_due", label: "Khata due", hint: "Customers with an outstanding balance" },
];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function segmentLabel(c: Campaign): string {
  const k = SEGMENT_KINDS.find((s) => s.value === c.segment.kind)?.label ?? titleCase(String(c.segment.kind));
  if (c.segment.kind === "inactive") return `${k} ${c.segment.days ?? 30}+ days`;
  if (c.segment.kind === "top_spenders") return `Top ${c.segment.limit ?? 50} spenders`;
  return k;
}
export const APPLIES_LABELS: Record<string, string> = { order_taker: "Order taker", waiter: "Waiter", cashier: "Cashier", rider: "Rider" };
export const BASIS_LABELS: Record<string, string> = { percent_of_sales: "% of sales", per_order: "Rs per order", per_item: "Rs per item" };

// ---- Lookups ----
export function useEmployees(query: Record<string, string | undefined> = {}) { return useList<Employee>("employees", "/employees", query); }
export function useDepartments() { return useList<Department>("departments", "/employees/departments"); }
export function useSalaryComponents() { return useList<SalaryComponent>("salary_components", "/employees/components"); }
export function useStaff() { return useList<Membership>("staff", "/staff", { status: "active" }); }
export function useRoles() { return useList<Role>("roles", "/roles"); }
export function useBranches() { return useList<Branch>("branches", "/branches"); }
export function staffName(staff: Membership[] | undefined, id: string | null | undefined): string {
  if (!id) return "-";
  return staff?.find((m) => m.id === id)?.user?.name ?? "…";
}

/** "YYYY-MM" for month pickers */
export function isoMonth(d: Date = new Date()): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
export function monthLabel(ym: string): string { const [y, m] = ym.split("-").map(Number); return y && m ? `${MONTHS[m - 1]} ${y}` : ym; }
/** Local "YYYY-MM-DDTHH:mm" for datetime-local inputs */
export function toLocalInput(d: Date): string { const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
export function fromLocalInput(v: string): string | null { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
export function formatMinutes(min: number | null | undefined): string { const n = Number(min ?? 0); if (!n) return "0m"; const h = Math.floor(n / 60); const m = n % 60; return h ? `${h}h ${m}m` : `${m}m`; }

/** Fetches a file with the admin token and triggers a browser download. */
export async function downloadFile(path: string, query: Record<string, string | undefined>, fallbackName: string) {
  const s = useAuthStore.getState();
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) params.set(k, v);
  const headers: Record<string, string> = {};
  if (s.session?.access_token) headers.Authorization = `Bearer ${s.session.access_token}`;
  if (s.branchId) headers["X-Branch-Id"] = s.branchId;
  const res = await fetch(`${API_URL}${path}?${params}`, { headers });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json())?.error?.message ?? msg; } catch {}
    throw new ApiError(`http_${res.status}`, msg || "Download failed", res.status);
  }
  const blob = await res.blob();
  const name = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Customer picker ----
export function CustomerPicker({ value, onPick, onClear, className, placeholder = "Search name or phone" }: { value: Customer | null; onPick: (c: Customer) => void; onClear?: () => void; className?: string; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q, 250);
  const wrap = useRef<HTMLDivElement>(null);
  const results = useQuery({ queryKey: ["customers_pick", dq], queryFn: () => api<Page<Customer>>("/customers", { query: { q: dq, limit: 15 } }), enabled: open, select: (r) => r.data.filter((c) => !c.is_walk_in) });
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={wrap} className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
      <Input className="pl-9" value={open ? q : value ? `${value.name}${value.phone ? ` · ${value.phone}` : ""}` : q} placeholder={placeholder} onFocus={() => { setOpen(true); setQ(""); }} onChange={(e) => { setQ(e.target.value); setOpen(true); if (!e.target.value && onClear) onClear(); }} />
      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border bg-card shadow-lg">
          {results.isLoading ? <div className="px-3 py-2 text-sm text-fg-muted">Searching…</div> : results.data?.length ? results.data.map((c) => (
            <button key={c.id} type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(c); setOpen(false); setQ(""); }}>
              <span className="truncate"><span className="font-medium">{c.name}</span>{c.phone ? <span className="ml-2 text-xs text-fg-muted">{c.phone}</span> : null}</span>
              <span className="shrink-0 text-xs text-fg-muted">{c.khata_no ? `Khata ${c.khata_no}` : ""}</span>
            </button>
          )) : <div className="px-3 py-2 text-sm text-fg-muted">No customers match.</div>}
        </div>
      ) : null}
    </div>
  );
}
