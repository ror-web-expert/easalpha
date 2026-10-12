"use client";
// Barcode scanning on the till: a USB / Bluetooth scanner that types like a keyboard (useBarcodeScanner), the tablet
// camera (CameraScanDialog), and attaching an unknown code to a product (UnknownCodeDialog). useTillScanner ties them
// to the local catalog: a code found there works offline; otherwise the server is asked once (the catalog may be stale).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, ScanLine } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { kvSet } from "@/lib/db";
import { useOnline } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";
import { priceFor } from "@/lib/pricing";
import { isOnline } from "@/lib/sync";
import type { BarcodeRow, Catalog, Product, ProductBarcode } from "@/lib/types";
import {
  FORMAT_LABELS, barcodeFormat, createScanDetector, findBarcode, parseScaleLabel, scannerConfig, type BarcodeMatch, type ScanResult, type ScaleConfig, type ScannerConfig,
} from "@/lib/barcode";
import { useApproval } from "@/components/approval";
import { Badge, Button, Dialog, Field, Input, Select, Switch } from "@/components/ui";
import { useCatalogStore } from "@/store/catalog";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";

// ---- Keyboard-wedge scanner ----

const NON_TEXT_INPUTS = ["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"];

/** A field the user types into, where ordinary keys must be left alone. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  return el instanceof HTMLInputElement && !NON_TEXT_INPUTS.includes(el.type);
}

/** Scans count when focus is outside text fields, or in a field marked data-scan-target (the till's item search). */
export function acceptsScan(el: EventTarget | null): boolean {
  return !isTypingTarget(el) || (el instanceof HTMLElement && !!el.closest("[data-scan-target]"));
}

/** Takes the scanner's characters back out of the field they were typed into (works with React-controlled inputs). */
function removeTyped(el: EventTarget | null, typed: string) {
  if (!typed || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  const at = el.value.lastIndexOf(typed);
  if (at < 0) return;
  const next = el.value.slice(0, at) + el.value.slice(at + typed.length);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Listens to every keydown on the window (capture phase) while enabled and calls onScan with each scanned code.
 * Ordinary typing is never blocked: characters still reach the focused field, and only the scan's terminator key is
 * swallowed. A scan typed into the item search (data-scan-target) is caught and the field cleared; scans typed into
 * other text fields are left to that field.
 */
export function useBarcodeScanner({ config, enabled, onScan, accept = acceptsScan }: { config: ScannerConfig; enabled: boolean; onScan: (code: string) => void; accept?: (target: EventTarget | null) => boolean }) {
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; });
  const { prefix, suffix, terminator, minLength, maxKeyIntervalMs } = config;
  useEffect(() => {
    if (!enabled) return;
    const detector = createScanDetector({ prefix, suffix, terminator, minLength, maxKeyIntervalMs });
    let target: EventTarget | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const take = (r: ScanResult | null, from: EventTarget | null): boolean => {
      if (!r?.ok || !accept(from)) return false;
      if (isTypingTarget(from)) removeTyped(from, r.burst.raw);
      onScanRef.current(r.code);
      return true;
    };
    const onKey = (e: KeyboardEvent) => {
      clearTimeout(timer);
      // Shortcuts (Ctrl+V, Cmd+F), held keys and IME input are a person. Ctrl+Alt is AltGr on some layouts: let it through.
      if (e.isComposing || e.repeat || e.metaKey || (e.ctrlKey && !e.altKey)) { detector.reset(); return; }
      const from = target;
      // event.timeStamp is when the key was pressed, so a busy page does not stretch the gaps between keys.
      const time = e.timeStamp > 1e12 || !e.timeStamp ? performance.now() : e.timeStamp;
      const r = detector.feed({ key: e.key, time });
      if (detector.length === 1) target = e.target;
      if (take(r, from) && r!.burst.end !== "pause") { e.preventDefault(); e.stopPropagation(); }
      if (detector.length) timer = setTimeout(() => take(detector.flush(performance.now()), target), maxKeyIntervalMs + 20);
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); clearTimeout(timer); };
  }, [enabled, prefix, suffix, terminator, minLength, maxKeyIntervalMs, accept]);
}

