"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Customer, Page } from "@/lib/types";
import { useDebounced } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Badge, Input } from "@/components/ui";
import { balanceLabel, balanceVariant } from "@/components/admin/marketing-helpers";
import { formatMoney } from "@/lib/money";

// Customer search used by the Ledger, Account, Payments, Regular Discounts (blocked list), Vouchers (issue) and
// WhatsApp (manual and bulk send) screens. Searches name, phone and khata no through GET /customers?q=.

export function useCustomerSearch(q: string, enabled = true) {
  const dq = useDebounced(q.trim(), 250);
  return useQuery({ queryKey: ["customer_search", dq], queryFn: () => api<Page<Customer>>("/customers", { query: { q: dq, status: "active", limit: 20 } }), enabled: enabled && dq.length > 0 });
}

function CustomerLine({ c }: { c: Customer }) {
  return (
    <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
      <span className="min-w-0 truncate"><span className="font-medium">{c.name}</span>{c.khata_no ? <span className="ml-2 font-mono text-xs text-fg-muted">{c.khata_no}</span> : null}{c.phone ? <span className="ml-2 text-xs text-fg-secondary">{c.phone}</span> : null}</span>
      <Badge variant={balanceVariant(c.balance_minor)}>{balanceLabel(c.balance_minor)}{c.balance_minor ? ` ${formatMoney(Math.abs(c.balance_minor))}` : ""}</Badge>
    </span>
  );
}

/** Pick one customer. Shows the chosen customer with a clear button; typing searches again. */
export function CustomerPicker({ value, onChange, placeholder = "Search name, phone or khata no", autoFocus, className }: { value: Customer | null; onChange: (c: Customer | null) => void; placeholder?: string; autoFocus?: boolean; className?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const results = useCustomerSearch(q, open);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  if (value) {
    return (
      <div className={cn("flex h-10 items-center gap-2 rounded-[4px] border border-border-strong px-3 text-sm", className)}>
        <CustomerLine c={value} />
        <button type="button" className="text-fg-muted hover:text-fg" onClick={() => { onChange(null); setQ(""); }} aria-label="Clear customer"><X className="h-4 w-4" /></button>
      </div>
    );
  }
  const rows = results.data?.data ?? [];
  return (
    <div ref={box} className={cn("relative w-full", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-secondary" />
      <Input className="pl-10" value={q} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      {open && q.trim() ? (
        <ul className="absolute left-0 right-0 top-11 z-30 max-h-72 overflow-y-auto rounded-md border bg-high py-1 shadow-[var(--shadow-pop)]" role="listbox">
          {results.isLoading ? <li className="px-3 py-2 text-sm text-fg-muted">Searching</li> : rows.length ? rows.map((c) => (
            <li key={c.id}>
              <button type="button" role="option" aria-selected={false} className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-fg/8" onClick={() => { onChange(c); setOpen(false); setQ(""); }}><CustomerLine c={c} /></button>
            </li>
          )) : <li className="px-3 py-2 text-sm text-fg-muted">No active customer matches</li>}
        </ul>
      ) : null}
    </div>
  );
}

/** Pick several customers: a search box that adds to a chip list. */
export function CustomerMultiSelect({ value, onChange, placeholder = "Add a customer", className }: { value: Customer[]; onChange: (v: Customer[]) => void; placeholder?: string; className?: string }) {
  const [pick, setPick] = useState<Customer | null>(null);
  useEffect(() => {
    if (!pick) return;
    if (!value.some((c) => c.id === pick.id)) onChange([...value, pick]);
    setPick(null);
  }, [pick, value, onChange]);
  return (
    <div className={cn("space-y-2", className)}>
      <CustomerPicker value={pick} onChange={setPick} placeholder={placeholder} />
      {value.length ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
              {c.name}{c.khata_no ? <span className="font-mono text-fg-muted">{c.khata_no}</span> : null}
              <button type="button" className="text-fg-muted hover:text-fg" onClick={() => onChange(value.filter((x) => x.id !== c.id))} aria-label={`Remove ${c.name}`}><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Resolve customer ids (a blocked list, for example) to records for display. Missing ones are skipped. */
export function useCustomersById(ids: string[]) {
  return useQuery({
    queryKey: ["customers_by_id", ids],
    queryFn: async () => {
      const out: Customer[] = [];
      for (const id of ids) { try { out.push(await api<Customer>(`/customers/${id}`)); } catch { /* removed customer; leave it out */ } }
      return out;
    },
    enabled: ids.length > 0,
  });
}
