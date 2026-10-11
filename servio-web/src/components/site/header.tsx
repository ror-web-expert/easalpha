"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, MessageCircle, Phone, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLangStore } from "./lang-store";
import { Txt } from "./txt";
import { CONTACT, telLink, whatsappLink, type UiKey } from "./site-helpers";

const NAV: { href: string; k: UiKey }[] = [
  { href: "/features", k: "nav.features" },
  { href: "/pricing", k: "nav.pricing" },
  { href: "/contact", k: "nav.contact" },
];

function LangToggle({ className }: { className?: string }) {
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  return (
    <div role="radiogroup" aria-label="Language" className={cn("inline-flex items-center rounded-full border border-white/25 bg-white/10 p-0.5 text-xs font-semibold", className)}>
      <button type="button" role="radio" aria-checked={lang === "en"} onClick={() => setLang("en")} className={cn("rounded-full px-2.5 py-1 transition", lang === "en" ? "bg-white text-[#0B1F3A]" : "text-white/85 hover:text-white")}>ENG</button>
      <button type="button" role="radio" aria-checked={lang === "ur"} lang="ur" onClick={() => setLang("ur")} className={cn("rounded-full px-2.5 py-1 transition", lang === "ur" ? "bg-white text-[#0B1F3A]" : "text-white/85 hover:text-white")}>اردو</button>
    </div>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const init = useLangStore((s) => s.init);
  useEffect(() => { init(); }, [init]);
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
        <Link href="/" className="flex shrink-0 items-center" aria-label="Servio home">
          <Image src="/brand/logo-white.svg" alt="Servio" width={130} height={32} priority unoptimized className="h-8 w-auto" />
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cn("rounded-full px-4 py-2 text-sm font-medium transition-colors hover:bg-white/10", pathname === n.href ? "text-[#FFB27A]" : "text-white")}>
              <Txt k={n.k} />
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <LangToggle />
          <a href={telLink()} aria-label={`Call ${CONTACT.whatsappDisplay}`} title={`Call ${CONTACT.whatsappDisplay}`} className="grid h-10 w-10 place-items-center rounded-full bg-[#FF7A1A] text-white transition hover:bg-[#E0640C]"><Phone className="h-4 w-4" /></a>
          <a href={whatsappLink()} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp" title="Chat on WhatsApp" className="grid h-10 w-10 place-items-center rounded-full bg-[#128C7E] text-white transition hover:bg-[#0e7366]"><MessageCircle className="h-4 w-4" /></a>
          <Link href="/login" className="rounded-full px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"><Txt k="cta.login" /></Link>
          <Link href="/signup" className="rounded-full bg-[#FF7A1A] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#E0640C] hover:shadow-md"><Txt k="cta.start" /></Link>
        </div>
        <div className="flex items-center gap-2 lg:hidden">
          <LangToggle />
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
          <div className="mt-2 flex gap-2">
            <a href={telLink()} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#FF7A1A] text-sm font-semibold text-white"><Phone className="h-4 w-4" />Call</a>
            <a href={whatsappLink()} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#128C7E] text-sm font-semibold text-white"><MessageCircle className="h-4 w-4" />WhatsApp</a>
          </div>
          <Link href="/signup" className="mt-2 rounded-full border border-white/30 px-5 py-3 text-center text-base font-semibold text-white hover:bg-white/10"><Txt k="cta.start" /></Link>
        </nav>
      </div>
    </header>
  );
}
