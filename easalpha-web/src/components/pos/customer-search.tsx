"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Loader2, Search, UserPlus, WifiOff, X } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Customer } from "@/lib/types";
import { useDebounced, useOnline } from "@/lib/hooks";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { customerDetails, readRecentCustomers, rememberRecentCustomer, searchReady, type RecentCustomer } from "@/lib/pos-customers";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * The till's customer search: one box for a name or a number (phone, khata no., roll no., room, guardian's phone),
 * results as you type, best match first (GET /customers/search). Before anything is typed it lists the people picked
 * at this till most recently, and "New customer" is always one tap away. Enter picks the highlighted row; arrows move
 * it. Enter only picks from results for the text as typed: pressed sooner, it picks the best match once they arrive.
 */
export function CustomerSearch({ onPick, onAddNew, autoFocus, className }: { onPick: (c: Customer) => void; onAddNew?: (query: string) => void; autoFocus?: boolean; className?: string }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  // The text Enter was pressed on before its results arrived.
  const [enterFor, setEnterFor] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentCustomer[]>([]);
  useEffect(() => { setRecent(readRecentCustomers()); }, []);
  const term = useDebounced(q.trim(), 250);
  const online = useOnline();
  const ready = searchReady(term);
  const results = useQuery({
    queryKey: ["pos_customer_search", term],
    queryFn: () => api<{ data: Customer[] }>("/customers/search", { auth: "pos", query: { q: term, limit: "8" } }),
    enabled: ready && online,
    staleTime: 10_000,
  });
  const rows = useMemo(() => (ready ? results.data?.data ?? [] : []), [ready, results.data]);
  // With nothing typed, the recent list is what the arrows and Enter move through.
  const listed: (Customer | RecentCustomer)[] = q.trim() ? rows : recent;
  useEffect(() => { setActive(0); }, [term]);
  const searching = ready && online && (results.isFetching || q.trim() !== term);
  // The rows answer the text as typed now, not an earlier search still showing while the debounce runs.
  const settled = q.trim() === term && (rows.length > 0 || !results.isFetching);
  const pick = (c: Customer | RecentCustomer) => { setRecent(rememberRecentCustomer(c)); onPick(c as Customer); };
  useEffect(() => {
    if (enterFor === null || enterFor !== q.trim() || !settled) return;
    setEnterFor(null);
    if (rows[0]) pick(rows[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- pick is stable enough; re-running on its identity would loop
  }, [enterFor, q, settled, rows]);
  const row = (c: Customer | RecentCustomer, i: number) => (
    <li key={c.id}>
      <button type="button" role="option" aria-selected={i === active} onClick={() => pick(c)} onMouseEnter={() => setActive(i)}
        className={cn("flex min-h-16 w-full items-center gap-3 rounded-xl border px-3.5 py-2 text-left transition-colors", i === active ? "border-primary bg-primary-soft" : "bg-card hover:bg-muted")}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-soft text-base font-bold uppercase text-primary-ink">{c.name.trim().charAt(0) || "?"}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold">{c.name}</span>
          <span className="block truncate text-sm text-fg-secondary">
            {customerDetails(c as Customer) || "No phone"}
            {c.last_order_at ? <span className="text-fg-muted"> · last order {formatDate(c.last_order_at)}</span> : c.orders_count ? <span className="text-fg-muted"> · {c.orders_count} orders</span> : null}
          </span>
        </span>
        {c.status !== "active" ? <Badge variant="danger">{c.status.replace("_", " ")}</Badge> : null}
        {c.balance_minor > 0 ? <Badge variant="warning">owes {formatMoney(c.balance_minor)}</Badge> : c.balance_minor < 0 ? <Badge variant="success">{formatMoney(-c.balance_minor)} advance</Badge> : null}
      </button>
    </li>
  );
  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-secondary" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setEnterFor(null); }} autoFocus={autoFocus} aria-label="Search customers"
          placeholder="Name or number"
          className="h-13 w-full rounded-full border-2 border-border bg-card pl-12 pr-12 text-base placeholder:text-fg-muted transition-colors focus:border-primary focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.max(0, Math.min(i + 1, listed.length - 1))); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
            if (e.key === "Enter") {
              e.preventDefault();
              if (!q.trim()) { if (listed[active]) pick(listed[active]); }
              else if (!settled) setEnterFor(q.trim());
              else if (rows[active]) pick(rows[active]);
            }
          }} />
        {searching ? <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-fg-muted" /> : q ? (
          <button type="button" onClick={() => { setQ(""); setEnterFor(null); }} aria-label="Clear search" className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-fg-muted hover:bg-fg/8"><X className="h-4 w-4" /></button>
        ) : null}
      </div>
      {!q.trim() ? <p className="text-xs text-fg-muted">A name, or any number: phone, khata no., roll no. or room. A guardian&apos;s phone finds every child on it.</p> : null}
      {!online ? <p className="flex items-center gap-2 text-sm text-warning-ink"><WifiOff className="h-4 w-4" /> Searching customers needs the internet. The customer already on the order stays.</p> : null}
      {results.isError ? <p className="text-sm text-danger">{errorMessage(results.error)}</p> : null}
      {q.trim() && rows.length ? (
        <ul className="max-h-80 space-y-1.5 overflow-y-auto" role="listbox" aria-label="Customers found">{rows.map(row)}</ul>
      ) : null}
      {!q.trim() && recent.length ? (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted"><Clock className="h-3.5 w-3.5" /> Recent on this till</div>
          <ul className="max-h-80 space-y-1.5 overflow-y-auto" role="listbox" aria-label="Recent customers">{recent.map(row)}</ul>
        </div>
      ) : null}
      {ready && online && !searching && results.isSuccess && !rows.length ? (
        <p className="rounded-xl border border-dashed px-3 py-2.5 text-sm text-fg-secondary">No customer matches &ldquo;{term}&rdquo;.</p>
      ) : null}
      {onAddNew ? (
        <Button type="button" variant={ready && online && !searching && results.isSuccess && !rows.length ? "primary" : "secondary"} className="w-full" size="lg" onClick={() => onAddNew(q.trim())}>
          <UserPlus className="h-4 w-4" /> {q.trim() ? `Add “${q.trim()}” as a new customer` : "New customer"}
        </Button>
      ) : null}
    </div>
  );
}
