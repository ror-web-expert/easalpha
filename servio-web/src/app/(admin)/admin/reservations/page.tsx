"use client";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus, Check, Armchair, UserX, Ban, Flag, ChevronLeft, ChevronRight } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Customer, DiningTable, PaymentMethod, Reservation, ReservationAvailability, ReservationStatus } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime, formatTime, isoDay } from "@/lib/dates";
import { titleCase } from "@/lib/utils";
import { usePagedList } from "@/lib/hooks";
import { Cards, FilterBar, LoadMore, PageHeader } from "@/components/admin/page";
import { useList } from "@/components/admin/crud";
import { CustomerPicker, fromLocalInput, reservationStatusVariant, toLocalInput } from "@/components/admin/phase3";
import { Badge, Button, Dialog, EmptyRow, Field, Input, Loading, MoneyInput, Select, SummaryCard, Table, TBody, TD, TH, THead, TR, Tabs, Textarea } from "@/components/ui";
import { toast } from "@/store/toast";

interface Form { customer: Customer | null; guest_name: string; phone: string; party_size: string; starts_at: string; duration: string; table_id: string; deposit_minor: number; deposit_method_code: string; notes: string }
const STATUSES: ReservationStatus[] = ["booked", "confirmed", "seated", "completed", "no_show", "cancelled"];
const shiftDay = (d: string, n: number) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return isoDay(x); };

