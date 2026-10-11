"use client";
import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Smartphone } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { formatAgo } from "@/lib/dates";
import { browserLabel, disablePush, enablePush, getPushState, listPushDevices, sendTestPush, type PushRequest, type PushState } from "@/lib/push";
import type { PushApp } from "@/lib/types";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Switch } from "@/components/ui";
import { toast } from "@/store/toast";

// Browser push for every app. The admin card (settings, Notifications) shows the state of this device, lets the owner
// enable, disable and test it, and lists every device that will get alerts. PushToggle is the one-line switch the
// POS, kitchen and rider pages use for "Push alerts on this device".

const STATE_TEXT: Record<PushState, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info"; hint: string }> = {
  unsupported: { label: "Not supported", tone: "neutral", hint: "This browser cannot show push notifications. On iPhone, add the app to the home screen first; on desktop use Chrome, Edge or Firefox." },
  denied: { label: "Blocked", tone: "danger", hint: "Notifications are blocked for this site. Allow them in the browser's site settings (the lock icon next to the address) and try again." },
  prompt: { label: "Not enabled", tone: "warning", hint: "Alerts are off on this device. Enabling asks the browser for permission once." },
  unsubscribed: { label: "Not enabled", tone: "warning", hint: "Permission is granted but this device is not registered for alerts." },
  subscribed: { label: "On", tone: "success", hint: "Alerts arrive on this device even when the tab is closed, as long as the browser is running." },
};

/** Current state plus enable/disable actions, shared by the card and the toggle. */
export function usePush(app: PushApp, request?: PushRequest) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const refresh = useCallback(() => { getPushState().then(setState).catch(() => setState("unsupported")); }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const enable = async () => {
    setBusy(true);
    try {
      const next = await enablePush(app, request);
      setState(next);
      if (next === "subscribed") toast.success("Push alerts are on for this device");
      else if (next === "denied") toast.error("Notifications are blocked", "Allow them in the browser's site settings and try again.");
      else toast.info("Permission was not granted");
      qc.invalidateQueries({ queryKey: ["push_devices"] });
    } catch (e) { toast.error("Could not enable alerts", errorMessage(e)); refresh(); }
    finally { setBusy(false); }
  };
  const disable = async () => {
    setBusy(true);
    try { setState(await disablePush(app, request)); toast.success("Push alerts are off for this device"); qc.invalidateQueries({ queryKey: ["push_devices"] }); }
    catch (e) { toast.error("Could not disable alerts", errorMessage(e)); refresh(); }
    finally { setBusy(false); }
  };
  return { state, busy, enable, disable, refresh };
}

/** Compact "Push alerts on this device" switch for the POS, kitchen and rider pages. */
export function PushToggle({ app, request, label = "Push alerts on this device", className }: { app: PushApp; request?: PushRequest; label?: string; className?: string }) {
  const { state, busy, enable, disable } = usePush(app, request);
  if (state === null) return null;
  if (state === "unsupported" || state === "denied") {
    return <span className={className} title={STATE_TEXT[state].hint}><Switch checked={false} onChange={() => {}} disabled label={`${label}: ${STATE_TEXT[state].label.toLowerCase()}`} /></span>;
  }
  return (
    <span className={className} title={STATE_TEXT[state].hint}>
      <Switch checked={state === "subscribed"} disabled={busy} onChange={(v) => (v ? enable() : disable())} label={label} />
    </span>
  );
}

/** Full card for the admin Notifications screen. */
export function PushCard({ app = "admin", className }: { app?: PushApp; className?: string }) {
  const { state, busy, enable, disable } = usePush(app);
  const [testing, setTesting] = useState(false);
  const devices = useQuery({ queryKey: ["push_devices"], queryFn: () => listPushDevices(app) });
  const info = state ? STATE_TEXT[state] : null;
  const test = async () => {
    setTesting(true);
    try { const r = await sendTestPush(app); toast.success(r.sent ? `Test sent to ${r.sent} ${r.sent === 1 ? "device" : "devices"}` : "No devices to send to", r.sent ? "It can take a few seconds to arrive." : "Enable alerts on a device first."); }
    catch (e) { toast.error("Could not send the test", errorMessage(e)); }
    finally { setTesting(false); }
  };
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BellRing className="h-4 w-4 text-primary" /> Alerts on this device</CardTitle>
        {info ? <Badge variant={info.tone}>{info.label}</Badge> : null}
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-fg-secondary">{info?.hint ?? "Checking this browser..."} The switches below choose which events send an alert; this card decides whether this browser receives them.</p>
        <div className="flex flex-wrap gap-2">
          {state === "subscribed"
            ? <Button variant="secondary" size="sm" loading={busy} onClick={disable}>Disable on this device</Button>
            : <Button size="sm" loading={busy} disabled={!state || state === "unsupported" || state === "denied"} onClick={enable}>Enable on this device</Button>}
          <Button variant="ghost" size="sm" loading={testing} onClick={test} disabled={!devices.data?.length}>Send test</Button>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-sm font-medium"><span>Devices receiving your alerts</span><span className="text-fg-muted">{devices.data?.length ?? 0}</span></div>
          {devices.isLoading ? <p className="text-sm text-fg-muted">Loading devices...</p>
            : devices.isError ? <p className="text-sm text-danger">{errorMessage(devices.error)}</p>
            : !devices.data?.length ? <p className="text-sm text-fg-muted">No device is registered yet. Enable alerts here, on the till, the kitchen screen or the rider phone.</p>
            : (
              <ul className="divide-y rounded-lg border">
                {devices.data.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <Smartphone className="h-4 w-4 shrink-0 text-fg-muted" />
                    <span className="min-w-0 flex-1 truncate">{browserLabel(d.user_agent)}</span>
                    <Badge variant="outline">{String(d.app)}</Badge>
                    <span className="hidden text-xs text-fg-muted sm:inline">{d.last_used_at ? `last alert ${formatAgo(d.last_used_at)}` : `added ${formatAgo(d.created_at)}`}</span>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </CardBody>
    </Card>
  );
}
