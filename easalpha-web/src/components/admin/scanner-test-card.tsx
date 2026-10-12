"use client";
// SPEC Settings > Point of Sale > Barcode Scanning: a place to try a scanner against the saved settings. Each scan
// shows what the scanner really sent (control keys made visible), the timing, the prefix / suffix / terminator it
// seems to use, whether the till would accept it, and what it would add (GET /products/barcode_lookup).
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ScanLine, XCircle } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import type { BarcodeRow, Product } from "@/lib/types";
import {
  FORMAT_LABELS, barcodeFormat, equivalentCodes, explainCapture, findBarcode, parseScaleLabel, scannerConfig, visibleKey, type CaptureReport, type KeyStroke, type ScaleConfig, type ScanReject,
} from "@/lib/barcode";
import { useSettings } from "@/components/admin/settings-screen";
import { useAuthStore } from "@/store/auth";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Keys closer together than this belong to one test scan. */
const CAPTURE_GAP_MS = 300;
const MODIFIERS = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock", "NumLock"]);
const REASONS: Record<ScanReject, string> = {
  too_short: "too short",
  missing_prefix: "the prefix is missing",
  missing_suffix: "the suffix is missing",
  wrong_terminator: "it ends with a different key",
  no_terminator: "no Enter or Tab after the code",
};

type Lookup = { state: "loading" } | { state: "found"; text: string } | { state: "missing" } | { state: "error"; text: string };
interface Entry { id: number; at: Date; report: CaptureReport; lookup: Lookup }

type LookupRow = BarcodeRow & { product: Product };
const describe = (r: LookupRow, currency?: string) =>
  `${r.product_name}${r.variant_name ? ` (${r.variant_name})` : ""}${Number(r.quantity) !== 1 ? `, pack of ${Number(r.quantity)}` : ""} · ${formatMoney(Math.round(r.price_minor * (Number(r.quantity) || 1)), currency)}`;

async function lookupCode(code: string, scale: ScaleConfig, currency?: string): Promise<Lookup> {
  const get = async (c: string) => {
    try { return await api<LookupRow>("/products/barcode_lookup", { query: { code: c } }); }
    catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e; }
  };
  if (!code) return { state: "missing" };
  try {
    for (const c of [code, ...equivalentCodes(code)]) {
      const r = await get(c);
      if (r) return { state: "found", text: describe(r, currency) };
    }
    const label = parseScaleLabel(code, scale);
    const r = label ? await get(label.itemCode) : null;
    const m = label && r ? findBarcode([r.product], code, { scale }) : null;
    if (label && m) {
      const value = label.kind === "weight" ? `${m.quantity} kg` : `${formatMoney(label.priceMinor, currency)} = ${m.quantity} kg`;
      return { state: "found", text: `${m.product.name} (scale label, ${value})` };
    }
    return { state: "missing" };
  } catch (e) { return { state: "error", text: errorMessage(e) }; }
}

/** The keys of a scan: printable runs in monospace, control and named keys as chips. */
function RawKeys({ keys }: { keys: string[] }) {
  const parts: { text: string; control: boolean }[] = [];
  for (const k of keys) {
    const v = visibleKey(k);
    const prev = parts[parts.length - 1];
    if (!v.control && prev && !prev.control) prev.text += v.text;
    else parts.push({ ...v });
  }
  return (
    <span className="flex flex-wrap items-center gap-1 font-mono text-sm">
      {parts.map((p, i) => p.control
        ? <span key={i} className="rounded bg-primary-soft px-1.5 text-xs leading-5 text-primary-ink">{p.text}</span>
        : <span key={i} className="break-all">{p.text}</span>)}
    </span>
  );
}

