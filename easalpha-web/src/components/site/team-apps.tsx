import Link from "next/link";
import QRCode from "qrcode";
import { Bike, CheckCircle2, Lock, ShoppingBag, type LucideIcon } from "lucide-react";
import { CARD } from "./sections";

const qrSvg = (url: string) => QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });

interface AppCard { icon: LucideIcon; title: string; needs: string; points: string[]; who: string; steps: string[]; qr: string; qrCaption: string; link: { href: string; label: string } }

/** The Download page's second half: the rider app and each restaurant's customer app. Both are installable web apps
 *  (no app store), so the "download" is a link and a QR code; the steps say who sets each one up and who can open it. */
export async function TeamApps({ origin, exampleSlug = "demo-cafe" }: { origin: string; exampleSlug?: string }) {
  const riderUrl = `${origin}/rider`;
  const storeUrl = `${origin}/store/${exampleSlug}`;
  const [riderQr, storeQr] = await Promise.all([qrSvg(riderUrl), qrSvg(storeUrl)]);
  const cards: AppCard[] = [
    {
      icon: Bike, title: "Rider app", needs: "Any Android phone in Chrome, or an iPhone in Safari",
      points: ["The rider's deliveries with the address, the items and the cash to collect", "Navigate and Call buttons, then Picked up, Arrived and Delivered in one tap each", "Works with weak signal: every tap is saved on the phone and sent when signal returns", "A sound and a notification when a delivery is assigned; signed in for the whole shift"],
      who: "Only phones the owner pairs from the admin panel, and only riders with a PIN, can open it.",
      steps: ["Owner: Admin, Riders, Rider App, Add rider phone.", "The rider scans the pairing QR with the phone camera; the app opens and pairs itself.", "Tap Install, then sign in with the rider's 4-digit PIN."],
      qr: riderQr, qrCaption: "Scan to open the rider app", link: { href: "/rider", label: "Open the rider app" },
    },
    {
      icon: ShoppingBag, title: "Your restaurant's customer app", needs: "Any phone; customers need no account to install it",
      points: ["Your name, logo and colour on the customer's home screen", "Opens straight to your menu, cart and live order tracking", "Nothing to publish in a store: every change you make reaches all customers at once"],
      who: "Each restaurant's app opens only that restaurant's own site.",
      steps: ["Owner: Admin, Settings, Website Config, and switch Published on.", "Copy the link or print the QR from the Your customer app card; share it on WhatsApp, tables and bags.", "Customers open it and tap Install on Android, or Share, Add to Home Screen on iPhone."],
      qr: storeQr, qrCaption: "Example: Demo Cafe's app", link: { href: `/store/${exampleSlug}`, label: "See an example" },
    },
  ];
  return (
    <section aria-labelledby="team-apps" className="mt-16">
      <h2 id="team-apps" className="text-2xl font-bold text-[#0B1F3A]">Apps for your riders and customers</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">Two more apps come with every account. Both install from a link on any phone, with no app store and nothing to pay, and each one opens only what that person needs.</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {cards.map((c) => (
          <article key={c.title} className={`flex flex-col p-6 sm:p-7 ${CARD}`}>
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#0B1F3A] text-white"><c.icon className="h-6 w-6" /></span>
              <div>
                <h3 className="text-xl font-bold text-[#0B1F3A]">{c.title}</h3>
                <p className="mt-0.5 text-sm text-slate-600">{c.needs}</p>
              </div>
            </div>
            <ul className="mt-5 space-y-2 text-sm text-slate-700">
              {c.points.map((p) => <li key={p} className="flex items-start gap-2.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#FF7A1A]" aria-hidden />{p}</li>)}
            </ul>
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-[#F4F7FB] p-3 text-sm text-slate-700"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#0B1F3A]" aria-hidden />{c.who}</p>
            <div className="mt-5 grid flex-1 gap-5 sm:grid-cols-[1fr_auto] sm:items-start">
              <ol className="space-y-3 text-sm text-slate-700">
                {c.steps.map((s, n) => <li key={s} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-cta text-xs font-bold text-white">{n + 1}</span><span className="pt-0.5">{s}</span></li>)}
              </ol>
              <figure className="flex flex-col items-center gap-2">
                <div role="img" aria-label={c.qrCaption} className="h-36 w-36 rounded-xl bg-white p-2 ring-1 ring-slate-200" dangerouslySetInnerHTML={{ __html: c.qr }} />
                <figcaption className="text-center text-xs text-slate-500">{c.qrCaption}</figcaption>
              </figure>
            </div>
            <Link href={c.link.href} className="mt-6 inline-flex h-11 items-center justify-center self-start rounded-full border border-[#0B1F3A]/20 px-5 text-sm font-semibold text-[#0B1F3A] transition hover:bg-[#F4F7FB]">{c.link.label}</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
