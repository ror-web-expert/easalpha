"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, QrCode, Smartphone } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { SettingKey, WhatsappConnection, WhatsappProvider, WhatsappUsage } from "@/lib/types";
import { formatDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/admin/page";
import { useAction } from "@/components/admin/crud";
import { SettingsScreenCard, SettingsVersion, useSettings } from "@/components/admin/settings-screen";
import { BulkSendTab, ManualSendTab, SendLogsTab, TemplatesTab } from "@/components/admin/marketing-whatsapp";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Loading, SummaryCard, Tabs } from "@/components/ui";

// SPEC "Account notifications over WhatsApp": a master toggle that disables every send button everywhere, auto-send on
// account payment, optional receipt image, optional store logo on images, plus Templates, Manual Send, Bulk Send and
// Send Logs. The four toggles are settings keys (group store, screen WhatsApp) rendered by the settings registry card.
// Above them, "Connect a phone": messages go out either through the Meta Cloud API (credentials in the card below) or
// through a phone linked by QR, the way WhatsApp Web links a browser.

type Tab = "templates" | "manual" | "bulk" | "logs";
const PROVIDER_KEY = "whatsapp.provider";
const PAIRING = new Set<WhatsappConnection["status"]>(["qr", "connecting"]);

const STATUS: Record<WhatsappConnection["status"], { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  disconnected: { label: "Not connected", tone: "neutral" },
  qr: { label: "Waiting for scan", tone: "info" },
  connecting: { label: "Connecting", tone: "info" },
  connected: { label: "Connected", tone: "success" },
  unavailable: { label: "Unavailable", tone: "danger" },
};