export function ScannerTestCard() {
  const settings = useSettings();
  const currency = useAuthStore((s) => s.session?.business.currency);
  const values = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const g of Object.values(settings.data?.groups ?? {})) for (const keys of Object.values(g.screens)) for (const k of keys) if (k.key.startsWith("pos.barcode_scanning.")) out[k.key] = k.value;
    return out;
  }, [settings.data]);
  const config = useMemo(() => scannerConfig(values), [values]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [focused, setFocused] = useState(false);
  const capture = useRef<KeyStroke[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seq = useRef(0);
  const live = useRef({ config, currency });
  useEffect(() => { live.current = { config, currency }; });
  useEffect(() => () => clearTimeout(timer.current), []);

  const finish = () => {
    const strokes = capture.current;
    capture.current = [];
    if (!strokes.some((s) => !MODIFIERS.has(s.key))) return;
    const { config: c, currency: cur } = live.current;
    const report = explainCapture(strokes, c);
    const id = ++seq.current;
    setEntries((list) => [{ id, at: new Date(), report, lookup: { state: "loading" } as Lookup }, ...list].slice(0, 6));
    void lookupCode(report.lookupCode, c.scale, cur).then((lookup) => setEntries((list) => list.map((e) => (e.id === id ? { ...e, lookup } : e))));
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { e.currentTarget.blur(); return; }
    const time = e.nativeEvent.timeStamp || performance.now();
    const prev = capture.current[capture.current.length - 1];
    // A Tab on its own moves focus as usual; inside a scan it is the scanner's terminator.
    if (e.key === "Tab" && !(prev && time - prev.time < CAPTURE_GAP_MS)) return;
    e.preventDefault();
    if (e.repeat) return;
    capture.current.push({ key: e.key, time });
    clearTimeout(timer.current);
    timer.current = setTimeout(finish, CAPTURE_GAP_MS);
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex-wrap">
        <CardTitle>Test your scanner</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={config.enabled ? "success" : "warning"}>{config.enabled ? "Scanning is on" : "Scanning is off"}</Badge>
          {entries.length ? <Button size="sm" variant="ghost" onClick={() => setEntries([])}>Clear</Button> : null}
        </div>
      </CardHeader>
      <CardBody className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-3">
          <div tabIndex={0} role="textbox" aria-label="Scanner test area. Click here, then scan a code." aria-readonly onKeyDown={onKeyDown} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            className={cn("grid min-h-24 cursor-text place-items-center rounded-xl border-2 border-dashed px-4 text-center text-sm transition-colors focus:outline-none", focused ? "border-primary bg-primary-soft text-primary-ink" : "border-border-strong text-fg-secondary")}>
            <span className="flex items-center gap-2"><ScanLine className="h-5 w-5" />{focused ? "Ready: scan a barcode now" : "Click here, then scan a barcode"}</span>
          </div>
          <p className="text-xs text-fg-muted">
            Uses the saved Barcode Scanning settings{config.prefix || config.suffix ? ` (prefix "${config.prefix}", suffix "${config.suffix}")` : ""}: terminator {config.terminator === "none" ? "nothing" : config.terminator === "tab" ? "Tab" : "Enter"}, min length {config.minLength}, keys at most {config.maxKeyIntervalMs} ms apart. Save that card after a change, then scan again.
          </p>
          {entries.map(({ id, at, report, lookup }) => {
            const ok = !!report.result?.ok;
            const slowest = report.gaps.length ? Math.max(...report.gaps) : 0;
            const fastest = report.gaps.length ? Math.min(...report.gaps) : 0;
            const code = report.lookupCode;
            return (
              <div key={id} className="space-y-2 rounded-xl border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={cn("flex items-center gap-1.5 text-sm font-medium", ok ? "text-success-ink" : "text-danger-ink")}>
                    {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {ok ? "Accepted as a scan" : report.result && !report.result.ok ? `Not accepted: ${REASONS[report.result.reason]}` : "Not accepted: too slow for a scanner"}
                  </span>
                  <span className="text-xs text-fg-muted tabular">{at.toLocaleTimeString()}</span>
                </div>
                <RawKeys keys={report.keys} />
                <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                  <div><dt className="inline text-fg-muted">Keys: </dt><dd className="inline tabular">{report.keys.length}{report.gaps.length ? `, ${Math.round(fastest)} to ${Math.round(slowest)} ms apart` : ""}</dd></div>
                  <div><dt className="inline text-fg-muted">Ends with: </dt><dd className="inline">{report.end === "enter" ? "Enter" : report.end === "tab" ? "Tab" : "nothing"}</dd></div>
                  <div><dt className="inline text-fg-muted">Prefix: </dt><dd className="inline font-mono">{report.guess.prefix || "none seen"}</dd></div>
                  <div><dt className="inline text-fg-muted">Suffix: </dt><dd className="inline font-mono">{report.guess.suffix || "none seen"}</dd></div>
                </dl>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-fg-muted">Looks up</span>
                  <span className="font-mono">{code || "(empty)"}</span>
                  {code ? <Badge variant="outline">{FORMAT_LABELS[barcodeFormat(code)]}</Badge> : null}
                  <span aria-live="polite">
                    {lookup.state === "loading" ? <span className="text-fg-muted">checking…</span>
                      : lookup.state === "found" ? <b>{lookup.text}</b>
                        : lookup.state === "missing" ? <span className="text-danger-ink">Not found</span>
                          : <span className="text-danger-ink">Could not check: {lookup.text}</span>}
                  </span>
                </div>
                {report.advice.length ? <ul className="list-disc space-y-0.5 pl-5 text-xs text-fg-secondary">{report.advice.map((a) => <li key={a}>{a}</li>)}</ul> : null}
              </div>
            );
          })}
        </div>
        <div className="space-y-2 text-sm text-fg-secondary">
          <div className="font-medium text-heading">Setup tips</div>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Most USB scanners work as a keyboard: plug in, click the box and scan. They end each code with Enter.</li>
            <li>Bluetooth scanners: pair them in HID (keyboard) mode, not SPP or serial mode.</li>
            <li>Keep the keyboard layout of this computer or tablet on English (US). On other layouts digits can arrive as symbols.</li>
            <li>If a prefix or suffix shows above (like ]E0 or *), set it in Barcode Scanning so it is removed, or switch it off with the scanner&apos;s setup guide.</li>
            <li>Tablets and phones can scan with the camera: the Scan button beside the item search on the POS.</li>
            <li>Weighing-scale labels: turn on scale barcodes and save each item&apos;s PLU as its product barcode.</li>
          </ul>
        </div>
      </CardBody>
    </Card>
  );
}
