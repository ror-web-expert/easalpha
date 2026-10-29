"use client";
// The canteen kiosk: a worker puts a finger on the reader (which types the id like a keyboard), taps a dish, and a
// token appears and prints. Works with no internet: today's plan, the workers and the claims are kept locally, a claim
// made offline is queued (type meal_claim) and the "already taken" rule is applied here before it is applied again on
// the server. Several kiosks in one canteen agree through the server when online; offline each one knows what it has
// served itself plus everything the server had at its last sync.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Fingerprint, Search, Utensils, Wifi, WifiOff, X, XCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { kvGet, kvSet } from "@/lib/db";
import { enqueue, startSync } from "@/lib/sync";
import { useOnline } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";
import { printJob } from "@/lib/print";
import type { CanteenSync, CanteenToday, CanteenWorker, MealClaim, MealPlanItem } from "@/lib/types";
import { useDeviceStore } from "@/store/device";
import { useCatalogStore } from "@/store/catalog";
import { useBeep } from "@/components/kitchen/auth";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { alreadyTaken, nextTokenLabel, parseWedge, sessionWindow, tokenLines, workerByFingerprint, type TokenState } from "./helpers";

type Who = { fingerprint_id?: string; employee_id?: string; name?: string };
type Result = { kind: "ok" | "taken" | "error"; title: string; detail?: string; token?: string; offline?: boolean };

const RESULT_MS = 6000;