export default function WhatsappSettingsPage() {
  const settings = useSettings();
  const allKeys = settings.data?.groups.store?.screens["WhatsApp"] ?? [];
  const providerKey = allKeys.find((k) => k.key === PROVIDER_KEY);
  const keys = allKeys.filter((k) => k.key !== PROVIDER_KEY);
  const master = keys.find((k) => k.key === "whatsapp.account.master_enabled")?.value === true;
  const usage = useQuery({ queryKey: ["whatsapp_usage"], queryFn: () => api<WhatsappUsage>("/whatsapp/usage") });
  const [tab, setTab] = useState<Tab>("templates");
  return (
    <>
      <PageHeader icon={MessageCircle} title="WhatsApp" description="Statements and receipts sent from the cashier desktop app. The master toggle switches off every send button everywhere." />
      <SettingsVersion version={settings.data?.version} />
      {settings.isLoading ? <Loading /> : (
        <>
          <ConnectPhoneCard providerKey={providerKey} className="mb-4" />
          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <SettingsScreenCard screen="WhatsApp" keys={keys} className="lg:col-span-2" />
            <div className="grid gap-4">
              <SummaryCard label="Messages this month" value={usage.data?.used ?? 0} sub={usage.data?.limit != null ? `of ${usage.data.limit} on the plan` : "No plan limit"} tone={usage.data?.limit != null && usage.data.used >= usage.data.limit ? "danger" : "info"} />
              <SummaryCard label="Sending" value={master ? "On" : "Off"} sub={master ? "Send buttons are live" : "Every send button is disabled"} tone={master ? "success" : "warning"} />
            </div>
          </div>
        </>
      )}
      {!master && !settings.isLoading ? <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-ink">Sending is switched off. Templates can still be edited; Manual Send and Bulk Send stay disabled until the master toggle is on.</p> : null}
      <Tabs value={tab} onChange={setTab} className="mb-4" items={[{ value: "templates", label: "Templates" }, { value: "manual", label: "Manual Send" }, { value: "bulk", label: "Bulk Send" }, { value: "logs", label: "Send Logs" }]} />
      {tab === "templates" ? <TemplatesTab /> : tab === "manual" ? <ManualSendTab disabled={!master} /> : tab === "bulk" ? <BulkSendTab disabled={!master} /> : <SendLogsTab />}
    </>
  );
}

/** Provider choice plus the QR pairing flow. Polls GET /whatsapp/connection every 3 seconds while a code is showing. */
function ConnectPhoneCard({ providerKey, className }: { providerKey?: SettingKey; className?: string }) {
  const connection = useQuery({
    queryKey: ["whatsapp_connection"],
    queryFn: () => api<WhatsappConnection>("/whatsapp/connection"),
    refetchInterval: (q) => (q.state.data && PAIRING.has(q.state.data.status) ? 3000 : false),
  });
  const saved = (providerKey?.value as WhatsappProvider | null | undefined) ?? connection.data?.provider ?? "cloud";
  const setProvider = useAction<WhatsappProvider>(["settings", "whatsapp_connection"], (p) => api("/settings", { method: "PATCH", body: { values: { [PROVIDER_KEY]: p } } }), "Provider saved");
  const start = useAction<void, WhatsappConnection>(["whatsapp_connection"], () => api("/whatsapp/connection/start", { method: "POST", body: {} }));
  const logout = useAction<void, WhatsappConnection>(["whatsapp_connection"], () => api("/whatsapp/connection/logout", { method: "POST", body: {} }), "Phone disconnected");
  const c = connection.data;
  const pairing = !!c && PAIRING.has(c.status);
  const status = c ? STATUS[c.status] ?? { label: c.status, tone: "neutral" as const } : null;
  const Option = ({ value, icon: Icon, title, text }: { value: WhatsappProvider; icon: typeof Smartphone; title: string; text: string }) => (
    <button type="button" aria-pressed={saved === value} disabled={setProvider.isPending} onClick={() => saved !== value && setProvider.mutate(value)}
      className={`flex flex-1 items-start gap-3 rounded-lg border p-3 text-left transition-colors ${saved === value ? "border-primary bg-primary-soft" : "hover:bg-fg/4"}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${saved === value ? "text-primary-ink" : "text-fg-muted"}`} />
      <span><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-fg-secondary">{text}</span></span>
    </button>
  );
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-primary" /> Connect a phone</CardTitle>
        {status ? <Badge variant={status.tone}>{status.label}</Badge> : null}
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Option value="cloud" icon={MessageCircle} title="Meta Cloud API" text="Official WhatsApp Business API. Enter the phone number id and access token in the WhatsApp card below." />
          <Option value="web" icon={QrCode} title="Link a phone by QR" text="Scan a code with the shop's WhatsApp, like WhatsApp Web. Messages go out from that number." />
        </div>
        {saved === "web" ? (
          connection.isLoading ? <p className="text-sm text-fg-muted">Checking the connection...</p>
          : connection.isError ? <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">Could not read the connection: {errorMessage(connection.error)}</p>
          : c ? (
            <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-start">
              {c.status === "qr" && c.qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.qr} alt="WhatsApp pairing code" width={240} height={240} className="h-60 w-60 rounded-lg border bg-white p-2" />
              ) : (
                <div className="grid h-60 w-60 place-items-center rounded-lg border bg-muted text-center text-sm text-fg-muted">
                  {c.status === "connected" ? <Smartphone className="h-10 w-10 text-success" /> : c.status === "connecting" ? "Linking the phone..." : c.status === "qr" ? "Preparing the code..." : <QrCode className="h-10 w-10" />}
                </div>
              )}
              <div className="space-y-3 text-sm">
                {!c.gateway_configured ? (
                  <p className="rounded-md bg-warning-soft px-3 py-2 text-warning-ink">The phone gateway is not configured on the server, so a phone cannot be linked yet. Set the gateway address in the server environment, or use the Meta Cloud API.</p>
                ) : null}
                {c.status === "connected" ? (
                  <>
                    <p>Connected as <span className="font-medium tabular">{c.phone ?? "unknown number"}</span>{c.connected_at ? <span className="text-fg-secondary"> since {formatDateTime(c.connected_at)}</span> : null}.</p>
                    <p className="text-fg-secondary">Keep that phone on and online. If WhatsApp on the phone signs this device out, come back here and link again.</p>
                  </>
                ) : c.status === "qr" ? (
                  <>
                    <p className="font-medium">Scan with WhatsApp: Settings, Linked devices, Link a device.</p>
                    <p className="text-fg-secondary">Point the phone&apos;s camera at the code. It refreshes on its own while this page is open.</p>
                  </>
                ) : c.status === "connecting" ? (
                  <p className="text-fg-secondary">The phone was scanned and is finishing the link. This takes a few seconds.</p>
                ) : c.status === "unavailable" ? (
                  <p className="text-fg-secondary">The gateway cannot be reached right now. Try again in a moment.</p>
                ) : (
                  <p className="text-fg-secondary">No phone is linked. Start pairing, then scan the code with the shop&apos;s WhatsApp.</p>
                )}
                {c.last_error ? <p className="rounded-md bg-danger-soft px-3 py-2 text-danger-ink">Last error: {c.last_error}</p> : null}
                <div className="flex flex-wrap gap-2">
                  {c.status === "connected"
                    ? <Button variant="destructive" size="sm" loading={logout.isPending} onClick={() => logout.mutate()}>Disconnect</Button>
                    : <Button size="sm" loading={start.isPending || pairing} disabled={!c.gateway_configured} onClick={() => start.mutate()}>{pairing ? "Waiting for the phone" : c.status === "unavailable" ? "Try again" : "Start pairing"}</Button>}
                  {pairing ? <Button variant="ghost" size="sm" loading={logout.isPending} onClick={() => logout.mutate()}>Cancel</Button> : null}
                </div>
              </div>
            </div>
          ) : null
        ) : (
          <p className="text-sm text-fg-secondary">Messages are sent through the Meta Cloud API with the credentials saved below. Switch to &quot;Link a phone by QR&quot; to send from an ordinary WhatsApp number instead.</p>
        )}
      </CardBody>
    </Card>
  );
}
