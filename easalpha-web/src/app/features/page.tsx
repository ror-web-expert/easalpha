import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { SiteShell } from "@/components/site/shell";
import { BrowserFrame, CARD, Container, CtaBand, Eyebrow, HeroChip, PageHero, PhoneFrame, SHOTS, type Shot } from "@/components/site/sections";
import { Reveal } from "@/components/site/reveal";
import { TRIAL_DAYS } from "@/components/site/site-helpers";

export const metadata: Metadata = {
  title: "Restaurant POS features, till to reports",
  description: "Every EasAlpha area: offline till, kitchen display, recipes and stock, purchasing, double-entry accounts, payroll, riders, khata, WhatsApp and 27 reports.",
  alternates: { canonical: "/features", languages: { en: "/features", "x-default": "/features" } },
};

interface Area { id: string; name: string; title: string; text: string; bullets: string[]; shots: Shot[]; phone?: boolean }

const AREAS: Area[] = [
  { id: "sell", name: "Sell", title: "Till, tablet and orders", text: "Everything the counter and the floor need to take money quickly and correctly.",
    bullets: ["Walk-in, takeaway and delivery orders, each with its own permission, and sources for counter, website, QR table, phone and Foodpanda", "Offline till: the menu is cached, orders queue and sync in order, and rejected records land in Needs Attention", "Part payment, direct unpaid orders, complimentary orders, a confirmation popup before completion and pending-order reminders", "Reopen flow with its own permissions and PIN; the order story records every item and money change", "Receipts on 58 or 80 mm paper with logo, both phone numbers, Urdu names, unit prices, change line, PAID stamp and real QR codes"],
    shots: [SHOTS.till, SHOTS.orders] },
  { id: "kitchen", name: "Kitchen", title: "Kitchen display and token screen", text: "Tickets reach the right station the moment the order is placed.",
    bullets: ["Stations per branch, each with a printer or a display device", "Timers per ticket with amber and red thresholds and alerts for modified or cancelled orders", "Bump to clear; the token screen shows guests which orders are ready", "Live updates over a persistent connection; no manual refresh"],
    shots: [SHOTS.kitchen] },
  { id: "inventory", name: "Inventory", title: "Recipes, deduction and stock reports", text: "Stock is recipe-driven: selling a product deducts its ingredients, and the system reports theoretical against actual.",
    bullets: ["Deduction at order completion, never twice, with a safety-net job and a Deduction Health screen with Retry", "Document register with nine types (purchase, receipt, return, waste, adjustment, transfer, production, count, reset) and five statuses", "Items with auto SKU, units and conversions, system sections, consumables per order type", "Demand buckets for what to order, daily stock sheet, stock ledger, consumption, waste and adjustments, actual vs theoretical, valuation and COGS", "AI stock forecast view fed by a rules engine today"],
    shots: [SHOTS.stock, SHOTS.deduction] },
  { id: "purchasing", name: "Purchasing", title: "Purchase orders and supplier ledgers", text: "From order to receipt to payment, with every rupee owed to a supplier visible.",
    bullets: ["Purchase order tiles, receiving, returns and payments behind nine PO permissions", "Supplier Dr/Cr ledger with adjustments, payments, insights and ranking", "Purchase price history with verdicts when a price jumps", "Payables aging and a purchases report"],
    shots: [SHOTS.supplier] },
  { id: "money", name: "Money", title: "Payments, expenses and double-entry accounts", text: "Real books, not a sales summary.",
    bullets: ["Payment accounts for cash, cards, bank, JazzCash and EasyPaisa; tax per account; charges as a percentage or a fixed amount", "Expenses with categories and export; payroll syncs to expenses", "Chart of accounts, journal vouchers, combined ledger, trial balance and balance sheet", "Fixed assets, liabilities and equity screens", "Finance dashboard, shifts, day close and tax invoices for FBR and PRA"],
    shots: [SHOTS.finance, SHOTS.balance] },
  { id: "people", name: "People", title: "Staff, attendance and payroll", text: "Separate record types for admin staff, cashiers, order takers, riders and employees, each with its own screen and login.",
    bullets: ["Attendance rules engine: late, early leave, overtime, holidays, leave, per-employee rules and defaults", "Fingerprint enrolment and kiosk scan log; selfie attendance where there is no reader", "Payroll overview, employees, advances, run payroll with a snapshot, ledger, reports and settings", "Departments, designations, CNIC and salary components for Pakistani payroll records", "Commission rules and tips shared to staff"],
    shots: [SHOTS.attendance] },
  { id: "riders", name: "Riders", title: "Delivery board and rider app", text: "Permanent riders with a vault, temporary riders for a busy night, and a phone app for the road.",
    bullets: ["Delivery board with zones and charges per delivery", "Temporary riders with a lifetime: one order, N orders, rest of today or N hours, with their own permissions", "Rider vault: issue, return, spend, adjust and a statement per rider", "Rider app paired by code: assignments and status steps; cash on delivery is confirmed at the till", "Rider reports per rider and per period"],
    shots: [SHOTS.rider], phone: true },
  { id: "customers", name: "Customers and marketing", title: "Khata, loyalty, vouchers, reviews and WhatsApp", text: "Every customer is a ledger account, and every message goes out from a number they know.",
    bullets: ["Customer ledger with khata number, credit limit, payments, account statement and AR aging", "Loyalty points with earn rules and redemption options; regular discount tiers", "Voucher batches, personal codes per customer and public codes with usage limits", "Reviews from the tablet and the website tied to an order, with a pending filter", "WhatsApp account notifications: receipts, statements, OTP codes, campaigns with opt-in and STOP, logs; linked by QR or through the Meta Cloud API", "Push notifications to owners for day close, offline tills, low stock and cancellations"],
    shots: [SHOTS.whatsapp, SHOTS.storefrontDesktop] },
  { id: "reports", name: "Reports", title: "27 reports with CSV and PDF", text: "Business overview to AI pricing, every one exportable and most scheduled by email.",
    bullets: ["Grand Report, sales, sales calendar, financial, products and deals, category report", "Order takers, cashiers, cashier till with day-end settlement, customers, customer ledger", "Operations, cancelled and modified orders, delivery riders, vouchers, loyalty points, regular discounts", "AI pricing and AI stock forecast", "Branch comparison and scheduled reports"],
    shots: [SHOTS.grand, SHOTS.calendar] },
  { id: "settings", name: "Settings and security", title: "Permissions, audit and the storefront", text: "Who can do what, what changed and when, and how your restaurant looks online.",
    bullets: ["58 permissions across 12 modules per user with Cashier, Supervisor and Manager presets and a surface badge (software, app or both)", "User sessions, audit log of every change, business-day window and a settings store with versions", "Devices paired by 24-hour codes: tills, tablets, kitchen displays and rider phones", "Website Config drives the storefront: menu, ordering, QR tables, reviews, custom domain", "Plan, payment methods, WhatsApp, notifications, loyalty, regular discounts, vouchers, reviews, store management for branches"],
    shots: [SHOTS.permissions, SHOTS.dashboard] },
];

