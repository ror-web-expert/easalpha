"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, ArrowLeft, Wallet, HandCoins } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Delivery, Rider, RiderMovementKind, RiderSettlement, RiderStatement, SettlementPreview } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { usePagedList } from "@/lib/hooks";
import { Cards, LoadMore, PageHeader } from "@/components/admin/page";
import { CategoryOptions, DELIVERY_LABELS, MOVEMENT_LABELS, deliveryStatusVariant, movementVariant, riderStatusVariant, useExpenseCategories } from "@/components/admin/delivery";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Dialog, EmptyRow, Field, Input, KeyValue, Loading, MoneyInput, Select, Stat, SummaryCard, Switch, Table, TBody, TD, TH, THead, TR, Tabs, Textarea } from "@/components/ui";
import { toast } from "@/store/toast";

type Tab = "float" | "settle" | "settlements" | "deliveries";
interface MoveForm { kind: Exclude<RiderMovementKind, "settle">; amount_minor: number; reason: string; category_id: string }
const MOVE_ACTIONS: Record<MoveForm["kind"], string> = { issue: "Issue float", return: "Take back", spend: "Record spend", adjust: "Adjust" };

export default function RiderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const rider = useQuery({ queryKey: ["rider", id], queryFn: () => api<Rider>(`/riders/${id}`) });
  const [tab, setTab] = useState<Tab>("float");
  const [move, setMove] = useState<MoveForm | null>(null);
  const [busy, setBusy] = useState(false);
  const cats = useExpenseCategories();
  const refresh = () => { ["rider", "rider_statement", "rider_preview", "rider_settlements", "rider_deliveries", "riders", "expenses", "accounts"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); };
  const doMove = async () => {
    if (!move) return;
    setBusy(true);
    try {
      await api(`/riders/${id}/float`, { method: "POST", body: { kind: move.kind, amount_minor: move.amount_minor, reason: move.reason || undefined, category_id: move.kind === "spend" && move.category_id ? move.category_id : undefined } });
      toast.success(`${MOVEMENT_LABELS[move.kind]} ${formatMoney(move.amount_minor)}`); setMove(null); refresh();
    } catch (e) { toast.error("Could not move cash", errorMessage(e)); }
    finally { setBusy(false); }
  };
  const r = rider.data;
  if (!r) return <Loading />;
  return (
    <>
      <PageHeader icon={Bike} title={r.name} description={[r.phone, r.vehicle ? titleCase(r.vehicle) : null, r.vehicle_no, r.address].filter(Boolean).join(" · ")} actions={<>
        <Link href="/admin/delivery/riders"><Button variant="secondary"><ArrowLeft className="h-4 w-4" /> Riders</Button></Link>
        <Button variant="secondary" onClick={() => setMove({ kind: "issue", amount_minor: 0, reason: "", category_id: "" })}><Wallet className="h-4 w-4" /> Move cash</Button>
        <Button onClick={() => setTab("settle")}><HandCoins className="h-4 w-4" /> Settle</Button>
      </>} />
      <Cards>
        <SummaryCard label="Float balance" value={formatMoney(r.float_minor)} sub="Company cash the rider holds" tone={r.float_minor > 0 ? "warning" : "neutral"} />
        <SummaryCard label="Status" value={<Badge variant={riderStatusVariant(r.status)} className="text-sm">{titleCase(r.status)}</Badge>} sub={r.last_seen_at ? `Seen ${formatDateTime(r.last_seen_at)}` : "Never seen in the app"} tone="info" />
        <SummaryCard label="Charge per delivery" value={formatMoney(r.charge_per_delivery_minor)} tone="neutral" />
        <SummaryCard label="Login" value={r.membership_id ? "Rider app" : "None"} sub={r.membership_id ? "Signs in with phone and PIN" : "Create one from the riders list"} tone={r.membership_id ? "success" : "neutral"} />
      </Cards>
      <Tabs value={tab} onChange={setTab} items={[{ value: "float", label: "Float" }, { value: "settle", label: "Settle" }, { value: "settlements", label: "Settlements" }, { value: "deliveries", label: "Deliveries" }]} className="mb-4 w-fit" />
      {tab === "float" ? <FloatTab id={id} onMove={(k) => setMove({ kind: k, amount_minor: 0, reason: "", category_id: "" })} /> : null}
      {tab === "settle" ? <SettleTab id={id} onSettled={refresh} /> : null}
      {tab === "settlements" ? <SettlementsTab id={id} /> : null}
      {tab === "deliveries" ? <DeliveriesTab id={id} /> : null}
      <Dialog open={!!move} onClose={() => setMove(null)} title="Move cash" description="Issue puts company cash in the rider's hands; return takes it back; spend records a road expense from the float; adjust corrects the balance." size="sm"
        footer={<><Button variant="secondary" onClick={() => setMove(null)}>Cancel</Button><Button loading={busy} disabled={!move || move.amount_minor <= 0 || (move.kind === "spend" && !move.reason.trim())} onClick={doMove}>{move ? MOVE_ACTIONS[move.kind] : "Save"}</Button></>}>
        {move ? (
          <div className="space-y-3">
            <Field label="Kind">
              <Select value={move.kind} onChange={(e) => setMove({ ...move, kind: e.target.value as MoveForm["kind"] })} autoFocus>
                <option value="issue">Issue float to rider</option>
                <option value="return">Rider returns float</option>
                <option value="spend">Rider spent from float (expense)</option>
                <option value="adjust">Adjust balance</option>
              </Select>
            </Field>
            <Field label="Amount" hint={move.kind === "return" || move.kind === "spend" ? `Holds ${formatMoney(r.float_minor)}` : undefined}><MoneyInput value={move.amount_minor} onChange={(v) => setMove({ ...move, amount_minor: v })} /></Field>
            {move.kind === "spend" ? <Field label="Expense category" hint="Defaults to Transport when empty"><Select value={move.category_id} onChange={(e) => setMove({ ...move, category_id: e.target.value })}><option value="">Transport (default)</option><CategoryOptions categories={cats.data} /></Select></Field> : null}
            <Field label={move.kind === "spend" ? "What was it for?" : "Reason"}><Input value={move.reason} onChange={(e) => setMove({ ...move, reason: e.target.value })} placeholder={move.kind === "spend" ? "Petrol, puncture…" : "Morning float"} /></Field>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}

function FloatTab({ id, onMove }: { id: string; onMove: (k: MoveForm["kind"]) => void }) {
  const [range, setRange] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const q = useQuery({ queryKey: ["rider_statement", id, range], queryFn: () => api<RiderStatement>(`/riders/${id}/statement`, { query: { from: range.from && range.to ? range.from : "", to: range.from && range.to ? range.to : "" } }) });
  const rows = q.data?.rows ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Float statement</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" className="h-8 w-auto text-xs" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} aria-label="From" />
          <Input type="date" className="h-8 w-auto text-xs" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} aria-label="To" />
          <Button size="sm" variant="secondary" onClick={() => onMove("issue")}>Issue</Button>
          <Button size="sm" variant="secondary" onClick={() => onMove("return")}>Return</Button>
          <Button size="sm" variant="secondary" onClick={() => onMove("spend")}>Spend</Button>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {q.isLoading ? <Loading /> : (
          <table className="w-full text-sm">
            <THead><tr><TH>When</TH><TH>Movement</TH><TH>Reason</TH><TH right>Amount</TH><TH right>Balance</TH></tr></THead>
            <TBody>
              {rows.length ? [...rows].reverse().map((m) => {
                const out = m.kind === "return" || m.kind === "spend" || m.kind === "settle" || (m.kind === "adjust" && m.amount_minor < 0);
                return (
                  <TR key={m.id}>
                    <TD className="text-fg-secondary">{formatDateTime(m.occurred_at)}</TD>
                    <TD><Badge variant={movementVariant(m.kind)}>{MOVEMENT_LABELS[m.kind] ?? titleCase(m.kind)}</Badge>{m.expense_id ? <span className="ml-2 text-xs text-fg-muted">expense</span> : null}</TD>
                    <TD className="text-fg-secondary">{m.reason ?? "-"}</TD>
                    <TD right className={out ? "text-danger" : "text-success"}>{out ? "-" : "+"}{formatMoney(Math.abs(m.amount_minor))}</TD>
                    <TD right className="font-medium">{formatMoney(m.balance_minor)}</TD>
                  </TR>
                );
              }) : <EmptyRow colSpan={5}>No float movements yet.</EmptyRow>}
            </TBody>
          </table>
        )}
      </CardBody>
    </Card>
  );
}

