"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Megaphone, RefreshCw, Search, Send, X } from "lucide-react";
import { errorMessage } from "@/lib/api";
import type { Customer, Voucher, VoucherBatch } from "@/lib/types";
import { batchSendable, issueVouchers, listPersonalBatches, searchCustomers, valueLabel } from "@/lib/pos-discounts";
import { formatMoney } from "@/lib/money";
import { formatDate, formatTime } from "@/lib/dates";
import { useDebounced } from "@/lib/hooks";
import { usePosCan } from "@/store/device";
import { useCatalogStore } from "@/store/catalog";
import { useSyncStore } from "@/store/sync";
import { toast } from "@/store/toast";
import { PosShell } from "@/components/pos/shell";
import { Badge, Button, EmptyState, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

/** SPEC vouchers: who may send personal codes from the till (the API accepts the same codes on /voucher_batches/:id/issue). */
const CAMPAIGN_PERMS = ["MARKETING", "MARKETING_CAMPAIGN", "settings.manage"];

/**
 * SPEC "Vouchers": personal codes are generated per customer and sent from the POS campaign screen, redeemable only by
 * that customer. Pick a personal batch, search and multi-select customers, Send vouchers issues one code each (sent
 * over WhatsApp by the server) and the results list shows every code with its sent status. Online only.
 */
export default function CampaignPage() {
  const can = usePosCan();
  const allowed = can(...CAMPAIGN_PERMS);
  const currency = useCatalogStore((s) => s.catalog?.business.currency);
  const status = useSyncStore((s) => s.status);
  const online = status !== "offline";
  const [batches, setBatches] = useState<VoucherBatch[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const query = useDebounced(q, 300);
  const [results, setResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Map<string, Customer>>(new Map());
  const [sending, setSending] = useState(false);
  const [issued, setIssued] = useState<{ batch: VoucherBatch; rows: Voucher[]; at: string } | null>(null);

  const load = useCallback(async () => {
    if (!online || !allowed) return;
    setLoading(true);
    try {
      const rows = await listPersonalBatches();
      setBatches(rows);
      setBatchId((cur) => cur && rows.some((b) => b.id === cur) ? cur : rows.find(batchSendable)?.id ?? null);
    } catch (e) { toast.error("Could not load voucher batches", errorMessage(e)); }
    finally { setLoading(false); }
  }, [online, allowed]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!online || !allowed) { setResults([]); return; }
    let live = true;
    setSearching(true);
    searchCustomers(query).then((rows) => { if (live) setResults(rows); }).catch(() => { if (live) setResults([]); }).finally(() => { if (live) setSearching(false); });
    return () => { live = false; };
  }, [query, online, allowed]);

  const batch = useMemo(() => batches.find((b) => b.id === batchId) ?? null, [batches, batchId]);
  const toggle = (c: Customer) => setPicked((m) => { const n = new Map(m); if (n.has(c.id)) n.delete(c.id); else n.set(c.id, c); return n; });
  const allShownPicked = results.length > 0 && results.every((c) => picked.has(c.id));
  const toggleAll = () => setPicked((m) => { const n = new Map(m); if (allShownPicked) results.forEach((c) => n.delete(c.id)); else results.forEach((c) => n.set(c.id, c)); return n; });
  const canSend = online && !!batch && batchSendable(batch) && picked.size > 0 && !sending;

  const send = async () => {
    if (!batch || !canSend) return;
    setSending(true);
    try {
      const r = await issueVouchers(batch.id, [...picked.keys()]);
      setIssued({ batch, rows: r.data, at: new Date().toISOString() });
      setBatches((bs) => bs.map((b) => (b.id === batch.id ? { ...b, ...(r.batch ?? { issued_count: b.issued_count + r.issued }) } : b)));
      setPicked(new Map());
      const sent = r.data.filter((v) => v.sent_at).length;
      toast.success(`${r.issued} ${r.issued === 1 ? "voucher" : "vouchers"} issued`, sent === r.issued ? "All sent." : `${sent} sent, ${r.issued - sent} not sent (no WhatsApp number or sending is off).`);
    } catch (e) { toast.error("Could not send vouchers", errorMessage(e)); }
    finally { setSending(false); }
  };

  if (!allowed) {
    return (
      <PosShell title="Campaign">
        <EmptyState icon={Megaphone} title="Campaign screen" hint="Sending vouchers needs the MARKETING or MARKETING_CAMPAIGN permission." className="m-6" />
      </PosShell>
    );
  }
  return (
    <PosShell title={`Campaign · ${picked.size} ${picked.size === 1 ? "customer" : "customers"} selected`}>
      <div className="grid h-full grid-cols-1 overflow-hidden md:grid-cols-[320px_1fr]">
        <aside className="flex min-h-0 flex-col border-r bg-card">
          <div className="flex items-center justify-between border-b p-2">
            <span className="px-1 text-sm font-semibold">Personal voucher batches</span>
            <Button variant="ghost" size="sm" onClick={load} loading={loading} disabled={!online} aria-label="Refresh batches"><RefreshCw className="h-4 w-4" /></Button>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto p-2">
            {!online ? <li className="px-2 py-6 text-center text-sm text-fg-muted">Vouchers are sent from the server. Available when online.</li> : null}
            {online && !loading && !batches.length ? <li className="px-2 py-6 text-center text-sm text-fg-muted">No personal batches. Create one under Customers, Vouchers in the admin panel.</li> : null}
            {batches.map((b) => {
              const ok = batchSendable(b);
              return (
                <li key={b.id}>
                  <button onClick={() => setBatchId(b.id)} disabled={!ok} className={cn("mb-1 w-full rounded-lg border p-3 text-left disabled:opacity-50", batchId === b.id ? "border-primary bg-primary-soft" : "hover:bg-muted")}>
                    <div className="flex items-center justify-between gap-2"><span className="truncate font-semibold">{b.name}</span>{!b.active ? <Badge variant="neutral">off</Badge> : b.expired ? <Badge variant="danger">expired</Badge> : <Badge variant="success">active</Badge>}</div>
                    <div className="text-xs text-fg-secondary">{valueLabel(b.value_kind, b.value, currency)}{b.min_spend_minor ? ` · min spend ${formatMoney(b.min_spend_minor, currency)}` : ""}</div>
                    <div className="text-xs text-fg-muted">{b.expires_on ? `Expires ${formatDate(b.expires_on)}` : "No expiry"} · {b.issued_count} issued · {b.redeemed_count} redeemed</div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
        <section className="flex min-h-0 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b bg-card p-2">
            <div className="relative min-w-60 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers by name, phone or khata no." className="h-11 pl-9 text-base" disabled={!online} aria-label="Search customers" />
            </div>
            <Button variant="secondary" size="lg" onClick={toggleAll} disabled={!online || !results.length}>{allShownPicked ? "Clear shown" : "Select shown"}</Button>
            <Button size="lg" onClick={send} loading={sending} disabled={!canSend} title={!batch ? "Pick a batch first" : !picked.size ? "Pick at least one customer" : undefined}><Send className="h-4 w-4" /> Send vouchers{picked.size ? ` (${picked.size})` : ""}</Button>
          </div>
          {batch ? <p className="border-b bg-info-soft/50 px-3 py-1.5 text-xs text-fg-secondary">Each selected customer gets their own code from <strong>{batch.name}</strong> ({valueLabel(batch.value_kind, batch.value, currency)}), usable only by them{batch.expires_on ? ` until ${formatDate(batch.expires_on)}` : ""}. Codes are sent over WhatsApp when the customer has a number.</p> : null}
          {picked.size ? (
            <div className="flex flex-wrap gap-1 border-b px-3 py-2">
              {[...picked.values()].map((c) => <button key={c.id} onClick={() => toggle(c)} className="flex h-8 items-center gap-1 rounded-full bg-primary-soft px-3 text-xs font-medium text-primary-ink" aria-label={`Remove ${c.name}`}>{c.name}<X className="h-3 w-3" /></button>)}
            </div>
          ) : null}
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-2">
            <ul className="min-h-0 overflow-y-auto border-r">
              {searching && !results.length ? <li className="px-3 py-6 text-center text-sm text-fg-muted">Searching</li> : null}
              {!searching && online && !results.length ? <li className="px-3 py-6 text-center text-sm text-fg-muted">No customers match.</li> : null}
              {results.map((c) => (
                <li key={c.id} className="border-b">
                  <label className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted">
                    <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c)} className="h-[18px] w-[18px] shrink-0 rounded-[2px] accent-[var(--primary)]" aria-label={`Select ${c.name}`} />
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{c.name}</span><span className="block text-xs text-fg-muted">{c.phone ?? "no phone"}{c.khata_no ? ` · khata ${c.khata_no}` : ""} · {c.orders_count} orders{c.last_order_at ? ` · last ${formatDate(c.last_order_at)}` : ""}</span></span>
                    {!c.phone ? <Badge variant="warning">no number</Badge> : c.whatsapp_opt_in === false ? <Badge variant="neutral">no WhatsApp</Badge> : null}
                  </label>
                </li>
              ))}
            </ul>
            <div className="min-h-0 overflow-y-auto">
              <div className="border-b bg-card px-3 py-2 text-sm font-semibold">Sent vouchers{issued ? ` · ${issued.batch.name} · ${formatTime(issued.at)}` : ""}</div>
              {!issued ? <p className="px-3 py-6 text-center text-sm text-fg-muted">Codes and their sent status appear here after Send vouchers.</p> : (
                <ul>
                  {issued.rows.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm">
                      <span className="min-w-0"><span className="block truncate font-medium">{v.customer_name ?? "Customer"}</span><span className="block font-mono text-xs text-fg-secondary">{v.code}</span></span>
                      {v.sent_at ? <Badge variant="success">Sent {formatTime(v.sent_at)}</Badge> : <Badge variant="warning">Not sent</Badge>}
                    </li>
                  ))}
                  {!issued.rows.length ? <li className="px-3 py-6 text-center text-sm text-fg-muted">Nothing was issued.</li> : null}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>
    </PosShell>
  );
}