// ---- Tones ----

let audio: AudioContext | null = null;

/** A short high beep when a scan adds an item; a low double tone when the code is not found. */
export function playScanTone(kind: "ok" | "unknown") {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    if (audio.state === "suspended") void audio.resume();
    const tones: [freq: number, at: number, length: number][] = kind === "ok" ? [[1760, 0, 0.09]] : [[240, 0, 0.16], [180, 0.2, 0.24]];
    for (const [freq, at, length] of tones) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = kind === "ok" ? "square" : "sine";
      osc.frequency.value = freq;
      const t0 = audio.currentTime + at;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(kind === "ok" ? 0.08 : 0.2, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
      osc.connect(gain).connect(audio.destination);
      osc.start(t0);
      osc.stop(t0 + length + 0.02);
    }
  } catch {
    // No sound is fine.
  }
}

// ---- Local catalog ----

/** Puts a product the server sent back into the till's catalog (memory and IndexedDB), so its codes work offline. */
export async function saveProductLocally(p: Product) {
  const cur = useCatalogStore.getState().catalog;
  if (!cur) return;
  const known = cur.products.some((x) => x.id === p.id);
  const catalog: Catalog = { ...cur, products: known ? cur.products.map((x) => (x.id === p.id ? p : x)) : [...cur.products, p] };
  useCatalogStore.setState({ catalog });
  await kvSet("catalog", catalog);
}

/** GET /products/barcode_lookup for a code the local catalog does not know; a scale label is also tried by its item code. */
async function lookupOnline(code: string, scale: ScaleConfig): Promise<Product | null> {
  const label = parseScaleLabel(code, scale);
  for (const c of label ? [code, label.itemCode] : [code]) {
    try {
      const r = await api<BarcodeRow & { product: Product }>("/products/barcode_lookup", { query: { code: c }, auth: "pos", timeoutMs: 6000 });
      return r.product;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) continue;
      throw e;
    }
  }
  return null;
}

function useHasCamera(want: boolean) {
  const [has, setHas] = useState(false);
  useEffect(() => {
    if (!want) return;
    const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
    if (!media?.getUserMedia) { setHas(false); return; }
    if (!media.enumerateDevices) { setHas(true); return; }
    let live = true;
    media.enumerateDevices().then((list) => { if (live) setHas(list.some((d) => d.kind === "videoinput")); }).catch(() => { if (live) setHas(true); });
    return () => { live = false; };
  }, [want]);
  return want && has;
}

type Finder = (code: string, products?: Product[]) => BarcodeMatch | null;

/**
 * Everything the sell screen needs for scanning. onMatch adds the item (return false when it refused, e.g. the
 * product is switched off). Returns the typed-code lookup for the item search, the camera button (only when the
 * camera setting is on and the device has a camera), and the dialogs to render.
 */
