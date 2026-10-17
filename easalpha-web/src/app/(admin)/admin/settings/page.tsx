"use client";
import Link from "next/link";
import { ChevronRight, Settings } from "lucide-react";
import { PageHeader } from "@/components/admin/page";
import { SETTINGS_SECTIONS } from "@/components/admin/nav";
import { useVisibleNav } from "@/components/admin/sidebar";
import { Card, CardBody } from "@/components/ui";

// Review 4.10: the settings screens in six areas, as cards in the Modules page pattern (icon, title, one line, then
// the screens). Built from the sidebar data, so a screen this user cannot open is not listed here either.
export default function SettingsOverviewPage() {
  const group = useVisibleNav().find((g) => g.label === "Settings");
  const items = group?.items ?? [];
  const sections = SETTINGS_SECTIONS.map((s) => ({ ...s, items: items.filter((it) => it.section === s.key) })).filter((s) => s.items.length);
  return (
    <>
      <PageHeader icon={Settings} title="Settings" description="Everything the till, the website and the reports follow, in six areas. Changes reach the tills on their next sync." />
      <div className="grid max-w-6xl gap-4 lg:grid-cols-2">
        {sections.map((s) => {
          const Icon = s.items[0].icon;
          return (
            <Card key={s.key}>
              <CardBody className="flex flex-col gap-3">
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary"><Icon className="h-6 w-6" /></span>
                  <div className="min-w-0">
                    <h2 className="text-lg font-medium">{s.key}</h2>
                    <p className="mt-1 text-sm text-fg-secondary">{s.summary}</p>
                  </div>
                </div>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {s.items.map((it) => (
                    <li key={it.href}>
                      <Link href={it.href} className="flex min-h-10 items-center gap-2 rounded-md px-2 text-sm font-medium text-primary hover:bg-primary-soft">
                        <it.icon className="h-4 w-4 shrink-0" /><span className="flex-1">{it.label}</span><ChevronRight className="h-4 w-4 text-fg-muted" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
