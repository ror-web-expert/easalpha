"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { QrCode, Printer, Save, RefreshCw, ExternalLink } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Branch, DiningTable, QrSettings, TableQrCard } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { useList, useSave } from "@/components/admin/crud";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Loading, Select, Switch, Textarea } from "@/components/ui";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";

const DEFAULTS: QrSettings = { enabled: false, cashier_accept: true, call_waiter: true, ask_bill: true, running_bill: true, guest_name: true, welcome: null };

function QrImage({ text, size = 160, className }: { text: string; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) QRCode.toCanvas(ref.current, text, { width: size, margin: 1, errorCorrectionLevel: "M" }).catch(() => {}); }, [text, size]);
  return <canvas ref={ref} width={size} height={size} className={className} aria-label={`QR code for ${text}`} role="img" />;
}

export default function QrSettingsPage() {
  const sessionBranch = useAuthStore((s) => s.branchId);
  const branches = useList<Branch>("branches", "/branches");
  const [branchId, setBranchId] = useState("");
  useEffect(() => { if (!branchId && branches.data?.length) setBranchId(branches.data.find((b) => b.id === sessionBranch)?.id ?? branches.data[0].id); }, [branches.data, branchId, sessionBranch]);
  const branch = branches.data?.find((b) => b.id === branchId);
  const [s, setS] = useState<QrSettings>(DEFAULTS);
  useEffect(() => { if (branch) setS({ ...DEFAULTS, ...(branch.qr_settings ?? {}) }); }, [branch]);
  const save = useSave<Record<string, unknown>, Branch>(["branches"], () => `/branches/${branchId}`, { success: "QR settings saved" });
  const tables = useQuery({ queryKey: ["tables"], queryFn: () => api<{ data: DiningTable[] }>("/tables"), select: (r) => r.data });
  const cards = useQueries({ queries: (tables.data ?? []).map((t) => ({ queryKey: ["table_qr", t.id], queryFn: () => api<TableQrCard>(`/tables/${t.id}/qr`) })) });
  const cardByTable = useMemo(() => Object.fromEntries(cards.map((c, i) => [tables.data?.[i]?.id ?? "", c.data])), [cards, tables.data]);
  const [regen, setRegen] = useState<string | null>(null);
  const business = useAuthStore((st) => st.session?.business.name);
  const regenerate = async (t: DiningTable) => {
    if (!confirm(`Regenerate the code for ${t.code}? The old printed card stops working.`)) return;
    setRegen(t.id);
    try { await api(`/tables/${t.id}/regenerate_qr`, { method: "POST" }); toast.success(`New code for ${t.code}`); tables.refetch(); cards.forEach((c) => c.refetch()); }
    catch (e) { toast.error("Could not regenerate", errorMessage(e)); }
    finally { setRegen(null); }
  };
  const set = <K extends keyof QrSettings>(k: K, v: QrSettings[K]) => setS({ ...s, [k]: v });
  const printable = (tables.data ?? []).filter((t) => cardByTable[t.id]);
  return (
    <>
      <style>{`@media print { @page { size: A4; margin: 10mm; } body * { visibility: hidden; } .qr-print-area, .qr-print-area * { visibility: visible; } .qr-print-area { position: absolute; left: 0; top: 0; width: 100%; display: grid !important; grid-template-columns: repeat(3, 1fr); gap: 8mm; } .qr-card { break-inside: avoid; border: 1px solid #ccc; } }`}</style>
      <div className="no-print">
        <PageHeader icon={QrCode} title="QR ordering" description="Guests scan a table card, see the live menu and order from their phone. Settings are per branch." actions={<>
          {branches.data && branches.data.length > 1 ? <Select className="w-auto" value={branchId} onChange={(e) => setBranchId(e.target.value)}>{branches.data.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select> : null}
          <Button variant="secondary" onClick={() => window.print()} disabled={!printable.length}><Printer className="h-4 w-4" /> Print all cards</Button>
          <Button onClick={() => save.mutate({ id: branchId, qr_settings: s })} loading={save.isPending} disabled={!branchId}><Save className="h-4 w-4" /> Save</Button>
        </>} />
        {branches.isLoading ? <Loading /> : (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Ordering</CardTitle><Badge variant={s.enabled ? "success" : "neutral"}>{s.enabled ? "On" : "Off"}</Badge></CardHeader>
              <CardBody className="space-y-4">
                <Switch checked={s.enabled} onChange={(v) => set("enabled", v)} label="Enable QR ordering for this branch" />
                <Switch checked={s.cashier_accept} onChange={(v) => set("cashier_accept", v)} label="Cashier accepts each order before it reaches the kitchen" />
                <p className="-mt-2 pl-13 text-xs text-fg-muted">Off: orders go straight to the kitchen. On: they wait on the QR orders screen.</p>
                <Switch checked={s.guest_name} onChange={(v) => set("guest_name", v)} label="Ask the guest for a name" />
                <Switch checked={s.running_bill} onChange={(v) => set("running_bill", v)} label="Show the running bill of the table" />
              </CardBody>
            </Card>
            <Card>
              <CardHeader><CardTitle>Requests and welcome</CardTitle></CardHeader>
              <CardBody className="space-y-4">
                <Switch checked={s.call_waiter} onChange={(v) => set("call_waiter", v)} label="Guests can call a waiter" />
                <Switch checked={s.ask_bill} onChange={(v) => set("ask_bill", v)} label="Guests can ask for the bill" />
                <Field label="Welcome text" hint="Shown at the top of the menu on the guest's phone"><Textarea value={s.welcome ?? ""} onChange={(e) => set("welcome", e.target.value || null)} placeholder={`Welcome to ${business ?? "our restaurant"}! Order from your table and we will bring it over.`} /></Field>
              </CardBody>
            </Card>
          </div>
        )}
        <Card className="mt-4">
          <CardHeader><CardTitle>Table cards</CardTitle><span className="text-xs text-fg-muted">{tables.data?.length ?? 0} tables · each code links to its own table</span></CardHeader>
          <CardBody>
            {tables.isLoading ? <Loading /> : !tables.data?.length ? <p className="text-sm text-fg-muted">No tables yet. Add them under Tables and floors.</p> : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {tables.data.map((t) => {
                  const c = cardByTable[t.id];
                  return (
                    <div key={t.id} className="flex flex-col items-center rounded-lg border p-3 text-center">
                      <div className="text-lg font-bold">{t.code}{t.name ? <span className="ml-1 text-sm font-normal text-fg-secondary">{t.name}</span> : null}</div>
                      {c ? <QrImage text={c.url} size={140} className="my-2 rounded bg-white p-1" /> : <div className="my-2 h-[140px] w-[140px] animate-pulse rounded bg-muted" />}
                      {c ? <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 truncate font-mono text-[11px] text-primary hover:underline">{c.url.replace(/^https?:\/\//, "")} <ExternalLink className="h-3 w-3 shrink-0" /></a> : null}
                      <Button size="sm" variant="ghost" className="mt-2" loading={regen === t.id} onClick={() => regenerate(t)}><RefreshCw className="h-3.5 w-3.5" /> New code</Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
      <div className="qr-print-area hidden">
        {printable.map((t) => {
          const c = cardByTable[t.id]!;
          return (
            <div key={t.id} className="qr-card flex flex-col items-center rounded-lg p-4 text-center text-black">
              <div className="text-sm font-semibold uppercase tracking-wide">{business}</div>
              <div className="my-1 text-3xl font-black">Table {t.code}</div>
              <QrImage text={c.url} size={220} />
              <div className="mt-2 text-sm font-medium">Scan to see the menu and order</div>
              <div className="mt-1 font-mono text-[10px] text-gray-600">{c.url.replace(/^https?:\/\//, "")}</div>
              {s.welcome ? <div className="mt-2 text-xs text-gray-700">{s.welcome}</div> : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