export default function FeaturesPage() {
  return (
    <SiteShell>
      <PageHero eyebrow="Features" title="Everything in EasAlpha, area by area" text="Each section below is built, tested and in the product today. Where a screenshot exists it is the real screen, not a mock-up." 
        visual={<div className="relative min-w-0 lg:[perspective:1200px]"><div className="lg:origin-left lg:[transform:rotateY(-6deg)]"><BrowserFrame shot={SHOTS.dashboard} sizes="(max-width: 1024px) 100vw, 560px" priority dark /></div><HeroChip icon={CheckCircle2} title="Built and tested" text="every area below is live today" className="absolute -left-4 -bottom-6 hidden sm:flex" /></div>} />
      <Container className="grid gap-12 py-20 lg:grid-cols-[220px_1fr] lg:py-28">
        <nav aria-label="Areas" className="hidden lg:block">
          <ul className="sticky top-24 space-y-1 text-sm">
            {AREAS.map((a) => <li key={a.id}><a href={`#${a.id}`} className="block rounded-lg px-3 py-2 font-medium text-slate-600 transition hover:bg-[#F4F7FB] hover:text-[#0B1F3A]">{a.name}</a></li>)}
          </ul>
        </nav>
        <div className="min-w-0 space-y-24">
          {AREAS.map((a) => (
            <section key={a.id} id={a.id} className="scroll-mt-24">
              <Reveal>
                <Eyebrow>{a.name}</Eyebrow>
                <h2 className="mt-2 text-[28px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[#0B1F3A] sm:text-[34px]">{a.title}</h2>
                <p className="mt-3 text-lg text-slate-600">{a.text}</p>
                <ul className="mt-6 space-y-3">
                  {a.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-3 text-slate-700"><CheckCircle2 aria-hidden className="mt-1 h-5 w-5 shrink-0 text-[#FF7A1A]" /><span>{b}</span></li>
                  ))}
                </ul>
              </Reveal>
              <Reveal delay={100} className={a.phone ? "mt-10 flex justify-center" : `mt-10 grid gap-8 ${a.shots.length > 1 ? "md:grid-cols-2" : ""}`}>
                {a.phone ? <PhoneFrame shot={a.shots[0]} sizes="(max-width: 640px) 60vw, 250px" /> : a.shots.map((s) => <BrowserFrame key={s.src} shot={s} sizes={a.shots.length > 1 ? "(max-width: 768px) 100vw, 440px" : "(max-width: 1024px) 100vw, 860px"} />)}
              </Reveal>
            </section>
          ))}
          <p className={`p-6 text-slate-600 ${CARD}`}>EasAlpha also keeps extras beyond the core spec: reservations, QR table ordering, modifier groups, overheads and food cost, production, goods received, campaigns, roles, branch comparison, Foodpanda, setup checklist and opening and closing checklists. See <Link href="/pricing" className="py-3 font-semibold text-[#0B1F3A] underline decoration-[#FF7A1A] decoration-2 underline-offset-4 hover:text-[#C2410C]">which plan includes what</Link>.</p>
        </div>
      </Container>
      <CtaBand title="See it with your own menu" text={`Create an account, import your products and try every screen free for ${TRIAL_DAYS} days.`} secondary={{ href: "/contact", label: "Book a demo" }} />
    </SiteShell>
  );
}
