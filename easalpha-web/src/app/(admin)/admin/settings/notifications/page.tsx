"use client";
import { Bell } from "lucide-react";
import { PageHeader } from "@/components/admin/page";
import { SettingsScreenCard, SettingsVersion, useSettings } from "@/components/admin/settings-screen";
import { PushCard } from "@/components/admin/push-enable";
import { Card, CardBody, CardHeader, CardTitle, Loading } from "@/components/ui";

// SPEC Notifications: six owner alerts (low stock, cash short, big void, daily summary, new online order, pending
// customers), each a boolean settings key on the store group rendered by the settings registry card. Above them, the
// browser push card: whether this device receives those alerts, and every device that does.

export default function NotificationsSettingsPage() {
  const settings = useSettings();
  const keys = settings.data?.groups.store?.screens["Notifications"] ?? [];
  return (
    <>
      <PageHeader icon={Bell} title="Notifications" description="Which events alert the owner and the POS. Each switch is a settings key, so tills pick up changes on their next sync." />
      <SettingsVersion version={settings.data?.version} />
      {settings.isLoading ? <Loading /> : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="grid gap-4 lg:col-span-2">
            <PushCard />
            <SettingsScreenCard screen="Notifications" keys={keys} />
          </div>
          <Card>
            <CardHeader><CardTitle>What each one does</CardTitle></CardHeader>
            <CardBody>
              <ul className="space-y-2 text-sm text-fg-secondary">
                <li><span className="font-medium text-fg">Low stock</span>: an item falls below its minimum in Stock Alerts.</li>
                <li><span className="font-medium text-fg">Cash short</span>: a shift closes with less cash than expected.</li>
                <li><span className="font-medium text-fg">Big void</span>: a void above the usual size needs the owner to look.</li>
                <li><span className="font-medium text-fg">Daily summary</span>: the figures for the day at close.</li>
                <li><span className="font-medium text-fg">New online order</span>: the POS is alerted when a website or app order arrives.</li>
                <li><span className="font-medium text-fg">Pending customers</span>: a badge for online sign-ups waiting for approval.</li>
              </ul>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