export function useTillScanner({ catalog, orderType, paused, onMatch }: { catalog: Catalog | null; orderType: string; paused?: boolean; onMatch: (m: BarcodeMatch) => boolean | void }) {
  const settings = catalog?.business.settings;
  const branchId = catalog?.branch?.id;
  const config = useMemo(() => scannerConfig(settings), [settings]);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const hasCamera = useHasCamera(config.enabled && config.camera);
  const onMatchRef = useRef(onMatch);
  useEffect(() => { onMatchRef.current = onMatch; });

  // Reads the store at call time, so a product saved a moment ago is found.
  const find = useCallback<Finder>((code, products) => findBarcode(products ?? useCatalogStore.getState().catalog?.products ?? [], code, {
    scale: config.scale, unitPrice: (p, v) => priceFor(p, orderType, v, branchId),
  }), [config.scale, orderType, branchId]);
  const add = useCallback((m: BarcodeMatch) => {
    const ok = onMatchRef.current(m) !== false;
    if (config.beep) playScanTone(ok ? "ok" : "unknown");
    return ok;
  }, [config.beep]);

  const resolve = useCallback(async (code: string): Promise<BarcodeMatch | null> => {
    let m = find(code);
    if (!m && isOnline()) {
      try {
        const p = await lookupOnline(code, config.scale);
        if (p) { await saveProductLocally(p); m = find(code); }
      } catch {
        // Offline or slow: same as not found.
      }
    }
    if (m) return add(m) ? m : null;
    if (config.beep) playScanTone("unknown");
    if (config.unknownCode === "ask") { setCameraOpen(false); setUnknown(code); }
    else toast.error("Not found", `No product has the code ${code}.`);
    return null;
  }, [find, add, config.scale, config.beep, config.unknownCode]);

  useBarcodeScanner({ config, enabled: config.enabled && !paused && !unknown && !cameraOpen, onScan: (code) => { void resolve(code); } });

  /** Enter in the item search: an exact code in the local catalog adds that item (true when it did). */
  const lookupTyped = useCallback((code: string) => {
    const m = find(code);
    if (!m) return false;
    add(m);
    return true;
  }, [find, add]);

  const cameraButton = config.enabled && config.camera && hasCamera ? (
    <Button variant="soft" size="lg" className="shrink-0" onClick={() => setCameraOpen(true)} aria-label="Scan a barcode with the camera"><ScanLine className="h-5 w-5" /> Scan</Button>
  ) : null;
  const dialogs = (
    <>
      <CameraScanDialog open={cameraOpen} onClose={() => setCameraOpen(false)} onCode={resolve} />
      <UnknownCodeDialog code={unknown} catalog={catalog} scale={config.scale} find={find} onClose={() => setUnknown(null)} onAdd={add} />
    </>
  );
  return { config, lookupTyped, cameraButton, dialogs };
}

// ---- Camera ----

interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(source: HTMLVideoElement): Promise<DetectedBarcode[]> }
interface BarcodeDetectorClass { new (opts?: { formats?: string[] }): BarcodeDetectorLike; getSupportedFormats?: () => Promise<string[]> }
const CAMERA_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];

