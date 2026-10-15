import type { Metadata } from "next";
import { pageMetadata } from "@/components/site/seo";
import { Mail, MapPin, MessageCircle, Clock } from "lucide-react";
import { SiteShell } from "@/components/site/shell";
import { CARD, Container, HeroStack, PageHero, TILE_NAVY, TILE_ORANGE } from "@/components/site/sections";
import { ContactForm } from "@/components/site/contact-form";
import { whatsappLink } from "@/components/site/site-helpers";
import { getSiteContact } from "@/components/site/platform-server";
import { trackAttrs } from "@/lib/analytics";
import { JsonLd } from "@/components/site/json-ld";
import { breadcrumbs, localBusiness } from "@/lib/schema";

export const metadata: Metadata = pageMetadata({ title: "Contact us: WhatsApp, email or book a demo", description: "Talk to a person on WhatsApp or email, seven days a week during restaurant hours. Book a demo, ask about plans or get help moving from your current POS.", path: "/contact" });

export default async function ContactPage() {
  const contact = await getSiteContact();
  return (
    <SiteShell>
      <JsonLd data={[breadcrumbs("Contact", "/contact"), localBusiness(contact)]} />
      <PageHero eyebrow="Contact" title="Talk to a person" text="WhatsApp is fastest. We answer in English and Urdu, seven days a week during restaurant hours."
        visual={<HeroStack chips={[{ icon: MessageCircle, title: "WhatsApp", text: contact.whatsappDisplay }, { icon: Mail, title: "Email", text: contact.email }, { icon: Clock, title: "Hours", text: contact.hours }]} />} />
      <Container className="grid gap-12 py-20 lg:grid-cols-[1fr_1.4fr] lg:py-28">
        <div className="min-w-0 space-y-5">
          <a href={whatsappLink(`Hello ${contact.productName}, I run a restaurant and would like to know more.`, contact)} target="_blank" rel="noopener noreferrer" {...trackAttrs("whatsapp_click", { where: "contact" })} className={`flex items-start gap-4 p-5 ${CARD}`}>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#E6F6F3] text-[#128C7E]"><MessageCircle className="h-6 w-6" /></span>
            <div>
              <h2 className="font-bold text-[#0B1F3A]">WhatsApp</h2>
              <p className="mt-1 text-sm text-slate-600">{contact.whatsappDisplay}. Tap to open a chat with a message ready to send.</p>
            </div>
          </a>
          <a href={`mailto:${contact.email}`} className={`flex items-start gap-4 p-5 ${CARD}`}>
            <span className={TILE_ORANGE}><Mail className="h-6 w-6" /></span>
            <div>
              <h2 className="font-bold text-[#0B1F3A]">Email</h2>
              <p className="mt-1 text-sm text-slate-600">{contact.email}. Good for exports, invoices and anything with attachments.</p>
            </div>
          </a>
          <div className={`flex items-start gap-4 p-5 ${CARD}`}>
            <span className={TILE_NAVY}><MapPin className="h-6 w-6" /></span>
            <div>
              <h2 className="font-bold text-[#0B1F3A]">Office</h2>
              <p className="mt-1 text-sm text-slate-600">{contact.address}. Visits by appointment.</p>
            </div>
          </div>
          <div className={`flex items-start gap-4 p-5 ${CARD}`}>
            <span className={TILE_NAVY}><Clock className="h-6 w-6" /></span>
            <div>
              <h2 className="font-bold text-[#0B1F3A]">Hours</h2>
              <p className="mt-1 text-sm text-slate-600">{contact.hours}. Account emergencies outside those hours: WhatsApp us and say it is urgent.</p>
            </div>
          </div>
        </div>
        <div className="min-w-0 rounded-[20px] border border-[#E6EBF2] bg-white p-6 shadow-[0_20px_50px_-30px_rgba(11,31,58,0.45)] sm:p-8">
          <h2 className="text-xl font-bold text-[#0B1F3A]">Send us a message</h2>
          <p className="mt-1 text-sm text-slate-600">Tell us about your restaurant and what you want to fix first.</p>
          <div className="mt-6"><ContactForm contact={contact} /></div>
        </div>
      </Container>
    </SiteShell>
  );
}
