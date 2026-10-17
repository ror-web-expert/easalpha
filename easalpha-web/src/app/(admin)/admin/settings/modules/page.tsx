"use client";
import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, ToggleRight, Wallet2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { BusinessModule, BusinessModules } from "@/lib/types";
import { MODULE_INFO, MODULE_KEYS, useApplyModules, useModules } from "@/lib/modules";
import { PageHeader } from "@/components/admin/page";
import { Card, CardBody, Loading, Switch } from "@/components/ui";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";

// Modules the owner switches on. Customer accounts (khata) and payroll start off for a new business so the menu stays
// short; turning one on brings its screens into the sidebar, its controls onto the POS and its WhatsApp messages.
const ORDER: BusinessModule[] = ["customer_accounts", "payroll"];
const ICONS = { customer_accounts: BookOpen, payroll: Wallet2 };
const FIRST_STEP: Record<BusinessModule, { href: string; label: string }> = {
  customer_accounts: { href: "/admin/customers/ledger", label: "Open Customer Ledger" },
  payroll: { href: "/admin/payroll/employees", label: "Add employees" },
};

export default function ModulesPage() {
  const modules = useModules();
  const isOwner = useAuthStore((s) => s.session?.membership.role.system_key === "owner");
  const apply = useApplyModules();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<BusinessModule | null>(null);

  const toggle = async (name: BusinessModule, on: boolean) => {
    setBusy(name);
    try {
      const r = await api<{ modules: BusinessModules }>("/settings", { method: "PATCH", body: { values: { [MODULE_KEYS[name]]: on } } });
      apply(r.modules);
      void qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success(`${MODULE_INFO[name].title} ${on ? "switched on" : "switched off"}`, on ? "Its screens are now in the sidebar. Tills pick it up on their next sync." : "Its screens left the sidebar. Nothing was deleted; switch it on again to see everything as it was.");
    } catch (e) {
      toast.error("Could not change the module", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader icon={ToggleRight} title="Modules" description="Switch on the parts of EasAlpha this business uses. Switching off hides the screens; no records are deleted." />
      {!isOwner ? <p className="mb-4 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">Only the owner can switch modules on or off. Ask the owner if you need one.</p> : null}
      {!modules.loaded ? <Loading /> : (
        // Review 4.10: the switch already says On or Off, so the badge beside the title went; the grid keeps a
        // readable width instead of stretching two cards across a wide screen.
        <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
          {ORDER.map((name) => {
            const info = MODULE_INFO[name];
            const Icon = ICONS[name];
            const on = modules[name];
            return (
              <Card key={name} data-module={name}>
                <CardBody className="flex flex-col gap-4">
                  <div className="flex items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary"><Icon className="h-6 w-6" /></span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-medium">{info.title}</h2>
                      <p className="mt-1 text-sm text-fg-secondary">{info.summary}</p>
                    </div>
                    <Switch checked={on} disabled={!isOwner || busy === name} onChange={(v) => void toggle(name, v)} label={on ? "On" : "Off"} />
                  </div>
                  <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
                    {info.screens.map((s) => <li key={s} className="flex items-center gap-2 text-fg-secondary"><CheckCircle2 className={on ? "h-4 w-4 shrink-0 text-success" : "h-4 w-4 shrink-0 text-fg-muted"} />{s}</li>)}
                  </ul>
                  {on ? <Link href={FIRST_STEP[name].href} className="text-sm font-medium text-primary hover:underline">{FIRST_STEP[name].label}</Link> : null}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
