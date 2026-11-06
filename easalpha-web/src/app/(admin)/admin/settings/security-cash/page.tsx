"use client";
import { useState } from "react";
import Link from "next/link";
import { Lock, MonitorSmartphone } from "lucide-react";
import { api } from "@/lib/api";
import { useAction } from "@/components/admin/crud";
import { SettingsGroupPage } from "@/components/admin/settings-screen";
import { Button, Card, CardBody, CardHeader, CardTitle, Field, Input } from "@/components/ui";

// SPEC Settings > Security & Cash: Change Password, Signed-In Devices, Expense & Report PIN, Cashier PIN, Cashier Drawer.
// The three PIN/drawer screens come from the settings registry; the first two are this page's own cards.

function ChangePasswordCard() {
  const [f, setF] = useState({ current_password: "", password: "", confirm: "" });
  const change = useAction<{ current_password: string; password: string }>(["me"], (body) => api("/me", { method: "PATCH", body }), "Password change submitted");
  const mismatch = f.confirm !== "" && f.confirm !== f.password;
  const tooShort = f.password !== "" && f.password.length < 8;
  const ready = f.current_password !== "" && f.password.length >= 8 && f.confirm === f.password;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
        <Button size="sm" disabled={!ready} loading={change.isPending}
          onClick={() => change.mutate({ current_password: f.current_password, password: f.password }, { onSuccess: () => setF({ current_password: "", password: "", confirm: "" }) })}>
          Save
        </Button>
      </CardHeader>
      <CardBody className="grid gap-3 sm:grid-cols-2">
        <Field label="Current password" className="sm:col-span-2"><Input type="password" autoComplete="current-password" value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} /></Field>
        <Field label="New password" error={tooShort ? "At least 8 characters" : undefined}><Input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <Field label="Confirm new password" error={mismatch ? "Does not match" : undefined}><Input type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
        <p className="text-xs text-fg-muted sm:col-span-2">Changes the password for your own login only. If the current password is wrong the change is ignored and the old password stays.</p>
      </CardBody>
    </Card>
  );
}

function DevicesCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Signed-In Devices</CardTitle>
        <Link href="/admin/settings/devices"><Button size="sm" variant="secondary"><MonitorSmartphone className="h-4 w-4" /> Open devices</Button></Link>
      </CardHeader>
      <CardBody className="text-sm text-fg-secondary">
        Every till, order-taker tablet, kitchen display and token screen paired to a branch, with its last sync. Revoke a device there to sign it out at once.
      </CardBody>
    </Card>
  );
}

export default function SecurityCashSettingsPage() {
  return (
    <SettingsGroupPage group="security_cash" title="Security & Cash" icon={Lock}
      description="Where the money controls live: your password, the paired devices, separate PINs for expenses, reports and cashier actions, and whether payments land in each cashier's own till."
      before={<><ChangePasswordCard /><DevicesCard /></>} />
  );
}
