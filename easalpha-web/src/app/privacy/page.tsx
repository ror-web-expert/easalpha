import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site/shell";
import { Container, HeroStack, PageHero, Prose } from "@/components/site/sections";
import { FileText, Lock, ShieldCheck } from "lucide-react";
import { CONTACT } from "@/components/site/site-helpers";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How EasAlpha handles your restaurant's data: what we store, who can see it, how you export it and how to have it deleted.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <SiteShell>
      <PageHero eyebrow="Privacy policy" title="Your data stays yours" visual={<HeroStack chips={[{ icon: ShieldCheck, title: "Your data stays yours", text: "never sold, never shared" }, { icon: Lock, title: "Encrypted", text: "in transit and at rest" }, { icon: FileText, title: "Plain language", text: "no legal maze" }]} />}><p className="mt-4 text-sm text-white/60">Last updated 11 October 2026</p></PageHero>
      <Container className="max-w-3xl py-16 sm:py-20">
        <div>
          <Prose>
            <p>EasAlpha is a point-of-sale and management service for restaurants. This page explains, in plain language, what data the service holds, who can see it and what you can ask us to do with it. It applies to the public website, the admin panel, the till, tablet, kitchen, rider and storefront apps and the WhatsApp gateway.</p>
            <h2>What we store</h2>
            <ul>
              <li><strong>Your account:</strong> the owner&apos;s name, email, phone number and a hashed password. We never store the password itself.</li>
              <li><strong>Your restaurant&apos;s records:</strong> menu, orders, payments, stock, suppliers, expenses, accounts, staff records (including attendance, fingerprint identifiers from your kiosk and payroll), riders, customers (names, phone numbers, khata balances, loyalty points) and settings. You enter this data or your staff and customers generate it while using the service.</li>
              <li><strong>Device and usage records:</strong> which devices are paired, login sessions, and an audit log of changes made in your account, so you can see who did what.</li>
              <li><strong>Messages:</strong> if you link a WhatsApp number or use the included messaging, we keep a log of what was sent, to whom and whether it was delivered.</li>
              <li><strong>Website visits:</strong> this public website uses no advertising trackers. Server logs record IP address and pages requested for security and capacity planning and are kept for a short period.</li>
            </ul>
            <h2>Who can see it</h2>
            <ul>
              <li>Your data belongs to your account. It is separated from other customers&apos; data at the database level, and only users you add, with the permissions you grant, can see it.</li>
              <li>EasAlpha staff access customer data only to fix a problem you have reported or to keep the service running, and that access is logged.</li>
              <li>We do not sell data or share it with advertisers. We share it with third parties only where you have set up an integration (for example WhatsApp through Meta&apos;s Cloud API, Foodpanda, or tax filing to FBR or PRA) and only the data that integration needs.</li>
              <li>We use hosting and infrastructure providers to run the service. They process data on our instructions and do not use it for their own purposes.</li>
            </ul>
            <h2>Customers of your restaurant</h2>
            <p>When you add a customer&apos;s phone number or send them a receipt, you are responsible for having a basis to do so. Marketing messages require the customer&apos;s opt-in and honour STOP replies, and the service enforces this. Customers who want their data removed from your account should contact you; if they contact us we will pass the request on and help you fulfil it.</p>
            <h2>Exports and deletion</h2>
            <ul>
              <li>Every report exports to CSV and PDF, and customers, products and other records download as spreadsheets from the admin panel at any time, including during a read-only period after a trial or subscription ends.</li>
              <li>You can ask us to delete your account and all its data by writing to {CONTACT.email} from the owner&apos;s email. We confirm the request, then delete within 30 days, except where tax or accounting law requires us to keep invoice records longer.</li>
              <li>Backups that contain your data roll off on their normal schedule after deletion.</li>
            </ul>
            <h2>Security</h2>
            <p>Connections to the service are encrypted. Passwords are hashed. Till devices hold only the data they need to sell offline and can be unpaired from the admin panel at any time. We keep the software and its dependencies updated and review security findings as they appear. No service can promise perfect security; if we learn of a breach affecting your data we will tell you without undue delay and explain what happened.</p>
            <h2>Changes and contact</h2>
            <p>If this policy changes in a way that matters to you, we will tell account owners by email before it takes effect. Questions go to <a href={`mailto:${CONTACT.email}`} className="font-semibold text-[#0B1F3A] underline decoration-[#FF7A1A] decoration-2 underline-offset-4 hover:text-[#C2410C]">{CONTACT.email}</a> or through the <Link href="/contact" className="font-semibold text-[#0B1F3A] underline decoration-[#FF7A1A] decoration-2 underline-offset-4 hover:text-[#C2410C]">contact page</Link>.</p>
          </Prose>
        </div>
      </Container>
    </SiteShell>
  );
}
