import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site/shell";
import { Container, HeroStack, PageHero, Prose } from "@/components/site/sections";
import { FileText, Lock, ShieldCheck } from "lucide-react";
import { CONTACT, TRIAL_DAYS } from "@/components/site/site-helpers";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms for using EasAlpha: your account, the 90-day trial and billing, availability, what we ask of you, and how either side can end the agreement.",
  alternates: { canonical: "/terms", languages: { en: "/terms", "x-default": "/terms" } },
};

export default function TermsPage() {
  return (
    <SiteShell>
      <PageHero eyebrow="Terms of service" title="Plain terms for using EasAlpha" visual={<HeroStack chips={[{ icon: FileText, title: "Plain terms", text: "written to be read" }, { icon: ShieldCheck, title: "Fair to both sides", text: "no surprises" }, { icon: Lock, title: "Your account, your data", text: "export or delete any time" }]} />}><p className="mt-4 text-sm text-white/60">Last updated 11 October 2026</p></PageHero>
      <Container className="max-w-3xl py-16 sm:py-20">
        <div>
          <Prose>
            <p>These terms are the agreement between you (the business that opens a EasAlpha account) and EasAlpha. By creating an account you accept them. We have kept them short and in ordinary language; where they are silent, the law of Pakistan applies.</p>
            <h2>Your account</h2>
            <ul>
              <li>You must be authorised to act for the restaurant you register and give accurate contact details.</li>
              <li>You are responsible for the people you add and the permissions you grant them. Keep PINs and passwords private and remove staff who leave.</li>
              <li>You own the data in your account. You grant us only the rights needed to store, process, back up and display it so the service works.</li>
            </ul>
            <h2>Trial and billing</h2>
            <ul>
              <li>New accounts get a {TRIAL_DAYS}-day free trial of the chosen plan with no card required.</li>
              <li>After the trial, the service continues only on a paid plan. Plans are billed monthly or yearly in advance in Pakistani rupees (or US dollars outside Pakistan), by JazzCash, EasyPaisa, bank transfer or card. Yearly billing is ten months&apos; price.</li>
              <li>If a payment is missed, the account enters a grace period, then becomes read-only: you can still log in and export your data. We do not delete an account for non-payment without notice.</li>
              <li>You can cancel at any time from the Plan screen or by writing to us. Paid periods run to their end and are not refunded, except where the law requires or where we have failed to provide the service.</li>
              <li>We may change prices with at least 30 days&apos; notice; a change applies from your next renewal.</li>
            </ul>
            <h2>What we provide</h2>
            <ul>
              <li>The hosted service, the till, tablet, kitchen, rider and storefront apps, and support by WhatsApp and email during the hours published on the <Link href="/contact" className="py-3 font-semibold text-[#0B1F3A] underline decoration-[#FF7A1A] decoration-2 underline-offset-4 hover:text-[#C2410C]">contact page</Link>.</li>
              <li>We work to keep the service available at all times and to fix faults quickly. The till is designed to keep selling while offline. We do not guarantee uninterrupted availability, and we are not liable for losses caused by internet, power or hardware outside our control.</li>
              <li>We back up your data regularly and may update the software at any time. Features may be improved or replaced; we will not remove something you rely on without telling you first.</li>
            </ul>
            <h2>What we ask of you</h2>
            <ul>
              <li>Use the service lawfully, including tax rules that apply to your sales and the rules for messaging your customers (opt-in for marketing, honouring STOP).</li>
              <li>Do not attempt to access other customers&apos; data, interfere with the service or resell it without our agreement.</li>
              <li>Keep your receipt printer, devices and internet connection working; we help with setup but cannot operate your hardware for you.</li>
            </ul>
            <h2>Tax, accounting and payroll figures</h2>
            <p>EasAlpha calculates tax, accounts and payroll from the rules and data you enter. You remain responsible for checking and filing them with FBR, PRA or other authorities. We correct any calculation error you report, but we are not your accountant or tax adviser.</p>
            <h2>Liability</h2>
            <p>To the extent the law allows, our total liability to you for any claim in a year is limited to the fees you paid us in the twelve months before the claim. We are not liable for indirect losses such as lost profit. Nothing in these terms removes rights the law gives you that cannot be excluded.</p>
            <h2>Ending the agreement</h2>
            <p>You can close your account at any time and export your data first. We can suspend or close an account that breaks these terms or does not pay, after telling you and giving you a reasonable chance to put it right. Where we close an account we give you time to export your data.</p>
            <h2>Changes and contact</h2>
            <p>If we change these terms in a way that matters, we tell account owners by email before the change takes effect. Questions go to <a href={`mailto:${CONTACT.email}`} className="py-3 font-semibold text-[#0B1F3A] underline decoration-[#FF7A1A] decoration-2 underline-offset-4 hover:text-[#C2410C]">{CONTACT.email}</a>.</p>
          </Prose>
        </div>
      </Container>
    </SiteShell>
  );
}