export function CanteenKiosk() {
  const online = useOnline();
  const qc = useQueryClient();
  const beep = useBeep();
  const device = useDeviceStore((s) => s.device);
  const business = useDeviceStore((s) => s.business);
  const settings = useCatalogStore((s) => s.catalog?.business.settings ?? null);
  const [cached, setCached] = useState<CanteenToday | null>(null);
  const [sync, setSync] = useState<CanteenSync | null>(null);
  const [localClaims, setLocalClaims] = useState<MealClaim[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<Who | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const today = useQuery({ queryKey: ["canteen_today"], queryFn: () => api<CanteenToday>("/canteen/today", { auth: "pos", timeoutMs: 8000 }), refetchInterval: 30_000, retry: false });
  const claims = useQuery({ queryKey: ["canteen_claims_today"], queryFn: () => api<{ data: MealClaim[] }>("/canteen/claims", { auth: "pos", query: { limit: 2000 }, timeoutMs: 8000 }), refetchInterval: 15_000, retry: false, select: (r) => r.data });
  // The workers (for naming a finger and refusing a second helping with no connection) and the day's claims, every minute.
  const syncQuery = useQuery({ queryKey: ["canteen_sync"], queryFn: () => api<CanteenSync>("/canteen/sync", { auth: "pos", timeoutMs: 15_000 }), refetchInterval: 60_000, retry: false });
  useEffect(() => { if (syncQuery.data) { setSync(syncQuery.data); void kvSet("canteen_sync", syncQuery.data); } }, [syncQuery.data]);

  // Local copies: today's view, the sync payload (workers and claims) and the claims this kiosk made offline.
  useEffect(() => { if (today.data) void kvSet("canteen_today", today.data); }, [today.data]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [t, s, l] = await Promise.all([kvGet<CanteenToday>("canteen_today"), kvGet<CanteenSync>("canteen_sync"), kvGet<MealClaim[]>("canteen_local_claims")]);
      if (!alive) return;
      if (t) setCached(t);
      if (s) setSync(s);
      if (l) setLocalClaims(l);
    };
    void load();
    const stop = startSync({ pull: false }); // pushes the offline queue; the kiosk's own /canteen/sync call keeps its lists
    const every = setInterval(load, 60_000);
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => { alive = false; stop(); clearInterval(every); clearInterval(tick); };
  }, []);

  const data = today.data ?? cached;
  const session = data?.session ?? null;
  const plan = useMemo(() => data?.plans.find((p) => p.meal_session_id === session?.id && p.status === "published") ?? null, [data, session]);
  const items = useMemo(() => plan?.items ?? [], [plan]);
  const workers = useMemo<CanteenWorker[]>(() => sync?.workers ?? [], [sync]);
  const serverClaims = useMemo<MealClaim[]>(() => claims.data ?? sync?.claims ?? [], [claims.data, sync]);
  // Once the server has a claim this kiosk made offline, the local copy has done its job.
  useEffect(() => {
    if (!claims.data || !localClaims.length) return;
    const ids = new Set(claims.data.map((c) => c.id));
    const keep = localClaims.filter((c) => !ids.has(c.id) && c.plan_date === data?.date);
    if (keep.length !== localClaims.length) { setLocalClaims(keep); void kvSet("canteen_local_claims", keep); }
  }, [claims.data, localClaims, data?.date]);

  const reset = useCallback(() => { setResult(null); setPending(null); setSelected(null); setBusy(false); }, []);
  const show = useCallback((r: Result) => {
    setResult(r);
    beep(r.kind === "ok" ? [1320, 1760] : r.kind === "taken" ? [440, 330] : [330]);
    if (resultTimer.current) clearTimeout(resultTimer.current);
    resultTimer.current = setTimeout(reset, RESULT_MS);
  }, [beep, reset]);

  const print = useCallback(async (c: MealClaim, offline: boolean) => {
    if (data?.settings.print_token === false) return;
    try { await printJob({ role: "receipt", lines: tokenLines(c, business?.name ?? "Canteen", offline) }, { settings }); } catch { /* the screen shows the token either way */ }
  }, [data?.settings.print_token, business?.name, settings]);

  const taken = useCallback((c: MealClaim | undefined, message?: string) => {
    const at = c ? new Date(c.scanned_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    show({ kind: "taken", title: "Already taken", detail: c ? `${c.employee_name ?? "This worker"} took ${c.dish ?? "a meal"} at ${at}` : message, token: c?.token_label });
  }, [show]);

  const claim = useCallback(async (who: Who, itemId: string) => {
    if (!data || !session || busy) return;
    setBusy(true);
    const item = items.find((i) => i.id === itemId);
    const worker = who.employee_id ? workers.find((w) => w.id === who.employee_id) : who.fingerprint_id ? workerByFingerprint(workers, who.fingerprint_id) : undefined;
    if (worker) {
      const dup = alreadyTaken([...serverClaims, ...localClaims], worker.id, session.id, data.date);
      if (dup) { taken(dup); return; }
    }
    const seq = await kvGet<TokenState>("canteen_token_seq");
    const { label, state } = nextTokenLabel(device?.code ?? "K", data.date, seq);
    await kvSet("canteen_token_seq", state);
    const id = crypto.randomUUID();
    const payload = { fingerprint_id: who.fingerprint_id, employee_id: who.employee_id, meal_plan_item_id: itemId, meal_session_id: session.id, token_label: label, source: who.fingerprint_id ? "fingerprint" : "manual", client_created_at: new Date().toISOString() };
    if (online) {
      try {
        const c = await api<MealClaim>("/canteen/claims", { method: "POST", auth: "pos", body: { id, ...payload }, timeoutMs: 8000 });
        void qc.invalidateQueries({ queryKey: ["canteen_claims_today"] });
        void qc.invalidateQueries({ queryKey: ["canteen_today"] });
        show({ kind: "ok", title: c.employee_name ?? "", detail: c.dish ?? "", token: c.token_label });
        void print(c, false);
        return;
      } catch (e) {
        if (e instanceof ApiError && !e.isNetwork) {
          if (e.code === "canteen.already_taken") { taken((e.details as { claim?: MealClaim } | undefined)?.claim, e.message); return; }
          show({ kind: "error", title: e.code === "canteen.unknown_worker" ? "Finger not recognised" : "Could not record the meal", detail: e.message });
          return;
        }
        // the connection dropped mid-request: carry on offline
      }
    }
    if (!worker) { show({ kind: "error", title: "No connection", detail: "This finger is not in the kiosk's list yet. Try again when the connection is back, or ask the counter." }); return; }
    if (!item) { show({ kind: "error", title: "Choose a dish" }); return; }
    const local: MealClaim = {
      id, employee_id: worker.id, employee_name: worker.name, customer_id: worker.customer_id, order_id: null, meal_session_id: session.id, session: session.name, meal_plan_item_id: itemId, dish: item.name,
      plan_date: data.date, token_no: 0, token_label: label, status: "claimed", scanned_at: payload.client_created_at, served_at: null, cancelled_at: null, cancel_reason: null, source: payload.source,
      device_id: device?.id ?? null, worker_price_minor: item.worker_price_minor ?? item.price_minor, company_share_minor: 0,
    };
    const next = [...localClaims, local];
    setLocalClaims(next);
    await kvSet("canteen_local_claims", next);
    await enqueue({ type: "meal_claim", id, payload });
    show({ kind: "ok", title: worker.name, detail: item.name, token: label, offline: true });
    void print(local, true);
  }, [data, session, busy, items, workers, serverClaims, localClaims, device, online, qc, show, print, taken]);

  const onScan = useCallback((fingerprintId: string) => {
    if (result) reset();
    if (!session) { show({ kind: "error", title: "No meal is being served now" }); return; }
    if (!items.length) { show({ kind: "error", title: `Today's ${session.name} menu is not published yet` }); return; }
    // A worker who already ate this session is refused at once, before any dish is chosen.
    const w = workerByFingerprint(workers, fingerprintId);
    if (w && data) { const dup = alreadyTaken([...serverClaims, ...localClaims], w.id, session.id, data.date); if (dup) { taken(dup); return; } }
    const itemId = selected ?? (items.length === 1 ? items[0].id : null);
    if (itemId) void claim({ fingerprint_id: fingerprintId }, itemId);
    else setPending({ fingerprint_id: fingerprintId, name: w?.name });
  }, [result, reset, session, items, selected, claim, workers, show, data, serverClaims, localClaims, taken]);

  // The reader types the id and Enter. Keys typed into a search box are the search box's.
  useEffect(() => {
    let buf = "";
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "Enter") { const id = parseWedge(buf); buf = ""; if (id) onScan(id); return; }
      if (e.key.length === 1) { buf += e.key; if (timer) clearTimeout(timer); timer = setTimeout(() => { buf = ""; }, 600); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); if (timer) clearTimeout(timer); };
  }, [onScan]);

  const chooseItem = (item: MealPlanItem) => {
    if (item.sold_out) return;
    if (pending) void claim(pending, item.id);
    else setSelected((s) => (s === item.id ? null : item.id));
  };

  const todayClaims = serverClaims.length + localClaims.length;
  const sessionLabel = session ? sessionWindow(session) : "No meal is being served now";
  const nextSession = !session && data ? data.sessions.find((s) => s.starts_at > now.toTimeString().slice(0, 5)) : null;

  return (
    <div className="flex h-screen flex-col bg-navy-deep text-white [--heading-color:#fff]">
      <header className="flex h-16 items-center gap-4 border-b border-white/10 bg-navy px-5">
        <Utensils className="h-7 w-7 text-brand-orange" />
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold leading-tight">{business?.name ?? "Canteen"}{data?.branch ? <span className="text-white/60"> · {data.branch.name}</span> : null}</div>
          <div className="truncate text-sm text-white/70">{sessionLabel}{nextSession ? ` · next: ${sessionWindow(nextSession)}` : ""}</div>
        </div>
        <div className="flex-1" />
        <div className="hidden text-right sm:block">
          <div className="text-sm text-white/70">Meals today</div>
          <div className="text-2xl font-bold tabular">{todayClaims}</div>
        </div>
        <div className="text-3xl font-semibold tabular">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
        <span className={cn("flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold", online ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200")} title={online ? "Connected" : "Offline: meals are saved here and sent when the connection returns"}>
          {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}{online ? "Online" : "Offline"}
        </span>
      </header>

      <main className="grid flex-1 grid-cols-1 gap-5 overflow-hidden p-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <Fingerprint className={cn("h-32 w-32", pending ? "text-brand-orange" : "text-white/70")} />
          {pending ? (
            <>
              <div className="mt-4 text-3xl font-bold">{pending.name ? `Hello, ${pending.name}` : "Finger read"}</div>
              <div className="mt-2 text-xl text-white/80">Now tap your dish</div>
              <Button variant="ghost" className="mt-6 text-white/70 hover:bg-white/10" onClick={reset}><X className="h-4 w-4" /> Cancel</Button>
            </>
          ) : (
            <>
              <div className="mt-4 text-3xl font-bold">Place your finger on the reader</div>
              <div className="mt-2 text-xl text-white/80">{items.length > 1 ? (selected ? "Dish chosen. Scan to confirm." : "Tap your dish first or scan now and choose after") : items.length === 1 ? `Today: ${items[0].name}` : "No menu published for now"}</div>
              <div className="mt-3 text-lg text-white/60">انگلی رکھیں، پھر اپنا کھانا چنیں</div>
            </>
          )}
        </section>

        <section className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">{session ? `${session.name} menu` : "Menu"}</h2>
            {plan ? <span className="text-sm text-white/60">{plan.claims} served of {plan.planned || "open"} planned</span> : null}
          </div>
          <div className={cn("grid flex-1 gap-4 overflow-y-auto", items.length > 4 ? "grid-cols-3" : "grid-cols-2")}>
            {items.map((item) => (
              <button key={item.id} type="button" disabled={item.sold_out || busy} onClick={() => chooseItem(item)} data-testid="dish"
                className={cn("flex min-h-36 flex-col items-center justify-center rounded-2xl border-4 bg-card p-4 text-center text-fg transition disabled:opacity-40",
                  selected === item.id ? "border-cta ring-4 ring-cta/40" : "border-transparent hover:border-white/40")}>
                <div className="text-2xl font-bold leading-tight">{item.name}</div>
                {item.name_ur ? <div className="mt-1 text-lg text-fg-secondary">{item.name_ur}</div> : null}
                <div className="mt-2 text-xl font-semibold text-cta-ink">{formatMoney(item.worker_price_minor ?? item.price_minor)}</div>
                <div className="mt-1 text-xs text-fg-muted">{item.sold_out ? "Finished" : item.planned_qty ? `${Math.max(item.planned_qty - item.claims_count, 0)} left` : `${item.claims_count} taken`}</div>
              </button>
            ))}
            {!items.length ? <div className="col-span-full grid place-items-center py-16 text-2xl text-white/50">{session ? "Today's menu is not published yet" : "Between meals"}</div> : null}
          </div>
        </section>
      </main>

      <footer className="flex h-14 items-center gap-3 border-t border-white/10 bg-navy px-5 text-sm text-white/70">
        {data?.settings.manual_lookup !== false ? <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => setManual(true)}><Search className="h-4 w-4" /> Find worker by name or number</Button> : null}
        <div className="flex-1" />
        <span>{device?.code ? `Kiosk ${device.code}` : ""}{localClaims.length ? ` · ${localClaims.length} waiting to send` : ""}</span>
      </footer>

      {result ? (
        <div className={cn("fixed inset-0 z-40 flex flex-col items-center justify-center p-8 text-center text-white", result.kind === "ok" ? "bg-emerald-600" : result.kind === "taken" ? "bg-rose-600" : "bg-amber-600")} onClick={reset} role="status" data-testid="result">
          {result.kind === "ok" ? <CheckCircle2 className="h-24 w-24" /> : <XCircle className="h-24 w-24" />}
          {result.kind === "ok" ? <div className="mt-4 text-2xl">Your token</div> : null}
          {result.token ? <div className="text-[18vw] font-black leading-none tabular lg:text-[160px]">{result.token}</div> : null}
          <div className="mt-4 text-4xl font-bold">{result.title}</div>
          {result.detail ? <div className="mt-2 max-w-3xl text-2xl text-white/90">{result.detail}</div> : null}
          <div className="mt-6 text-xl text-white/80">{result.kind === "ok" ? (result.offline ? "Collect at the counter (saved offline)" : "Collect at the counter") : result.kind === "taken" ? "One meal per session" : "Ask the counter for help"}</div>
        </div>
      ) : null}

      {manual ? <ManualLookup workers={workers} online={online} onClose={() => setManual(false)} onPick={(w) => { setManual(false); const itemId = selected ?? (items.length === 1 ? items[0].id : null); if (itemId) void claim({ employee_id: w.id, name: w.name }, itemId); else setPending({ employee_id: w.id, name: w.name }); }} /> : null}
    </div>
  );
}

