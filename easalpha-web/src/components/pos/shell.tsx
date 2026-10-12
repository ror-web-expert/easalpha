"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Lock, ShoppingCart, ListOrdered, Wallet, AlertTriangle, LayoutDashboard, QrCode, Bike, Printer, Clock, Megaphone } from "lucide-react";
import { useDeviceStore, usePosCan } from "@/store/device";
import { useCatalogStore } from "@/store/catalog";
import { useSyncStore } from "@/store/sync";
import { SyncBadge } from "./sync-badge";
import { useTillLive } from "./live";
import { Button, ConfirmDialog, Dialog, ThemeToggle } from "@/components/ui";
import { desktopApp, printServer } from "@/lib/print";
import { refreshOpenCounts } from "@/lib/pos-actions";
import { pendingReminderState } from "@/lib/pos-rules";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/pos", label: "Sell", icon: ShoppingCart },
  { href: "/pos/orders", label: "Orders", icon: ListOrdered },
  { href: "/pos/qr", label: "QR orders", icon: QrCode },
  { href: "/pos/delivery", label: "Delivery", icon: Bike },
  { href: "/pos/shift", label: "Shift", icon: Wallet },
  // SPEC Vouchers: personal codes are sent from the POS campaign screen (MARKETING / MARKETING_CAMPAIGN; admins always).
  { href: "/pos/campaign", label: "Campaign", icon: Megaphone, perms: ["MARKETING", "MARKETING_CAMPAIGN", "settings.manage"] },
  // SPEC "Offline behaviour": the offline queue has its own permission (OFFLINE_ORDERS); admins (settings.manage) always see it.
  { href: "/pos/attention", label: "Attention", icon: AlertTriangle, perms: ["OFFLINE_ORDERS", "settings.manage"] },
];

