"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Vault, ArrowDownToLine, ArrowUpFromLine, Fuel, SlidersHorizontal, HandCoins, FileDown } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Rider, RiderMovementKind, RiderSettlement, RiderStatement, SettlementPreview } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { exportTablePdf } from "@/lib/pdf";
import { useCan } from "@/store/auth";
import { Cards, DateRangePicker, FilterBar, PageHeader, type DateRange } from "@/components/admin/page";
import { CategoryOptions, MOVEMENT_LABELS, movementVariant, useExpenseCategories, useRiders } from "@/components/admin/delivery";
import { RIDER_PERMS, lifetimeRemaining } from "@/components/admin/riders-helpers";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Dialog, EmptyRow, EmptyState, Field, Input, Loading, MoneyInput, Select, Stat, SummaryCard, Switch, Table, TBody, TD, TH, THead, TR, Textarea } from "@/components/ui";
import { toast } from "@/store/toast";

type MoveKind = Exclude<RiderMovementKind, "settle">;
interface MoveForm { kind: MoveKind; amount_minor: number; reason: string; category_id: string }
const MOVES: { kind: MoveKind; label: string; icon: typeof ArrowDownToLine; hint: string; cta: string }[] = [
  { kind: "issue", label: "Issue", icon: ArrowDownToLine, hint: "Company cash goes into the rider's hands (change float, fuel money).", cta: "Issue float" },
  { kind: "return", label: "Return", icon: ArrowUpFromLine, hint: "The rider hands float back without settling deliveries.", cta: "Take back" },
  { kind: "spend", label: "Spend", icon: Fuel, hint: "The rider spent from the float on the road. Recorded as an expense.", cta: "Record spend" },
  { kind: "adjust", label: "Adjust", icon: SlidersHorizontal, hint: "Correct the balance. Use a negative amount to reduce it.", cta: "Adjust" },
];

