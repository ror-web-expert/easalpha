"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, UserPlus, WifiOff } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Customer } from "@/lib/types";
import { useDebounced, useOnline } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";
import { customerDetails, searchReady } from "@/lib/pos-customers";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * The till's customer search: one box for a name or a number (phone, khata no., roll no., room, guardian's phone),
 * results as you type, best match first (GET /customers/search). Enter picks the highlighted row; arrows move it.
 * Enter only picks from results for the text as typed: pressed sooner, it picks the best match once they arrive.
 */
export function CustomerSearch({ onPick, onAddNew, autoFocus, className }: { onPick: (c: Customer) => void; onAddNew?: (query: string) => void; autoFocus?: boolean; className?: string }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  // The text Enter was pressed on before its results arrived.
  const [enterFor, setEnterFor] = useState<string | null>(null);
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
  useEffect(() => { setActive(0); }, [term]);
  const searching = ready && online && (results.isFetching || q.trim() !== term);
  // The rows answer the text as typed now, not an earlier search still showing while the debounce runs.
  const settled = q.trim() === term && (rows.length > 0 || !results.isFetching);
  useEffect(() => {
    if (enterFor === null || enterFor !== q.trim() || !settled) return;
    setEnterFor(null);
    if (rows[0]) onPick(rows[0]);
  }, [enterFor, q, settled, rows, onPick]);
  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-secondary" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setEnterFor(null); }} autoFocus={autoFocus} aria-label="Search customers"
          placeholder="Name, phone, khata no., roll no. or room"
          className="h-12 w-full rounded-full border bg-card pl-12 pr-10 text-base placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-primary"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.max(0, Math.min(i + 1, rows.length - 1))); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
            if (e.key === "Enter") {
              e.preventDefault();
              if (!settled) setEnterFor(q.trim());
              else if (rows[active]) onPick(rows[active]);
            }
          }} />
        {searching ? <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-fg-muted" /> : null}
      </div>
      {!online ? <p className="flex items-center gap-2 text-sm text-warning-ink"><WifiOff className="h-4 w-4" /> Searching customers needs the internet. The customer already on the order stays.</p> : null}
      {results.isError ? <p className="text-sm text-danger">{errorMessage(results.error)}</p> : null}
      {rows.length ? (
        <ul className="max-h-72 space-y-1 overflow-y-auto" role="listbox" aria-label="Customers found">
          {rows.map((c, i) => (
            <li key={c.id}>
              <button type="button" role="option" aria-selected={i === active} onClick={() => onPick(c)} onMouseEnter={() => setActive(i)}
                className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left", i === active ? "border-primary bg-primary-soft" : "bg-card hover:bg-muted")}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="block truncate text-sm text-fg-secondary">{customerDetails(c) || "No phone"}</span>
                </span>
                {c.status !== "active" ? <Badge variant="danger">{c.status.replace("_", " ")}</Badge> : null}
                {c.balance_minor > 0 ? <Badge variant="warning">owes {formatMoney(c.balance_minor)}</Badge> : c.balance_minor < 0 ? <Badge variant="success">{formatMoney(-c.balance_minor)} advance</Badge> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {ready && online && !searching && results.isSuccess && !rows.length ? (
        <div className="space-y-2 rounded-xl border border-dashed p-3 text-sm">
          <p className="text-fg-secondary">No customer matches “{term}”.</p>
          {onAddNew ? <Button type="button" variant="secondary" className="w-full" size="lg" onClick={() => onAddNew(term)}><UserPlus className="h-4 w-4" /> Add a new customer</Button> : null}
        </div>
      ) : null}
      {!ready ? <p className="text-xs text-fg-muted">Type a name, or any number: phone, khata no., roll no. or room. A guardian&apos;s phone finds every child on it.</p> : null}
    </div>
  );
}