export default function ReservationsPage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"day" | "upcoming">("upcoming");
  const [day, setDay] = useState(isoDay());
  const [status, setStatus] = useState("");
  const list = usePagedList<Reservation>(["reservations"], "/reservations", mode === "day" ? { date: day, status } : { upcoming: "true", status });
  const methods = useList<PaymentMethod>("payment_methods", "/payment_methods");
  const tables = useList<DiningTable>("tables", "/tables");
  const [form, setForm] = useState<Form | null>(null);
  const [seat, setSeat] = useState<{ r: Reservation; table_id: string } | null>(null);
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["reservations"] }); qc.invalidateQueries({ queryKey: ["tables"] }); };
  const act = useMutation({
    mutationFn: ({ r, action, body }: { r: Reservation; action: string; body?: Record<string, unknown> }) => api<Reservation>(`/reservations/${r.id}/${action}`, { method: "POST", body: body ?? {} }),
    onSuccess: (_r, v) => { toast.success({ confirm: "Reservation confirmed", seat: "Party seated", no_show: "Marked no-show", cancelled: "Reservation cancelled", completed: "Reservation completed" }[v.action] ?? "Updated"); setSeat(null); invalidate(); },
    onError: (e) => toast.error("Could not update reservation", errorMessage(e)),
  });
  const startsIso = form ? fromLocalInput(form.starts_at) : null;
  const endsIso = form && startsIso ? new Date(new Date(startsIso).getTime() + (Number(form.duration) || 90) * 60000).toISOString() : null;
  const availability = useQuery({ queryKey: ["reservation_availability", startsIso, endsIso, form?.party_size], queryFn: () => api<ReservationAvailability>("/reservations/availability", { query: { starts_at: startsIso, ends_at: endsIso, party_size: form?.party_size || undefined } }), enabled: !!form && !!startsIso });
  const create = useMutation({
    mutationFn: (f: Form) => api<Reservation>("/reservations", { method: "POST", body: { customer_id: f.customer?.id ?? null, guest_name: f.guest_name || null, phone: f.phone || null, party_size: Number(f.party_size) || 2, starts_at: fromLocalInput(f.starts_at), duration_minutes: Number(f.duration) || 90, table_id: f.table_id || null, deposit_minor: f.deposit_minor || 0, deposit_method_code: f.deposit_minor ? f.deposit_method_code : null, notes: f.notes || null } }),
    onSuccess: (r) => { toast.success("Reservation booked", r.phone ? "A WhatsApp confirmation was sent" : undefined); setForm(null); invalidate(); },
    onError: (e) => toast.error("Could not book", errorMessage(e)),
  });
  useEffect(() => { if (form && !form.deposit_method_code && methods.data?.length) setForm({ ...form, deposit_method_code: methods.data.find((m) => m.kind === "cash")?.code ?? methods.data[0].code }); }, [form, methods.data]);
  const rows = list.rows;
  const counts = useMemo(() => ({ live: rows.filter((r) => r.status === "booked" || r.status === "confirmed").length, seated: rows.filter((r) => r.status === "seated").length, covers: rows.filter((r) => r.status !== "cancelled" && r.status !== "no_show").reduce((a, r) => a + r.party_size, 0), deposits: rows.reduce((a, r) => a + (r.status === "cancelled" ? 0 : r.deposit_minor), 0) }), [rows]);
  const openNew = () => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); setForm({ customer: null, guest_name: "", phone: "", party_size: "2", starts_at: mode === "day" && day !== isoDay() ? `${day}T19:00` : toLocalInput(d), duration: "90", table_id: "", deposit_minor: 0, deposit_method_code: "", notes: "" }); };
  return (
    <>
      <PageHeader icon={CalendarDays} title="Reservations" description="Table bookings with an optional deposit held on the customer's khata. Guests get a WhatsApp confirmation and a reminder two hours before." actions={<Button onClick={openNew}><Plus className="h-4 w-4" /> New reservation</Button>} />
      <Cards>
        <SummaryCard label="Booked / confirmed" value={counts.live} tone="info" />
        <SummaryCard label="Seated now" value={counts.seated} tone="success" />
        <SummaryCard label="Covers" value={counts.covers} sub="Guests across listed reservations" tone="neutral" />
        <SummaryCard label="Deposits held" value={formatMoney(counts.deposits)} tone="primary" />
      </Cards>
      <FilterBar>
        <Tabs value={mode} onChange={setMode} items={[{ value: "upcoming", label: "Upcoming" }, { value: "day", label: "By day" }]} className="w-fit" />
        {mode === "day" ? <div className="flex items-center gap-1"><Button variant="ghost" size="icon-sm" onClick={() => setDay(shiftDay(day, -1))} aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></Button><Input type="date" className="w-auto" value={day} onChange={(e) => setDay(e.target.value)} /><Button variant="ghost" size="icon-sm" onClick={() => setDay(shiftDay(day, 1))} aria-label="Next day"><ChevronRight className="h-4 w-4" /></Button><Button variant="ghost" size="sm" onClick={() => setDay(isoDay())}>Today</Button></div> : null}
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
      </FilterBar>
      {list.isLoading ? <Loading /> : (
        <Table>
          <THead><tr><TH>When</TH><TH>Guest</TH><TH right>Party</TH><TH>Table</TH><TH>Status</TH><TH right>Deposit</TH><TH>Notes</TH><TH right>Actions</TH></tr></THead>
          <TBody>
            {rows.length ? rows.map((r) => {
              const live = r.status === "booked" || r.status === "confirmed";
              return (
                <TR key={r.id} className={r.status === "cancelled" || r.status === "no_show" ? "opacity-60" : ""}>
                  <TD><div className="font-medium">{mode === "day" ? formatTime(r.starts_at) : formatDateTime(r.starts_at)}</div><div className="text-xs text-fg-muted">until {formatTime(r.ends_at)}</div></TD>
                  <TD><div className="font-medium">{r.guest_name}</div><div className="text-xs text-fg-muted">{r.phone ?? "-"}{r.customer_id ? " · customer" : ""}</div></TD>
                  <TD right>{r.party_size}</TD>
                  <TD>{r.table_code ? <Badge variant="outline">{r.table_code}</Badge> : <span className="text-xs text-fg-muted">unassigned</span>}</TD>
                  <TD><Badge variant={reservationStatusVariant(r.status)}>{titleCase(r.status)}</Badge>{r.reminder_sent_at ? <div className="text-[11px] text-fg-muted">reminded</div> : null}</TD>
                  <TD right>{r.deposit_minor ? formatMoney(r.deposit_minor) : "-"}</TD>
                  <TD className="max-w-xs truncate text-fg-secondary">{r.notes ?? ""}</TD>
                  <TD right>
                    <div className="flex justify-end gap-0.5">
                      {r.status === "booked" ? <Button variant="ghost" size="icon-sm" title="Confirm" aria-label="Confirm" onClick={() => act.mutate({ r, action: "confirm" })}><Check className="h-4 w-4 text-success" /></Button> : null}
                      {live ? <Button variant="ghost" size="icon-sm" title="Seat" aria-label="Seat" onClick={() => setSeat({ r, table_id: r.table_id ?? "" })}><Armchair className="h-4 w-4 text-primary" /></Button> : null}
                      {live ? <Button variant="ghost" size="icon-sm" title="No show" aria-label="No show" onClick={() => act.mutate({ r, action: "no_show" })}><UserX className="h-4 w-4 text-warning" /></Button> : null}
                      {live ? <Button variant="ghost" size="icon-sm" title="Cancel" aria-label="Cancel" onClick={() => act.mutate({ r, action: "cancelled" })}><Ban className="h-4 w-4 text-danger" /></Button> : null}
                      {r.status === "seated" ? <Button variant="ghost" size="icon-sm" title="Complete" aria-label="Complete" onClick={() => act.mutate({ r, action: "completed" })}><Flag className="h-4 w-4 text-success" /></Button> : null}
                    </div>
                  </TD>
                </TR>
              );
            }) : <EmptyRow colSpan={8}>{mode === "day" ? `No reservations on ${formatDate(day)}.` : "No upcoming reservations."}</EmptyRow>}
          </TBody>
        </Table>
      )}
      <LoadMore cursor={list.nextCursor} onLoad={() => list.fetchNextPage()} loading={list.isFetchingNextPage} />
      <Dialog open={!!form} onClose={() => setForm(null)} title="New reservation" description="Pick a customer or type a guest name. The table list shows only tables free for that time." size="lg"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={create.isPending} disabled={!form || (!form.customer && !form.guest_name.trim()) || !fromLocalInput(form.starts_at)} onClick={() => form && create.mutate(form)}>Book</Button></>}>
        {form ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer" hint="Optional; needed to hold a deposit on khata" className="sm:col-span-2"><CustomerPicker value={form.customer} onPick={(c) => setForm({ ...form, customer: c, guest_name: form.guest_name || c.name, phone: form.phone || c.phone || "" })} onClear={() => setForm({ ...form, customer: null })} /></Field>
            <Field label="Guest name"><Input value={form.guest_name} onChange={(e) => setForm({ ...form, guest_name: e.target.value })} placeholder={form.customer?.name ?? "Name"} /></Field>
            <Field label="Phone" hint="For the WhatsApp confirmation and reminder"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0300 1234567" /></Field>
            <Field label="Party size"><Input type="number" min={1} className="tabular" value={form.party_size} onChange={(e) => setForm({ ...form, party_size: e.target.value })} /></Field>
            <Field label="Duration (minutes)"><Select value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })}>{["60", "90", "120", "150", "180"].map((d) => <option key={d} value={d}>{d} min</option>)}</Select></Field>
            <Field label="Starts"><Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></Field>
            <Field label="Table" hint={availability.data ? `${availability.data.tables.length} free for this time` : undefined}>
              <Select value={form.table_id} onChange={(e) => setForm({ ...form, table_id: e.target.value })}>
                <option value="">Assign later</option>
                {availability.data?.tables.map((t) => <option key={t.id} value={t.id}>{t.code}{t.name ? ` · ${t.name}` : ""} · {t.seats} seats{t.location ? ` · ${t.location}` : ""}</option>)}
              </Select>
            </Field>
            <Field label="Deposit" hint={form.deposit_minor && !form.customer ? "Pick a customer to record a deposit" : "Recorded as a khata payment; applied at the bill"}><MoneyInput value={form.deposit_minor} onChange={(v) => setForm({ ...form, deposit_minor: v })} /></Field>
            <Field label="Deposit method"><Select value={form.deposit_method_code} onChange={(e) => setForm({ ...form, deposit_method_code: e.target.value })} disabled={!form.deposit_minor}>{methods.data?.filter((m) => m.active && m.kind !== "khata").map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</Select></Field>
            <Field label="Notes" className="sm:col-span-2"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Window seat, birthday cake, high chair…" /></Field>
          </div>
        ) : null}
      </Dialog>
      <Dialog open={!!seat} onClose={() => setSeat(null)} title={seat ? `Seat ${seat.r.guest_name}` : ""} description="Opens a dine-in order on the table so the deposit can be applied at payment." size="sm"
        footer={<><Button variant="secondary" onClick={() => setSeat(null)}>Cancel</Button><Button loading={act.isPending} disabled={!seat?.table_id} onClick={() => seat && act.mutate({ r: seat.r, action: "seat", body: { table_id: seat.table_id } })}>Seat party</Button></>}>
        {seat ? (
          <Field label="Table" hint={seat.r.table_code ? `Reserved on ${seat.r.table_code}` : "No table was reserved; choose one"}>
            <Select value={seat.table_id} onChange={(e) => setSeat({ ...seat, table_id: e.target.value })} autoFocus>
              <option value="">Choose…</option>
              {tables.data?.filter((t) => !t.archived_at && !t.merged_into_table_id).map((t) => <option key={t.id} value={t.id}>{t.code}{t.name ? ` · ${t.name}` : ""} · {t.seats} seats{t.status !== "available" ? ` · ${titleCase(t.status)}` : ""}</option>)}
            </Select>
          </Field>
        ) : null}
      </Dialog>
    </>
  );
}