export function PosShell({ children, title }: { children: React.ReactNode; title?: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useDeviceStore((s) => s.session);
  const branch = useDeviceStore((s) => s.branch);
  const lock = useDeviceStore((s) => s.lock);
  const shift = useCatalogStore((s) => s.shift);
  const settings = useCatalogStore((s) => s.catalog?.business.settings);
  const openCounts = useSyncStore((s) => s.openCounts);
  const can = usePosCan();
  const live = useTillLive();
  // SPEC "Printing": printers are configured on the desktop POS behind PRINTERS; tablets only print through its print server.
  const [printersOpen, setPrintersOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const server = printServer(settings);
  const openPrinters = () => {
    const d = desktopApp();
    if (d && typeof d.openPrinterSettings === "function") d.openPrinterSettings(); else setPrintersOpen(true);
  };
  const qrCount = live.available ? live.pending.length + live.requests.length : 0;

  // SPEC "Pending Orders" reminder: counts from GET /me pills every 60 s (local open orders when offline); the clock
  // ticks each minute so the badge turns red near the day end without a reload.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!session) return;
    refreshOpenCounts();
    const t = setInterval(() => { refreshOpenCounts(); setNow(new Date()); }, 60_000);
    return () => clearInterval(t);
  }, [session]);
  const reminder = pendingReminderState(openCounts, now, branch?.day_end_time, settings);
  const doLock = () => { setLockOpen(false); lock(); router.replace("/pos/pin"); };
  const tabs = TABS.filter((t) => !t.perms || can(...t.perms));

  return (
    <div className="flex h-dvh flex-col">
      {/* The bar never grows wider than the screen: tabs show labels only on wide screens and scroll sideways when
          they still do not fit, and the pending-orders note shrinks to a count. A wider bar made tablets lay the whole
          till out wider than the screen, so it shrank and slid sideways under a finger. */}
      <header className="no-print flex h-16 min-w-0 shrink-0 items-center gap-2 overflow-hidden bg-navy px-3 text-white">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cta text-lg font-semibold text-cta-fg">S</span>
        <div className="hidden min-w-0 max-w-40 shrink xl:block">
          <div className="truncate text-base font-medium leading-tight text-white">{branch?.name}</div>
          <div className="truncate text-xs tracking-[0.4px] text-white/70">{session?.user?.name} · {session?.membership?.role?.name}</div>
        </div>
        <nav className="scrollbar-none ml-1 flex min-w-0 shrink gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} title={t.label} aria-label={t.label} className={cn("relative flex h-12 min-w-12 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 text-sm font-medium tracking-[0.1px] 2xl:px-4", pathname === t.href ? "bg-sidebar-active-bg text-sidebar-active" : "text-white/85 hover:bg-white/10")}>
              <t.icon className="h-5 w-5 shrink-0" /><span className="hidden 2xl:inline">{t.label}</span>
              {t.href === "/pos/qr" && qrCount ? <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-medium text-danger-fg tabular" aria-label={`${qrCount} waiting`}>{qrCount}</span> : null}
            </Link>
          ))}
        </nav>
        <div className="hidden min-w-0 flex-1 truncate px-2 text-sm text-white/70 lg:block">{title}</div>
        <div className="flex-1 lg:hidden" />
        {reminder && reminder.count > 0 ? (
          <Link href="/pos/orders" title={reminder.tone === "red" ? "Closing time is near and orders are still open" : "Pending orders"} aria-label={reminder.text} className={cn("flex h-10 min-w-0 shrink items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium", reminder.tone === "red" ? "bg-danger text-danger-fg" : "bg-warning-soft text-warning-ink")}>
            <Clock className="h-4 w-4 shrink-0" /><span className="hidden max-w-80 truncate 2xl:inline">{reminder.text}</span><span className="tabular 2xl:hidden">{reminder.count}</span>
          </Link>
        ) : null}
        <Link href="/pos/shift" className={cn("hidden h-10 shrink-0 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium xl:flex", shift ? "bg-success-soft text-success-ink" : "bg-warning-soft text-warning-ink")}>{shift ? "Shift open" : "No shift"}</Link>
        <SyncBadge className="shrink-0" />
        {session?.permissions?.includes("app.admin") ? <Link href="/admin" className="hidden h-12 w-12 shrink-0 place-items-center rounded-full text-white/85 hover:bg-white/10 lg:grid" title="Admin"><LayoutDashboard className="h-5 w-5" /></Link> : null}
        {can("PRINTERS", "settings.manage") ? <button onClick={openPrinters} className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-white/85 hover:bg-white/10" title="Printers" aria-label="Printers"><Printer className="h-5 w-5" /></button> : null}
        <ThemeToggle className="shrink-0 text-white/85 hover:bg-white/10" />
        <button onClick={() => (reminder && reminder.count > 0 ? setLockOpen(true) : doLock())} className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-white/85 hover:bg-white/10" title="Lock" aria-label="Lock"><Lock className="h-5 w-5" /></button>
      </header>
      {/* Pages that are taller than the screen (Shift, Needs attention) scroll here; the Sell screen fits and does not. */}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      <Dialog open={printersOpen} onClose={() => setPrintersOpen(false)} title="Printers" size="sm" footer={<Button onClick={() => setPrintersOpen(false)}>Done</Button>}>
        <p className="text-sm text-fg-secondary">
          {server
            ? `Printers are set up on the desktop POS. This device prints through the print server at ${server.ip}.`
            : "Printers are set up on the desktop POS. No print server is saved for this store yet, so this device prints through the browser. Enter the desktop computer's IP under Settings, Point of Sale, Print Server in the admin panel."}
        </p>
        {server ? <p className="mt-2 text-xs text-fg-muted">Port {server.port}. Change the address under Settings, Point of Sale, Print Server in the admin panel.</p> : null}
      </Dialog>
      {/* SPEC "Pending Orders": the reminder warns at logout while orders are still open. */}
      <ConfirmDialog open={lockOpen} onClose={() => setLockOpen(false)} onConfirm={doLock} title={`${reminder?.count ?? 0} ${reminder?.count === 1 ? "order is" : "orders are"} still open`} description={`${reminder?.text ?? ""}. Open orders carry over to the next day until they are completed. Complete them from Orders, or lock the till anyway.`} confirmLabel="Lock anyway" />
    </div>
  );
}
