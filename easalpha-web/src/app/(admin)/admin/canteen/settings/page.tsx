"use client";
// Canteen settings: the registry's "Canteen" screen (manual lookup, token slips, the daily plan copy, the payroll
// deduction), which no admin page showed, so they could be changed through the API only (6 Nov 2026 review, F11 and
// contracts#9). Each switch is a settings key; kiosks pick a change up on their next sync.
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/admin/page";
import { SettingsScreenCard, SettingsVersion, useSettings } from "@/components/admin/settings-screen";
import { RequirePermission } from "@/components/admin/no-access";
import { CANTEEN_SETTINGS_PERMS } from "@/components/canteen/helpers";
import { Card, CardBody, CardHeader, CardTitle, Loading } from "@/components/ui";
import { useCan } from "@/store/auth";

export default function CanteenSettingsPage() {
  return <RequirePermission perms={CANTEEN_SETTINGS_PERMS}><CanteenSettings /></RequirePermission>;
}

function CanteenSettings() {
  const settings = useSettings();
  const can = useCan();
  const keys = settings.data?.groups.store?.screens["Canteen"] ?? [];
  return (
    <>
      <PageHeader icon={SlidersHorizontal} title="Canteen settings" description="How the kiosk finds a worker, whether it prints a token, whether each day's menu is published for you, and whether meals come off the payroll." />
      <SettingsVersion version={settings.data?.version} />
      {settings.isLoading ? <Loading /> : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {keys.length ? <SettingsScreenCard screen="Canteen" keys={keys} /> : <Card><CardBody className="text-sm text-fg-muted">No canteen settings to show.</CardBody></Card>}
            {can("settings.manage") ? null : <p className="mt-2 px-1 text-xs text-fg-secondary">Changing these switches needs the Settings permission.</p>}
          </div>
          <Card>
            <CardHeader><CardTitle>What each one does</CardTitle></CardHeader>
            <CardBody>
              <ul className="space-y-2 text-sm text-fg-secondary">
                <li><span className="font-medium text-fg">Manual lookup</span>: when the reader fails, the kiosk finds a worker by name, phone or CNIC. Off, it serves by fingerprint only; it still holds every worker&apos;s name, so it names a finger with no connection.</li>
                <li><span className="font-medium text-fg">Token slip</span>: prints a slip for every meal. The screen shows the token either way.</li>
                <li><span className="font-medium text-fg">Daily menu</span>: soon after each branch&apos;s business day begins, a session with no plan that day gets its latest published plan of the past week, published. A plan someone started is left alone, and one deleted after that stays deleted.</li>
                <li><span className="font-medium text-fg">Payroll deduction</span>: the month&apos;s meals come off the payroll run as a &quot;Canteen meals&quot; line, and paying the run settles the worker&apos;s account.</li>
              </ul>
              <p className="mt-3 text-sm text-fg-secondary">A worker takes one meal per session; for a second meal in a shift, add a session under <Link className="text-primary" href="/admin/canteen/sessions">Meal Sessions</Link>.</p>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
