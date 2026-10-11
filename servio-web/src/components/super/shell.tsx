"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSuperStore } from "@/store/super";
import { Button } from "@/components/ui";

export const SUPER_NAV: { href: string; label: string; exact?: boolean }[] = [
  { href: "/super", label: "Dashboard", exact: true },
  { href: "/super/businesses", label: "Businesses" },
  { href: "/super/support", label: "Support" },
  { href: "/super/invoices", label: "Invoices" },
  { href: "/super/flags", label: "Feature flags" },
  { href: "/super/settings", label: "Settings" },
];

export function isSuperNavActive(href: string, pathname: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

/** Compact internal tool: a navy top bar with the brand, a flat nav row and the signed-in owner; white content below. */
export function SuperShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const admin = useSuperStore((s) => s.admin);
  const clear = useSuperStore((s) => s.clear);
  const logout = () => { clear(); router.replace("/super/login"); };

  return (
    <div className="flex min-h-screen flex-col bg-page">
      <header className="bg-navy-deep text-white [--heading-color:#fff]">
        <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-4 px-4">
          <Link href="/super" className="flex shrink-0 items-center gap-2.5" aria-label="Owner panel home">
            <Image src="/brand/logo-white.svg" alt="EasAlpha" width={96} height={24} priority unoptimized className="h-6 w-auto" />
            <span className="hidden text-sm text-white/60 sm:inline" aria-hidden="true">·</span>
            <span className="hidden text-sm font-medium tracking-[0.1px] text-white/85 sm:inline">Owner panel</span>
          </Link>
          <nav className="hidden flex-1 items-center gap-1 overflow-x-auto md:flex" aria-label="Owner panel">
            {SUPER_NAV.map((it) => <SuperNavLink key={it.href} {...it} active={isSuperNavActive(it.href, pathname, it.exact)} />)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {admin ? <span className="hidden max-w-[180px] truncate text-sm text-white/80 lg:inline" title={admin.email}>{admin.name}</span> : null}
            <Button variant="ghost" size="sm" className="text-white/85 hover:bg-white/10 hover:text-white" onClick={logout}><LogOut className="h-4 w-4" /> Log out</Button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden scrollbar-thin" aria-label="Owner panel">
          {SUPER_NAV.map((it) => <SuperNavLink key={it.href} {...it} active={isSuperNavActive(it.href, pathname, it.exact)} />)}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

function SuperNavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={cn("relative flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-medium tracking-[0.1px] transition-colors",
        active ? "bg-navy-raised text-white after:absolute after:bottom-0 after:left-3.5 after:right-3.5 after:h-[2px] after:rounded-full after:bg-cta" : "text-white/75 hover:bg-white/10 hover:text-white")}>
      {label}
    </Link>
  );
}

/** Title row for a super page: bold navy heading, muted one-liner, actions on the right. */
export function SuperPageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em] text-heading">{title}</h1>
        {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : "Something went wrong";
  return <p className="rounded-[4px] bg-danger-soft px-4 py-3 text-sm text-danger-ink">{msg}</p>;
}