function SettleTab({ id, onSettled }: { id: string; onSettled: () => void }) {
  const preview = useQuery({ queryKey: ["rider_preview", id], queryFn: () => api<SettlementPreview>(`/riders/${id}/settlement_preview`) });
  const [handed, setHanded] = useState(0);
  const [note, setNote] = useState("");
  const [keepFloat, setKeepFloat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RiderSettlement | null>(null);
  const p = preview.data;
  const expected = p ? (keepFloat ? p.cash_collected_minor : p.expected_minor) : 0;
  useEffect(() => { if (p) setHanded(keepFloat ? p.cash_collected_minor : p.expected_minor); }, [p, keepFloat]);
  const settle = async () => {
    setBusy(true);
    try {
      const r = await api<{ settlement: RiderSettlement; rider: Rider }>(`/riders/${id}/settle`, { method: "POST", body: { handed_in_minor: handed, note: note || undefined, keep_float: keepFloat } });
      setResult(r.settlement); setNote(""); onSettled();
      toast.success(`Settled ${r.settlement.label}`, r.settlement.difference_minor === 0 ? "Exact" : r.settlement.difference_minor < 0 ? `Short by ${formatMoney(-r.settlement.difference_minor)}` : `Over by ${formatMoney(r.settlement.difference_minor)}`);
    } catch (e) { toast.error("Could not settle", errorMessage(e)); }
    finally { setBusy(false); }
  };
  const diff = handed - expected;
  if (preview.isLoading || !p) return <Loading />;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader><CardTitle>Unsettled deliveries</CardTitle><span className="text-xs text-fg-muted">{p.deliveries_count} deliveries</span></CardHeader>
        <CardBody className="p-0">
          <table className="w-full text-sm">
            <THead><tr><TH>Order</TH><TH>Status</TH><TH>Delivered</TH><TH right>Total</TH><TH right>Cash collected</TH></tr></THead>
            <TBody>
              {p.deliveries.length ? p.deliveries.map((d) => (
                <TR key={d.id}><TD className="font-mono">{d.order_label}</TD><TD><Badge variant={deliveryStatusVariant(d.status)}>{DELIVERY_LABELS[d.status]}</Badge></TD><TD className="text-fg-secondary">{d.delivered_at ? formatDateTime(d.delivered_at) : "-"}</TD><TD right>{formatMoney(d.order_total_minor)}</TD><TD right className="font-medium">{d.cash_collected_minor != null ? formatMoney(d.cash_collected_minor) : "-"}</TD></TR>
              )) : <EmptyRow colSpan={5}>Nothing to settle. Delivered orders appear here until the rider hands in the cash.</EmptyRow>}
            </TBody>
          </table>
        </CardBody>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Settle up</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <Stat label="Cash collected" value={formatMoney(p.cash_collected_minor)} />
            <Stat label="Float held" value={formatMoney(p.float_held_minor)} className={keepFloat ? "line-through opacity-60" : ""} />
            <Stat label="Expected" value={formatMoney(expected)} className="border-t pt-2 font-semibold" />
            <Switch checked={keepFloat} onChange={setKeepFloat} label="Rider keeps the float for the next shift" />
            <Field label="Handed in"><MoneyInput value={handed} onChange={setHanded} /></Field>
            <Stat label="Difference" value={diff === 0 ? "Exact" : `${diff > 0 ? "+" : "-"}${formatMoney(Math.abs(diff))}`} tone={diff < 0 ? "danger" : diff > 0 ? "success" : undefined} />
            <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Short by Rs 10, will adjust tomorrow" /></Field>
            <Button className="w-full" loading={busy} disabled={p.deliveries_count === 0 && p.float_held_minor === 0} onClick={settle}><HandCoins className="h-4 w-4" /> Settle {formatMoney(handed)}</Button>
            <p className="text-xs text-fg-muted">Cash collected goes into the drawer (or the cash account). A shortfall posts an adjustment and raises an alert.</p>
          </CardBody>
        </Card>
        {result ? (
          <Card className={result.difference_minor < 0 ? "border-danger" : "border-success"}>
            <CardHeader><CardTitle>{result.label} settled</CardTitle><span className="text-xs text-fg-muted">{formatDateTime(result.settled_at)}</span></CardHeader>
            <CardBody>
              <KeyValue items={[{ label: "Deliveries", value: result.deliveries_count }, { label: "Expected", value: formatMoney(result.expected_minor) }, { label: "Handed in", value: formatMoney(result.handed_in_minor) }, { label: "Difference", value: <span className={result.difference_minor < 0 ? "text-danger" : result.difference_minor > 0 ? "text-success" : ""}>{result.difference_minor === 0 ? "Exact" : formatMoney(result.difference_minor)}</span> }]} />
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function SettlementsTab({ id }: { id: string }) {
  const list = usePagedList<RiderSettlement>(["rider_settlements", id], `/riders/${id}/settlements`);
  return (
    <>
      <Table>
        <THead><tr><TH>Settlement</TH><TH>When</TH><TH right>Deliveries</TH><TH right>Collected</TH><TH right>Float</TH><TH right>Expected</TH><TH right>Handed in</TH><TH right>Difference</TH><TH>Note</TH></tr></THead>
        <TBody>
          {list.isLoading ? <EmptyRow colSpan={9}>Loading…</EmptyRow> : list.rows.length ? list.rows.map((s) => (
            <TR key={s.id}>
              <TD className="font-mono">{s.label}</TD>
              <TD className="text-fg-secondary">{formatDateTime(s.settled_at)}</TD>
              <TD right>{s.deliveries_count}</TD>
              <TD right>{formatMoney(s.cash_collected_minor)}</TD>
              <TD right>{formatMoney(s.float_held_minor)}</TD>
              <TD right>{formatMoney(s.expected_minor)}</TD>
              <TD right className="font-medium">{formatMoney(s.handed_in_minor)}</TD>
              <TD right className={s.difference_minor < 0 ? "font-medium text-danger" : s.difference_minor > 0 ? "text-success" : "text-fg-muted"}>{s.difference_minor === 0 ? "Exact" : formatMoney(s.difference_minor)}</TD>
              <TD className="max-w-xs truncate text-fg-secondary">{s.note ?? "-"}</TD>
            </TR>
          )) : <EmptyRow colSpan={9}>No settlements yet.</EmptyRow>}
        </TBody>
      </Table>
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
    </>
  );
}

function DeliveriesTab({ id }: { id: string }) {
  const [status, setStatus] = useState("");
  const list = usePagedList<Delivery>(["rider_deliveries", id], `/riders/${id}/deliveries`, { status });
  return (
    <>
      <div className="mb-3"><Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option>{(Object.keys(DELIVERY_LABELS) as (keyof typeof DELIVERY_LABELS)[]).map((s) => <option key={s} value={s}>{DELIVERY_LABELS[s]}</option>)}</Select></div>
      <Table>
        <THead><tr><TH>Order</TH><TH>Customer</TH><TH>Zone</TH><TH>Status</TH><TH right>Total</TH><TH right>Cash</TH><TH>Delivered</TH><TH>Settled</TH></tr></THead>
        <TBody>
          {list.isLoading ? <EmptyRow colSpan={8}>Loading…</EmptyRow> : list.rows.length ? list.rows.map((d) => (
            <TR key={d.id}>
              <TD className="font-mono">{d.order_label}</TD>
              <TD>{d.guest_name ?? "-"}</TD>
              <TD className="text-fg-secondary">{d.zone_name ?? "-"}</TD>
              <TD><Badge variant={deliveryStatusVariant(d.status)}>{DELIVERY_LABELS[d.status]}</Badge></TD>
              <TD right>{formatMoney(d.order_total_minor)}</TD>
              <TD right>{d.cash_collected_minor != null ? formatMoney(d.cash_collected_minor) : "-"}</TD>
              <TD className="text-fg-secondary">{d.delivered_at ? formatDateTime(d.delivered_at) : "-"}</TD>
              <TD className="text-fg-secondary">{d.settled_at ? formatDate(d.settled_at) : <Badge variant="warning">open</Badge>}</TD>
            </TR>
          )) : <EmptyRow colSpan={8}>No deliveries yet.</EmptyRow>}
        </TBody>
      </Table>
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
    </>
  );
}
