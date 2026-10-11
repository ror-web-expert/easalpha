"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Txt } from "./txt";
import { type UiKey } from "./site-helpers";

const NAV: { href: string; k: UiKey }[] = [
  { href: "/features", k: "nav.features" },
  { href: "/pricing", k: "nav.pricing" },
  { href: "/contact", k: "nav.contact" },
  { href: "/download", k: "nav.download" },
];


export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const solid = scrolled || open;
  return (
    <header className={cn("fixed inset-x-0 top-0 z-40 text-white transition-[background-color,box-shadow] duration-300", solid ? "bg-[#0B1F3A]/90 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.5)] backdrop-blur" : "bg-transparent")}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center" aria-label="EasAlpha home">
          <Image src="/brand/logo-white.svg" alt="EasAlpha" width={130} height={32} priority unoptimized className="h-8 w-auto" />
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cn("rounded-full px-4 py-2 text-sm font-medium transition-colors hover:bg-white/10", pathname === n.href ? "text-[#FFB27A]" : "text-white")}>
              <Txt k={n.k} />
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <Link href="/login" className="rounded-full px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"><Txt k="cta.login" /></Link>
          <Link href="/signup" className="rounded-full bg-[#FF7A1A] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#E0640C] hover:shadow-md"><Txt k="cta.start" /></Link>
        </div>
        <div className="flex items-center gap-2 lg:hidden">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="site-menu" aria-label={open ? "Close menu" : "Open menu"} className="grid h-10 w-10 place-items-center rounded-full text-white hover:bg-white/10">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      <div id="site-menu" className={cn("border-t border-white/10 bg-[#0B1F3A] lg:hidden", open ? "block" : "hidden")}>
        <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3" aria-label="Mobile">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2.5 text-base font-medium text-white hover:bg-white/10"><Txt k={n.k} /></Link>
          ))}
          <Link href="/login" className="rounded-lg px-3 py-2.5 text-base font-medium text-white hover:bg-white/10"><Txt k="cta.login" /></Link>
          <Link href="/signup" className="mt-2 rounded-full border border-white/30 px-5 py-3 text-center text-base font-semibold text-white hover:bg-white/10"><Txt k="cta.start" /></Link>
        </nav>
      </div>
    </header>
  );
}