function cameraProblem(e: unknown): string {
  const name = (e as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera permission was denied. Allow the camera for this site in the browser settings (the icon left of the address), then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device.";
  if (name === "NotReadableError" || name === "AbortError") return "The camera is in use by another app. Close that app and try again.";
  return `The camera could not start: ${errorMessage(e)}`;
}

/**
 * Reads barcodes and QR codes with the rear camera: the browser's BarcodeDetector where it exists (Chrome on Android,
 * Safari), otherwise ZXing, loaded only when this opens. The camera stops when the dialog closes.
 */
export function CameraScanDialog({ open, onClose, onCode }: { open: boolean; onClose: () => void; onCode: (code: string) => Promise<BarcodeMatch | null> | void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting");
  const [problem, setProblem] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [keepOpen, setKeepOpen] = useState(false);
  const [last, setLast] = useState<{ code: string; name: string | null } | null>(null);
  const live = useRef({ keepOpen, onCode, onClose });
  useEffect(() => { live.current = { keepOpen, onCode, onClose }; });

  useEffect(() => {
    if (!open) return;
    const video = videoRef.current;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controls: { stop: () => void } | null = null;
    const seen = new Map<string, number>();
    const fail = (message: string) => { if (!stopped) { setStatus("error"); setProblem(message); } };
    const report = async (code: string) => {
      const now = Date.now();
      if ((seen.get(code) ?? 0) > now - 2500) return; // the same code stays in view for a while
      seen.set(code, now);
      if (!live.current.keepOpen) { live.current.onClose(); void live.current.onCode(code); return; }
      const m = await live.current.onCode(code);
      if (!stopped) setLast({ code, name: m ? m.product.name : null });
    };
    setStatus("starting");
    setProblem("");
    setLast(null);
    (async () => {
      const media = navigator.mediaDevices;
      if (!media?.getUserMedia || !video) return fail("This browser cannot use the camera here. Open the till over HTTPS in Chrome, Edge or Safari.");
      try {
        stream = await media.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch (e) { return fail(cameraProblem(e)); }
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setStatus("scanning");
      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector;
      if (Detector) {
        const supported = (await Detector.getSupportedFormats?.().catch(() => [] as string[])) ?? [];
        const detector = new Detector({ formats: supported.length ? CAMERA_FORMATS.filter((f) => supported.includes(f)) : CAMERA_FORMATS });
        const tick = async () => {
          if (stopped) return;
          try {
            if (video.readyState >= 2) { const found = await detector.detect(video); if (found[0]?.rawValue) await report(found[0].rawValue.trim()); }
          } catch {
            // A frame that cannot be read; try the next one.
          }
          if (!stopped) timer = setTimeout(tick, 120);
        };
        void tick();
      } else {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (stopped) return;
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromStream(stream, video, (result) => { if (result) void report(result.getText().trim()); });
        if (stopped) controls.stop();
      }
    })().catch((e) => fail(cameraProblem(e)));
    return () => {
      stopped = true;
      clearTimeout(timer);
      controls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    };
  }, [open, attempt]);

  return (
    <Dialog open={open} onClose={onClose} title="Scan with camera" description="Hold the barcode or QR code inside the frame." size="md"
      footer={<>{status === "error" ? <Button variant="secondary" onClick={() => setAttempt((a) => a + 1)}>Try again</Button> : null}<Button variant="secondary" onClick={onClose}>Done</Button></>}>
      <div className="relative overflow-hidden rounded-xl bg-inverse text-inverse-fg">
        <video ref={videoRef} muted playsInline className={cn("aspect-video w-full object-cover", status === "error" && "invisible")} />
        {status === "scanning" ? <div className="pointer-events-none absolute inset-x-[12%] inset-y-[22%] rounded-lg border-2 border-inverse-primary" aria-hidden /> : null}
        {status === "starting" ? <div className="absolute inset-0 grid place-items-center text-sm"><span className="flex items-center gap-2"><Camera className="h-4 w-4" /> Starting the camera…</span></div> : null}
        {status === "error" ? <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm" role="alert">{problem}</div> : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Switch checked={keepOpen} onChange={setKeepOpen} label="Keep scanning" />
        {last ? <span className="text-sm">{last.name ? <>Added <b>{last.name}</b></> : <span className="text-danger">Not found</span>} <span className="font-mono text-fg-muted">{last.code}</span></span> : null}
      </div>
    </Dialog>
  );
}

// ---- Unknown code ----

/**
 * A scanned code no product has. The cashier picks the product (and size, pack quantity) and the code is saved on it
 * with POST /products/:id/barcodes; a cashier without menu rights needs a manager PIN. "Add once" sells it without
 * saving the code (also the only choice offline). A scale label saves its item code, not the whole label.
 */
export function UnknownCodeDialog({ code, catalog, scale, find, onClose, onAdd }: { code: string | null; catalog: Catalog | null; scale: ScaleConfig; find: Finder; onClose: () => void; onAdd: (m: BarcodeMatch) => boolean | void }) {
  const online = useOnline();
  const { run, dialog } = useApproval();
  const [q, setQ] = useState("");
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setQ(""); setProductId(""); setVariantId(""); setQuantity("1"); setError(null); }, [code]);
  const label = code ? parseScaleLabel(code, scale) : null;
  const saveCode = label ? label.itemCode : code ?? "";
  const currency = catalog?.business.currency;
  const products = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (catalog?.products ?? [])
      .filter((p) => p.active && !p.archived_at && (!term || p.name.toLowerCase().includes(term) || (p.sku ?? "").toLowerCase().includes(term) || (p.name_ur ?? "").includes(term)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 40);
  }, [catalog?.products, q]);
  const product = catalog?.products.find((p) => p.id === productId) ?? null;
  const qty = Number(quantity);
  const qtyOk = Number.isFinite(qty) && qty > 0;
  const entry: ProductBarcode = { code: saveCode, variant_id: variantId || null, quantity: String(label ? 1 : qty) };

  /** Runs the till's usual lookup against the product with this code added, so pack sizes and scale labels work the same. */
  const matchFor = (p: Product) => find(code ?? "", [{ ...p, barcodes: [...(p.barcodes ?? []).filter((b) => b.code !== saveCode), entry] }]);
  const addOnce = () => {
    if (!product || !code) return;
    const m = matchFor(product);
    if (!m) { setError("Could not read a quantity from this label."); return; }
    onAdd(m);
    onClose();
  };
  const save = async () => {
    if (!product || !code) return;
    setBusy(true);
    setError(null);
    try {
      const r = await run((pin) => api<{ barcode: ProductBarcode; product: Product }>(`/products/${product.id}/barcodes`, {
        method: "POST", auth: "pos", body: { code: saveCode, variant_id: variantId || undefined, quantity: label ? undefined : qty, approver_pin: pin },
      }), `Save code ${saveCode} on ${product.name}`);
      await saveProductLocally(r.product);
      const m = matchFor(r.product);
      toast.success("Code saved", `${saveCode} now adds ${product.name}.`);
      if (m) onAdd(m);
      onClose();
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "approval.cancelled")) setError(errorMessage(e));
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!code} onClose={onClose} size="md" title="Unknown code" description="No product has this code yet. Pick the product it belongs to."
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="secondary" onClick={addOnce} disabled={!product || !qtyOk}>Add once</Button>
        <Button onClick={save} loading={busy} disabled={!product || !qtyOk || !online}>Save code and add</Button>
      </>}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-base">{code}</span>
          {code ? <Badge variant="outline">{FORMAT_LABELS[barcodeFormat(code)]}</Badge> : null}
        </div>
        {label ? <p className="text-sm text-fg-secondary">Scale label: item code <span className="font-mono">{label.itemCode}</span>, {label.kind === "weight" ? `${label.weightKg} kg` : formatMoney(label.priceMinor, currency)}. The item code is saved, so every label for it works.</p> : null}
        {!online ? <p className="text-sm text-warning-ink">Offline: the code can be saved once the till is back online. Add once still works.</p> : null}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" autoFocus aria-label="Search products" />
        <div className="max-h-64 space-y-1 overflow-y-auto" role="listbox" aria-label="Products">
          {products.length ? products.map((p) => (
            <button key={p.id} type="button" role="option" aria-selected={p.id === productId} onClick={() => { setProductId(p.id); setVariantId(""); setError(null); }}
              className={cn("flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-3 text-left text-sm", p.id === productId ? "border-primary bg-primary-soft" : "hover:bg-fg/8")}>
              <span className="font-medium">{p.name}{p.variants?.length ? <span className="ml-2 text-xs text-fg-muted">{p.variants.length} sizes</span> : null}</span>
              <span className="tabular text-fg-secondary">{formatMoney(p.base_price_minor, currency)}</span>
            </button>
          )) : <p className="py-6 text-center text-sm text-fg-muted">No products match.</p>}
        </div>
        {product ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {product.variants?.length ? (
              <Field label="Size">
                <Select value={variantId} onChange={(e) => setVariantId(e.target.value)} aria-label="Size">
                  <option value="">Any size (ask each time)</option>
                  {product.variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </Select>
              </Field>
            ) : null}
            {label ? null : <Field label="Pack quantity" hint="How many one scan adds, e.g. 6 for a carton of six"><Input type="number" inputMode="decimal" min={0} step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="tabular" aria-label="Pack quantity" /></Field>}
          </div>
        ) : null}
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      </div>
      {dialog}
    </Dialog>
  );
}
