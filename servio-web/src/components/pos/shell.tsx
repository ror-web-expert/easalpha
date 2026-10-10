"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Lock, ShoppingCart, ListOrdered, Wallet, AlertTriangle, LayoutDashboard, QrCode, Bike } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { useCatalogStore } from "@/store/catalog";
import { SyncBadge } from "./sync-badge";
import { useTillLive } from "./live";
import { ThemeToggle } from "@/components/ui";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/pos", label: "Sell", icon: ShoppingCart },
  { href: "/pos/orders", label: "Orders", icon: ListOrdered },
  { href: "/pos/qr", label: "QR orders", icon: QrCode },
  { href: "/pos/delivery", label: "Delivery", icon: Bike },
  { href: "/pos/shift", label: "Shift", icon: Wallet },
  { href: "/pos/attention", label: "Attention", icon: AlertTriangle },
];

export function PosShell({ children, title }: { children: React.ReactNode; title?: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useDeviceStore((s) => s.session);
  const branch = useDeviceStore((s) => s.branch);
  const lock = useDeviceStore((s) => s.lock);
  const shift = useCatalogStore((s) => s.shift);
  const live = useTillLive();
  const qrCount = live.available ? live.pending.length + live.requests.length : 0;
  return (
    <div className="flex h-screen flex-col">
      <header className="no-print flex h-16 shrink-0 items-center gap-2 border-b bg-page px-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-lg font-medium text-primary-fg">S</span>
        <div className="hidden min-w-0 md:block">
          <div className="truncate text-base font-medium leading-tight">{branch?.name}</div>
          <div className="truncate text-xs tracking-[0.4px] text-fg-secondary">{session?.user?.name} · {session?.membership?.role?.name}</div>
        </div>
        <nav className="ml-2 flex gap-1">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className={cn("relative flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium tracking-[0.1px]", pathname === t.href ? "bg-sidebar-active-bg text-sidebar-active" : "text-fg-secondary hover:bg-fg/8")}>
              <t.icon className="h-5 w-5" /><span className="hidden lg:inline">{t.label}</span>
              {t.href === "/pos/qr" && qrCount ? <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-medium text-danger-fg tabular" aria-label={`${qrCount} waiting`}>{qrCount}</span> : null}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 flex-1 truncate px-2 text-sm text-fg-secondary">{title}</div>
        <Link href="/pos/shift" className={cn("hidden h-8 items-center rounded-lg px-3 text-sm font-medium sm:flex", shift ? "bg-success-soft text-success-ink" : "bg-warning-soft text-warning-ink")}>{shift ? "Shift open" : "No shift"}</Link>
        <SyncBadge />
        {session?.permissions?.includes("app.admin") ? <Link href="/admin" className="hidden h-10 w-10 place-items-center rounded-full text-fg-secondary hover:bg-fg/8 lg:grid" title="Admin"><LayoutDashboard className="h-5 w-5" /></Link> : null}
        <ThemeToggle />
        <button onClick={() => { lock(); router.replace("/pos/pin"); }} className="grid h-10 w-10 place-items-center rounded-full text-fg-secondary hover:bg-fg/8" title="Lock" aria-label="Lock"><Lock className="h-5 w-5" /></button>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