export default function RiderVaultPage() {
  const can = useCan();
  const qc = useQueryClient();
  const riders = useRiders();
  const [riderId, setRiderId] = useState("");
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [move, setMove] = useState<MoveForm | null>(null);
  const [settling, setSettling] = useState(false);
  const [busy, setBusy] = useState(false);
  const cats = useExpenseCategories();
  const all = useMemo(() => riders.data ?? [], [riders.data]);
  useEffect(() => { if (!riderId && all.length) setRiderId(all.find((r) => r.float_minor > 0)?.id ?? all[0].id); }, [all, riderId]);
  const rider = all.find((r) => r.id === riderId);
  const statement = useQuery({ queryKey: ["rider_statement", riderId, range], enabled: !!riderId, queryFn: () => api<RiderStatement>(`/riders/${riderId}/statement`, { query: { from: range.from && range.to ? range.from : "", to: range.from && range.to ? range.to : "" } }) });
  const refresh = () => ["riders", "rider", "rider_statement", "rider_preview", "rider_settlements", "expenses", "accounts"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const canMove = can(...RIDER_PERMS.vault);
  const doMove = async () => {
    if (!move || !riderId) return;
    setBusy(true);
    try {
      await api(`/riders/${riderId}/float`, { method: "POST", body: { kind: move.kind, amount_minor: move.amount_minor, reason: move.reason || undefined, category_id: move.kind === "spend" && move.category_id ? move.category_id : undefined } });
      toast.success(`${MOVEMENT_LABELS[move.kind]} ${formatMoney(Math.abs(move.amount_minor))}`); setMove(null); refresh();
    } catch (e) { toast.error("Could not move cash", errorMessage(e)); }
    finally { setBusy(false); }
  };
  const rows = statement.data?.rows ?? [];
  const totalFloat = all.reduce((a, r) => a + r.float_minor, 0);
  const exportPdf = () => {
    if (!rider) return;
    exportTablePdf({
      title: `Rider Vault statement: ${rider.name}`, subtitle: range.from && range.to ? `${range.from} to ${range.to}` : "All movements",
      columns: [{ header: "When", key: "when" }, { header: "Movement", key: "kind" }, { header: "Reason", key: "reason" }, { header: "Amount", key: "amount", align: "right" }, { header: "Balance", key: "balance", align: "right" }],
      rows: rows.map((m) => ({ when: formatDateTime(m.occurred_at), kind: MOVEMENT_LABELS[m.kind] ?? titleCase(m.kind), reason: m.reason ?? "", amount: formatMoney(m.kind === "settle" ? -m.amount_minor : m.amount_minor), balance: formatMoney(m.balance_minor ?? 0) })),
      footer: [`Float held now: ${formatMoney(rider.float_minor)}`], filename: `rider-vault-${rider.name.toLowerCase().replace(/\s+/g, "-")}.pdf`,
    });
  };
  return (
    <>
      <PageHeader icon={Vault} title="Rider Vault" description="Company cash riders are holding, with Issue, Return, Spend and Adjust movements and a per-rider statement. Settle at the end of the shift to take back cash collected and float."
        actions={<>
          <Button variant="secondary" onClick={exportPdf} disabled={!rider || !rows.length}><FileDown className="h-4 w-4" /> PDF</Button>
          {canMove ? <Button disabled={!rider} onClick={() => setSettling(true)}><HandCoins className="h-4 w-4" /> Settle</Button> : null}
        </>} />
      <Cards>
        <SummaryCard label="Float held by all riders" value={formatMoney(totalFloat)} sub={`${all.filter((r) => r.float_minor > 0).length} riders holding cash`} tone="warning" />
        <SummaryCard label={rider ? `${rider.name} holds` : "Rider float"} value={formatMoney(rider?.float_minor ?? 0)} sub={rider?.temporary ? lifetimeRemaining(rider) : rider ? titleCase(rider.status) : "Pick a rider"} tone={rider && rider.float_minor > 0 ? "info" : "neutral"} />
        <SummaryCard label="Open deliveries" value={rider?.open_deliveries ?? 0} sub="Not yet delivered or failed" tone="neutral" />
        <SummaryCard label="Movements shown" value={rows.length} sub={range.from && range.to ? `${range.from} to ${range.to}` : "All time"} tone="neutral" />
      </Cards>
      <FilterBar>
        <Select className="w-auto min-w-56" value={riderId} onChange={(e) => setRiderId(e.target.value)} aria-label="Rider">
          {!all.length ? <option value="">No riders</option> : null}
          {all.map((r) => <option key={r.id} value={r.id}>{r.name}{r.temporary ? " (temporary)" : ""} · {formatMoney(r.float_minor)}</option>)}
        </Select>
        <DateRangePicker value={range} onChange={setRange} />
        {range.from || range.to ? <Button variant="ghost" size="sm" onClick={() => setRange({ from: "", to: "" })}>All time</Button> : null}
      </FilterBar>
      {!riders.isLoading && !all.length ? <EmptyState icon={Vault} title="No riders" hint="Add a rider first, then issue float from here." action={<Link href="/admin/riders/manage"><Button>Manage Riders</Button></Link>} /> : null}
      {rider ? (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="space-y-3">
            {MOVES.map((m) => (
              <Card key={m.kind} className="p-3">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-ink"><m.icon className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{m.label}</div>
                    <p className="text-xs text-fg-secondary">{m.hint}</p>
                    {canMove ? <Button size="sm" variant="secondary" className="mt-2" onClick={() => setMove({ kind: m.kind, amount_minor: 0, reason: "", category_id: "" })}>{m.cta}</Button> : null}
                  </div>
                </div>
              </Card>
            ))}
            {!canMove ? <p className="text-xs text-fg-muted">You can read statements. Moving cash needs the cash in/out, shifts or staff permission.</p> : null}
          </div>
          <Card>
            <CardHeader><CardTitle>Statement</CardTitle><span className="text-sm text-fg-secondary">Running balance after each movement</span></CardHeader>
            <CardBody className="p-0">
              {statement.isLoading ? <Loading /> : (
                <Table>
                  <THead><tr><TH>When</TH><TH>Movement</TH><TH>Reason</TH><TH right>Amount</TH><TH right>Balance</TH></tr></THead>
                  <TBody>
                    {rows.length ? [...rows].reverse().map((m) => {
                      const out = m.kind === "return" || m.kind === "spend" || m.kind === "settle" || (m.kind === "adjust" && m.amount_minor < 0);
                      return (
                        <TR key={m.id}>
                          <TD className="text-fg-secondary"><div>{formatDateTime(m.occurred_at)}</div><div className="text-xs text-fg-muted">Day {formatDate(m.business_day)}</div></TD>
                          <TD><Badge variant={movementVariant(m.kind)}>{MOVEMENT_LABELS[m.kind] ?? titleCase(m.kind)}</Badge>{m.expense_id ? <span className="ml-2 text-xs text-fg-muted">expense</span> : null}{m.settlement_id ? <span className="ml-2 text-xs text-fg-muted">settlement</span> : null}</TD>
                          <TD className="text-fg-secondary">{m.reason ?? "-"}</TD>
                          <TD right className={out ? "text-danger" : "text-success"}>{out ? "-" : "+"}{formatMoney(Math.abs(m.amount_minor))}</TD>
                          <TD right className="font-medium">{formatMoney(m.balance_minor ?? 0)}</TD>
                        </TR>
                      );
                    }) : <EmptyRow colSpan={5}>No movements{range.from && range.to ? " in this range" : " yet"}. Issue float to start the statement.</EmptyRow>}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </div>
      ) : null}

      <Dialog open={!!move} onClose={() => setMove(null)} title={move ? MOVES.find((m) => m.kind === move.kind)?.cta : ""} description={move ? `${rider?.name} holds ${formatMoney(rider?.float_minor ?? 0)}. ${MOVES.find((m) => m.kind === move.kind)?.hint ?? ""}` : undefined} size="sm"
        footer={<><Button variant="secondary" onClick={() => setMove(null)}>Cancel</Button><Button loading={busy} disabled={!move || move.amount_minor === 0 || (move.kind !== "adjust" && move.amount_minor < 0) || (move.kind === "spend" && !move.reason.trim())} onClick={doMove}>{move ? MOVES.find((m) => m.kind === move.kind)?.cta : "Save"}</Button></>}>
        {move ? (
          <div className="space-y-3">
            <Field label="Kind">
              <Select value={move.kind} onChange={(e) => setMove({ ...move, kind: e.target.value as MoveKind })}>{MOVES.map((m) => <option key={m.kind} value={m.kind}>{m.label}</option>)}</Select>
            </Field>
            <Field label="Amount" hint={move.kind === "adjust" ? "Negative lowers the balance" : move.kind === "return" || move.kind === "spend" ? `Holds ${formatMoney(rider?.float_minor ?? 0)}` : undefined}><MoneyInput value={move.amount_minor} onChange={(v) => setMove({ ...move, amount_minor: v })} autoFocus /></Field>
            {move.kind === "spend" ? <Field label="Expense category" hint="Defaults to Transport when empty"><Select value={move.category_id} onChange={(e) => setMove({ ...move, category_id: e.target.value })}><option value="">Transport (default)</option><CategoryOptions categories={cats.data} /></Select></Field> : null}
            <Field label={move.kind === "spend" ? "What was it for?" : "Reason"}><Input value={move.reason} onChange={(e) => setMove({ ...move, reason: e.target.value })} placeholder={move.kind === "spend" ? "Petrol, puncture" : move.kind === "issue" ? "Morning float" : "Reason"} /></Field>
          </div>
        ) : null}
      </Dialog>

      {rider ? <SettleDialog open={settling} rider={rider} onClose={() => setSettling(false)} onSettled={() => { setSettling(false); refresh(); }} /> : null}
    </>
  );
}

function SettleDialog({ open, rider, onClose, onSettled }: { open: boolean; rider: Rider; onClose: () => void; onSettled: () => void }) {
  const preview = useQuery({ queryKey: ["rider_preview", rider.id], enabled: open, queryFn: () => api<SettlementPreview>(`/riders/${rider.id}/settlement_preview`) });
  const [handed, setHanded] = useState(0);
  const [note, setNote] = useState("");
  const [keepFloat, setKeepFloat] = useState(false);
  const [busy, setBusy] = useState(false);
  const p = preview.data;
  const expected = p ? (keepFloat ? p.cash_collected_minor : p.expected_minor) : 0;
  useEffect(() => { if (p) setHanded(keepFloat ? p.cash_collected_minor : p.expected_minor); }, [p, keepFloat]);
  const settle = async () => {
    setBusy(true);
    try {
      const r = await api<{ settlement: RiderSettlement; rider: Rider }>(`/riders/${rider.id}/settle`, { method: "POST", body: { handed_in_minor: handed, note: note || undefined, keep_float: keepFloat } });
      toast.success(`Settled ${r.settlement.label}`, r.settlement.difference_minor === 0 ? "Exact" : r.settlement.difference_minor < 0 ? `Short by ${formatMoney(-r.settlement.difference_minor)}` : `Over by ${formatMoney(r.settlement.difference_minor)}`);
      setNote(""); onSettled();
    } catch (e) { toast.error("Could not settle", errorMessage(e)); }
    finally { setBusy(false); }
  };
  const diff = handed - expected;
  return (
    <Dialog open={open} onClose={onClose} title={`Settle ${rider.name}`} description="Cash collected on delivered orders plus the float held, minus nothing spent, is what the rider hands in. Cash collected goes to the drawer; a shortfall posts an adjustment and raises an alert." size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!p || (p.deliveries_count === 0 && p.float_held_minor === 0)} onClick={settle}><HandCoins className="h-4 w-4" /> Settle {formatMoney(handed)}</Button></>}>
      {preview.isLoading || !p ? <Loading /> : (
        <div className="space-y-3">
          <Stat label="Unsettled deliveries" value={p.deliveries_count} />
          <Stat label="Cash collected" value={formatMoney(p.cash_collected_minor)} />
          <Stat label="Float held" value={formatMoney(p.float_held_minor)} className={keepFloat ? "line-through opacity-60" : ""} />
          <Stat label="Expected" value={formatMoney(expected)} className="border-t pt-2 font-semibold" />
          <Switch checked={keepFloat} onChange={setKeepFloat} label="Rider keeps the float for the next shift" />
          <Field label="Handed in"><MoneyInput value={handed} onChange={setHanded} /></Field>
          <Stat label="Difference" value={diff === 0 ? "Exact" : `${diff > 0 ? "+" : "-"}${formatMoney(Math.abs(diff))}`} tone={diff < 0 ? "danger" : diff > 0 ? "success" : undefined} />
          <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Short by Rs 10, will adjust tomorrow" /></Field>
          {p.deliveries.length ? (
            <div className="max-h-40 overflow-y-auto rounded-md border text-xs">
              {p.deliveries.map((d) => <div key={d.id} className="flex justify-between border-b px-3 py-1.5 last:border-b-0"><span className="font-mono">{d.order_label}</span><span className="text-fg-secondary">{d.delivered_at ? formatDateTime(d.delivered_at) : titleCase(d.status)}</span><span className="font-medium">{d.cash_collected_minor != null ? formatMoney(d.cash_collected_minor) : "-"}</span></div>)}
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
