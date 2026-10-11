import Link from "next/link";
import Image from "next/image";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { CONTACT, telLink, whatsappLink, type SiteContact } from "./site-helpers";

const COLUMNS = [
  { title: "Product", links: [{ href: "/features", label: "Features" }, { href: "/pricing", label: "Pricing" }, { href: "/download", label: "Download the desktop app" }, { href: "/apps", label: "Open an app screen" }, { href: "/login", label: "Log in" }, { href: "/signup", label: "Start free" }] },
  { title: "Company", links: [{ href: "/contact", label: "Contact" }, { href: "/privacy", label: "Privacy" }, { href: "/terms", label: "Terms" }] },
];

const link = "text-sm text-white/90 transition-colors hover:text-[#FF7A1A]";

export function SiteFooter({ contact = CONTACT }: { contact?: SiteContact }) {
  return (
    <footer className="bg-[#0B1F3A] text-white [--heading-color:#fff]">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
        <div>
          <Image src="/brand/logo-white.svg" alt="EasAlpha" width={130} height={32} unoptimized className="h-8 w-auto" />
          <p className="mt-4 max-w-xs text-sm leading-6 text-white/70">The complete restaurant POS for Pakistan: till, kitchen, stock, money, people, riders and customers in one account.</p>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#FF7A1A]">{c.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {c.links.map((l) => <li key={l.href}><Link href={l.href} className={link}>{l.label}</Link></li>)}
            </ul>
          </div>
        ))}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#FF7A1A]">Contact</h3>
          <ul className="mt-4 space-y-3 text-sm">
            <li><a href={whatsappLink(undefined, contact)} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2.5 ${link}`}><MessageCircle className="h-4 w-4 text-[#FF7A1A]" />WhatsApp {contact.whatsappDisplay}</a></li>
            <li><a href={telLink(contact)} className={`flex items-center gap-2.5 ${link}`}><Phone className="h-4 w-4 text-[#FF7A1A]" />{contact.whatsappDisplay}</a></li>
            <li><a href={`mailto:${contact.email}`} className={`flex items-center gap-2.5 ${link}`}><Mail className="h-4 w-4 text-[#FF7A1A]" />{contact.email}</a></li>
            <li className="flex items-start gap-2.5 text-white/70"><MapPin className="mt-1 h-4 w-4 shrink-0 text-[#FF7A1A]" />{contact.address}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>&copy; {new Date().getFullYear()} EasAlpha. All rights reserved.</span>
          <span>Built in Pakistan for Pakistani restaurants. Prices in PKR, taxes per FBR and PRA rules.</span>
        </div>
      </div>
    </footer>
  );
}
