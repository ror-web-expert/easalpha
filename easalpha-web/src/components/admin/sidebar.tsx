"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, ChevronDown, ChevronRight, ChevronsUpDown, CornerDownLeft, LogOut, Menu as MenuIcon, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV, type NavGroup, type NavItem } from "./nav";
import { useAuthStore, hasPermission } from "@/store/auth";
import { api } from "@/lib/api";
import type { Session } from "@/lib/types";
import { Badge, Button, ThemeToggle } from "@/components/ui";
import { format } from "date-fns";
import { toast } from "@/store/toast";
import { HeaderPills } from "./dashboard-pills";
import { MODULE_INFO, useModules } from "@/lib/modules";
import { AnnouncementBanner, NeedHelpFab, PoweredBy } from "./help-support";

function isActive(it: NavItem, pathname: string) {
  const base = it.href.split("#")[0];
  if (it.href.includes("#")) return false; // report tabs: only the exact Business Overview entry highlights
  return base === "/admin" || it.exact ? pathname === base : pathname === base || pathname.startsWith(base + "/");
}

/** Groups and items this user may see, in nav order. */
function useVisibleNav(): NavGroup[] {
  const perms = useAuthStore((s) => s.session?.permissions);
  const modules = useModules();
  return useMemo(
    () => NAV.map((g) => ({ ...g, items: g.items.filter((it) => (!it.perms || hasPermission(perms, ...it.perms)) && (!it.module || modules[it.module])) })).filter((g) => g.items.length),
    [perms, modules],
  );
}

/** The nav entry for the current page: the longest matching href wins (so /admin/stock/items beats /admin/stock). */
function useCurrent(groups: NavGroup[]) {
  const pathname = usePathname();
  return useMemo(() => {
    let best: { group: NavGroup; item: NavItem } | null = null;
    for (const group of groups)
      for (const item of group.items)
        if (isActive(item, pathname) && (!best || item.href.length > best.item.href.length)) best = { group, item };
    return best;
  }, [groups, pathname]);
}

