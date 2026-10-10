"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { api } from "@/lib/api";
import type { WhatsappUsage } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { SettingsScreenCard, SettingsVersion, useSettings } from "@/components/admin/settings-screen";
import { BulkSendTab, ManualSendTab, SendLogsTab, TemplatesTab } from "@/components/admin/marketing-whatsapp";
import { Loading, SummaryCard, Tabs } from "@/components/ui";

// SPEC "Account notifications over WhatsApp": a master toggle that disables every send button everywhere, auto-send on
// account payment, optional receipt image, optional store logo on images, plus Templates, Manual Send, Bulk Send and
// Send Logs. The four toggles are settings keys (group store, screen WhatsApp) rendered by the settings registry card.

type Tab = "templates" | "manual" | "bulk" | "logs";

export default function WhatsappSettingsPage() {
  const settings = useSettings();
  const keys = settings.data?.groups.store?.screens["WhatsApp"] ?? [];
  const master = keys.find((k) => k.key === "whatsapp.account.master_enabled")?.value === true;
  const usage = useQuery({ queryKey: ["whatsapp_usage"], queryFn: () => api<WhatsappUsage>("/whatsapp/usage") });
  const [tab, setTab] = useState<Tab>("templates");
  return (
    <>
      <PageHeader icon={MessageCircle} title="WhatsApp" description="Statements and receipts sent from the cashier desktop app. The master toggle switches off every send button everywhere." />
      <SettingsVersion version={settings.data?.version} />
      {settings.isLoading ? <Loading /> : (
        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <SettingsScreenCard screen="WhatsApp" keys={keys} className="lg:col-span-2" />
          <div className="grid gap-4">
            <SummaryCard label="Messages this month" value={usage.data?.used ?? 0} sub={usage.data?.limit != null ? `of ${usage.data.limit} on the plan` : "No plan limit"} tone={usage.data?.limit != null && usage.data.used >= usage.data.limit ? "danger" : "info"} />
            <SummaryCard label="Sending" value={master ? "On" : "Off"} sub={master ? "Send buttons are live" : "Every send button is disabled"} tone={master ? "success" : "warning"} />
          </div>
        </div>
      )}
      {!master && !settings.isLoading ? <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-ink">Sending is switched off. Templates can still be edited; Manual Send and Bulk Send stay disabled until the master toggle is on.</p> : null}
      <Tabs value={tab} onChange={setTab} className="mb-4" items={[{ value: "templates", label: "Templates" }, { value: "manual", label: "Manual Send" }, { value: "bulk", label: "Bulk Send" }, { value: "logs", label: "Send Logs" }]} />
      {tab === "templates" ? <TemplatesTab /> : tab === "manual" ? <ManualSendTab disabled={!master} /> : tab === "bulk" ? <BulkSendTab disabled={!master} /> : <SendLogsTab />}
    </>
  );
}
