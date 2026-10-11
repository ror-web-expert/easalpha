import type { Metadata } from "next";
import Link from "next/link";
import { LayoutDashboard, Monitor, ChefHat, Megaphone } from "lucide-react";

export const metadata: Metadata = { title: "Open an app screen", description: "Pick the Servio screen for this device: admin panel, till, kitchen display or token screen." };

const links = [
  { href: "/admin", title: "Admin panel", text: "Owners and managers: menu, money, people, reports.", icon: LayoutDashboard },
  { href: "/pos", title: "Till (POS)", text: "Pair a till, log in with a PIN and sell.", icon: Monitor },
  { href: "/kitchen", title: "Kitchen display", text: "Tickets per station with timers and bump.", icon: ChefHat },
  { href: "/token", title: "Token screen", text: "Shows which orders are ready for pickup.", icon: Megaphone },
];

export default function AppsPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-4 py-12">
      <div>
        <div className="flex items-center gap-2 text-primary">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-fg font-bold">S</span>
          <span className="text-xl font-semibold text-fg">Servio</span>
        </div>
        <p className="mt-2 text-fg-secondary">Restaurant POS for Pakistan. Pick the screen for this device.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-lg border bg-card p-5 shadow-[var(--shadow-card)] transition hover:border-primary">
            <l.icon className="h-6 w-6 text-primary" />
            <div className="mt-3 text-base font-semibold">{l.title}</div>
            <div className="mt-1 text-sm text-fg-secondary">{l.text}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