function NavLinks({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const current = useCurrent(groups);
  const activeGroup = current?.group.label;
  // Accordion: one group open at a time, following the current page, so the sidebar stays short.
  const [open, setOpen] = useState<string | null>(activeGroup ?? null);
  useEffect(() => { if (activeGroup) setOpen(activeGroup); }, [activeGroup]);

  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-thin">
      {groups.map((group) => {
        const expanded = open === group.label;
        const hasActive = group.label === activeGroup;
        const allSoon = group.items.every((it) => it.soon);
        if (group.flat) {
          // SPEC standalone screens: top-level links with no group header.
          return (
            <ul key={group.label} className="mb-2 space-y-0.5">
              {group.items.map((it) => {
                const active = current?.item.href === it.href;
                return (
                  <li key={it.href}>
                    <Link href={it.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                      className={cn("relative flex h-10 items-center gap-3 rounded-full px-4 text-sm font-medium tracking-[0.1px] text-sidebar-text transition-colors hover:bg-white/10", active && "bg-sidebar-active-bg text-sidebar-active hover:bg-sidebar-active-bg before:absolute before:bottom-2 before:left-0 before:top-2 before:w-[3px] before:rounded-full before:bg-cta")}>
                      <it.icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                      <span className="truncate">{it.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          );
        }
        return (
          <div key={group.label}>
            <button
              onClick={() => setOpen(expanded ? null : group.label)}
              aria-expanded={expanded}
              className={cn(
                "group relative flex h-10 w-full items-center gap-3 rounded-full px-4 text-sm font-medium tracking-[0.1px] text-white/60 transition-colors hover:bg-white/10 hover:text-white/85",
                expanded && "text-white/85",
                hasActive && !expanded && "bg-sidebar-active-bg text-sidebar-active before:absolute before:bottom-2 before:left-0 before:top-2 before:w-[3px] before:rounded-full before:bg-cta",
              )}
            >
              <group.icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
              <span className="flex-1 truncate text-left">{group.label}</span>
              {allSoon ? <span className="rounded-full bg-white/10 px-2 text-[11px] font-medium tracking-[0.5px] text-white/70">Soon</span> : null}
              <ChevronRight className={cn("h-4 w-4 text-white/60 transition-transform", expanded && "rotate-90")} />
            </button>
            {expanded ? (
              <ul className="mb-2 mt-0.5 space-y-0.5">
                {group.items.map((it) => {
                  const active = current?.item.href === it.href || (isActive(it, pathname) && !current);
                  if (it.soon) {
                    return (
                      <li key={it.href + it.label}>
                        <span className="flex h-9 cursor-default items-center gap-2 rounded-full pl-12 pr-4 text-sm text-white/50" title="Not built yet">
                          <span className="truncate">{it.label}</span>
                          <span className="ml-auto rounded-full bg-white/10 px-2 text-[11px] font-medium tracking-[0.5px] text-white/70">Soon</span>
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={it.href + it.label}>
                      <Link
                        href={it.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "relative flex h-9 items-center rounded-full pl-12 pr-4 text-sm text-sidebar-text transition-colors hover:bg-white/10",
                          active && "bg-sidebar-active-bg font-medium text-sidebar-active hover:bg-sidebar-active-bg before:absolute before:bottom-2 before:left-0 before:top-2 before:w-[3px] before:rounded-full before:bg-cta",
                        )}
                      >
                        <span className="truncate">{it.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function BusinessSwitcher() {
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!session) return null;
  const others = session.businesses ?? [];
  const switchTo = async (id: string) => {
    if (id === session.business.id) return setOpen(false);
    setBusy(true);
    try {
      const s = await api<Session>("/auth/switch", { method: "POST", body: { business_id: id }, auth: "admin" });
      setSession(s);
      toast.success(`Switched to ${s.business.name}`);
      window.location.href = "/admin";
    } catch (e) {
      toast.error("Could not switch", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };
  return (
    <div className="relative px-3 pb-2 pt-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 rounded-full py-2 pl-2 pr-4 text-left text-white transition-colors hover:bg-white/10" disabled={busy}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cta text-base font-semibold text-cta-fg">
          {session.business.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium tracking-[0.15px] text-white">{session.business.name}</span>
          <span className="block truncate text-xs tracking-[0.4px] text-white/70">{session.membership.role.name}</span>
        </span>
        {others.length > 1 ? <ChevronsUpDown className="h-4 w-4 text-white/70" /> : null}
      </button>
      {open && others.length > 1 ? (
        <div className="absolute left-3 right-3 z-20 mt-1 rounded-[4px] bg-high py-2 text-fg shadow-[var(--shadow-pop)]">
          {others.map((b) => (
            <button key={b.id} onClick={() => switchTo(b.id)} className={cn("block h-12 w-full px-3 text-left text-sm hover:bg-fg/8", b.id === session.business.id && "font-medium text-primary")}>
              {b.name} <span className="text-xs text-fg-muted">· {b.role}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BranchPicker() {
  const session = useAuthStore((s) => s.session);
  const branchId = useAuthStore((s) => s.branchId);
  const setBranch = useAuthStore((s) => s.setBranch);
  const [branches, setBranches] = useState<{ id: string; name: string }[] | null>(null);
  const load = async () => {
    if (branches) return;
    try {
      const r = await api<{ data: { id: string; name: string }[] }>("/branches", { auth: "admin" });
      setBranches(r.data);
    } catch { setBranches([]); }
  };
  if (!session) return null;
  return (
    <label className="relative flex h-8 items-center rounded-full bg-white/10 pl-3 text-white hover:bg-white/15">
      <Building2 className="h-[18px] w-[18px] text-white/85" />
      <select
        className="h-full max-w-[160px] appearance-none bg-transparent pl-2 pr-8 text-sm font-medium tracking-[0.1px] text-white outline-none [&>option]:bg-card [&>option]:text-fg"
        value={branchId ?? session.branch?.id ?? ""}
        onFocus={load}
        onChange={(e) => { setBranch(e.target.value || null); window.location.reload(); }}
        aria-label="Branch"
      >
        {(branches ?? (session.branch ? [session.branch] : [])).map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </label>
  );
}

/** Ctrl+K page finder: with 60-plus admin pages, typing beats scrolling the sidebar. */
function PageSearch({ groups, open, onClose }: { groups: NavGroup[]; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const items = useMemo(() => {
    const all = groups.flatMap((g) => g.items.filter((it) => !it.soon).map((it) => ({ ...it, group: g.label })));
    const t = q.trim().toLowerCase();
    return t ? all.filter((it) => `${it.label} ${it.group}`.toLowerCase().includes(t)) : all;
  }, [groups, q]);
  useEffect(() => { if (open) { setQ(""); setIdx(0); } }, [open]);
  useEffect(() => { setIdx(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector(`[data-i="${idx}"]`)?.scrollIntoView({ block: "nearest" }); }, [idx]);
  if (!open || typeof document === "undefined") return null;
  const go = (href: string) => { onClose(); router.push(href); };
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/32 px-4 pt-[12vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Search pages" className="animate-in w-full max-w-xl overflow-hidden rounded-[28px] bg-high shadow-[var(--shadow-pop)]">
        <div className="flex items-center gap-4 border-b border-border-strong px-5">
          <Search className="h-6 w-6 text-fg-secondary" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, items.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter" && items[idx]) go(items[idx].href);
              else if (e.key === "Escape") onClose();
            }}
            placeholder="Search pages, e.g. recipes, shifts, suppliers"
            className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-fg-secondary"
          />
          <kbd className="rounded border border-border-strong px-1.5 text-[11px] font-medium text-fg-secondary">Esc</kbd>
        </div>
        <ul ref={listRef} className="max-h-[50vh] overflow-y-auto py-2 scrollbar-thin">
          {items.length === 0 ? <li className="px-3 py-8 text-center text-sm text-fg-secondary">No page matches “{q}”</li> : null}
          {items.map((it, i) => (
            <li key={it.href}>
              <button
                data-i={i}
                onMouseMove={() => setIdx(i)}
                onClick={() => go(it.href)}
                className={cn("flex h-14 w-full items-center gap-4 px-5 text-left text-base", i === idx && "bg-fg/8")}
              >
                <it.icon className="h-5 w-5 shrink-0 text-fg-secondary" />
                <span className="flex-1 truncate">{it.label}</span>
                <span className="text-sm text-fg-secondary">{it.group}</span>
                {i === idx ? <CornerDownLeft className="h-4 w-4 text-fg-secondary" /> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

function UserFooter({ onLogout }: { onLogout: () => void }) {
  const user = useAuthStore((s) => s.session?.user);
  const initials = (user?.name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="flex items-center gap-3 border-t border-white/15 px-4 py-3 text-white">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 text-sm font-medium text-white">{initials}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium tracking-[0.1px]">{user?.name}</span>
        <span className="block truncate text-xs tracking-[0.4px] text-white/70">{user?.email ?? user?.phone}</span>
      </span>
      <Button variant="ghost" size="icon" className="text-white/85 hover:bg-white/10" onClick={onLogout} title="Log out" aria-label="Log out">
        <LogOut className="h-5 w-5" />
      </Button>
    </div>
  );
}

/** SPEC top bar: live clock, the business-day window the dashboard reports on, and the plan badge. */
function DayBar() {
  const session = useAuthStore((s) => s.session);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!session) return null;
  const window_ = session.branch?.business_day_window;
  return (
    <div className="hidden items-center gap-2 text-xs text-white/85 md:flex">
      {now ? <span className="tabular whitespace-nowrap" suppressHydrationWarning>{format(now, "EEE d MMM yyyy · HH:mm")}</span> : null}
      {window_ ? <span className="whitespace-nowrap rounded-full bg-white/10 px-2.5 py-0.5 text-white" title="Daily reports and the dashboard use this window, not midnight to midnight">Business day {window_}</span> : null}
      <Badge className="bg-white/10 text-white">{session.business.plan?.name ?? "Trial"}</Badge>
    </div>
  );
}

/** A page that belongs to a switched-off module (opened from a bookmark or an old link) explains where to switch it on
 *  instead of showing the API's module.disabled error. */
function ModuleGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const modules = useModules();
  const isOwner = useAuthStore((s) => s.session?.membership.role.system_key === "owner");
  const item = useMemo(() => {
    let best: NavItem | null = null;
    for (const g of NAV) for (const it of g.items) if (it.module && isActive(it, pathname) && (!best || it.href.length > best.href.length)) best = it;
    return best;
  }, [pathname]);
  if (!item?.module || !modules.loaded || modules[item.module]) return <>{children}</>;
  const info = MODULE_INFO[item.module];
  return (
    <div className="mx-auto mt-12 max-w-lg rounded-2xl border bg-card p-8 text-center" data-module-off={item.module}>
      <h1 className="text-xl font-medium">{info.title} is switched off</h1>
      <p className="mt-2 text-sm text-fg-secondary">{info.summary}</p>
      <p className="mt-4 text-sm">{isOwner ? "Switch it on to use this page." : "Ask the owner to switch it on in Settings, Modules."}</p>
      {isOwner ? <Link href="/admin/settings/modules" className="mt-5 inline-flex h-10 items-center rounded-full bg-primary px-6 text-sm font-medium text-primary-fg">Open Modules</Link> : null}
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const clear = useAuthStore((s) => s.clear);
  const groups = useVisibleNav();
  const current = useCurrent(groups);
  // M3 top app bar in brand navy: flat at rest, a shadow once content scrolls under it.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen((o) => !o); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const logout = async () => {
    try { await api("/auth/logout", { method: "POST", body: { refresh_token: session?.refresh_token }, auth: "admin" }); } catch {}
    clear();
    router.replace("/login");
  };
  const sidebar = (
    <aside className="flex h-full w-64 flex-col bg-sidebar">
      <BusinessSwitcher />
      <div className="px-3 pb-3">
        <button
          onClick={() => { setMobileOpen(false); setSearchOpen(true); }}
          className="flex h-12 w-full items-center gap-3 rounded-full bg-white/10 px-4 text-base text-white/85 transition-colors hover:bg-white/15"
        >
          <Search className="h-5 w-5" />
          <span className="flex-1 truncate text-left">Search pages</span>
          <kbd className="rounded border border-white/30 px-1 text-[11px] font-medium">Ctrl K</kbd>
        </button>
      </div>
      <NavLinks groups={groups} onNavigate={() => setMobileOpen(false)} />
      <UserFooter onLogout={logout} />
      <PoweredBy />
    </aside>
  );
  return (
    <div className="flex min-h-screen">
      <div className="sticky top-0 hidden h-screen lg:block">{sidebar}</div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="h-full shadow-[var(--shadow-pop)]">{sidebar}</div>
          <div className="flex-1 bg-black/32" onClick={() => setMobileOpen(false)} />
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className={cn("no-print sticky top-0 z-30 flex h-16 items-center gap-2 bg-navy px-4 text-white transition-shadow md:px-6", scrolled && "shadow-[var(--elev-1)]")}>
          <Button variant="ghost" size="icon" className="-ml-2 text-white hover:bg-white/10 lg:hidden" onClick={() => setMobileOpen((o) => !o)} aria-label="Menu">
            {mobileOpen ? <X className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            {current ? (
              <>
                <span className="hidden text-white/70 sm:inline">{current.group.label}</span>
                <ChevronDown className="hidden h-4 w-4 -rotate-90 text-white/70 sm:inline" />
                <span className="truncate font-medium tracking-[0.1px] text-white">{current.item.label}</span>
              </>
            ) : null}
          </div>
          <button onClick={() => setSearchOpen(true)} className="grid h-10 w-10 place-items-center rounded-full text-white/85 hover:bg-white/10 lg:hidden" aria-label="Search pages">
            <Search className="h-6 w-6" />
          </button>
          <HeaderPills />
          <BranchPicker />
          <DayBar />
          <ThemeToggle className="text-white/85 hover:bg-white/10" />
        </header>
        <main className="mx-auto w-full max-w-[1800px] flex-1 px-4 pb-8 pt-4 sm:px-6">
          <AnnouncementBanner />
          <NeedHelpFab />
          <ModuleGate>{children}</ModuleGate>
        </main>
      </div>
      <PageSearch groups={groups} open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