function ManualLookup({ workers, online, onClose, onPick }: { workers: CanteenWorker[]; online: boolean; onClose: () => void; onPick: (w: CanteenWorker) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CanteenWorker[]>([]);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRows([]); return; }
    const local = () => {
      const t = term.toLowerCase(); const digits = term.replace(/\D/g, "").replace(/^0/, "");
      setRows(workers.filter((w) => w.name.toLowerCase().includes(t) || (digits.length >= 4 && ((w.phone ?? "").includes(digits) || (w.cnic ?? "").replace(/-/g, "").includes(digits)))).slice(0, 20));
    };
    if (!online) { local(); return; }
    const h = setTimeout(() => { api<{ data: CanteenWorker[] }>("/canteen/workers", { auth: "pos", query: { q: term }, timeoutMs: 5000 }).then((r) => setRows(r.data)).catch(local); }, 250);
    return () => clearTimeout(h);
  }, [q, workers, online]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-6 pt-16" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl bg-card p-5 text-fg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-semibold">Find a worker</h2><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></Button></div>
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or CNIC" className="h-14 text-xl" />
        <div className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto">
          {rows.map((w) => (
            <button key={w.id} type="button" onClick={() => onPick(w)} className="flex w-full items-center justify-between rounded-xl border bg-page px-4 py-3 text-left hover:border-primary">
              <div><div className="text-lg font-semibold">{w.name}</div><div className="text-sm text-fg-muted">{[w.department, w.designation, w.phone].filter(Boolean).join(" · ")}</div></div>
              <span className="text-sm text-primary">Choose</span>
            </button>
          ))}
          {q.trim().length >= 2 && !rows.length ? <p className="py-6 text-center text-fg-muted">Nobody matches</p> : null}
        </div>
      </div>
    </div>
  );
}
