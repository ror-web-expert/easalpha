import { MessageCircle } from "lucide-react";
import { CONTACT, whatsappLink, type SiteContact } from "./site-helpers";
import { trackAttrs } from "@/lib/analytics";

/** Floating "Need help?" button, bottom-right on every public page: product orange with the same breathing glow as the admin panel; opens WhatsApp. */
export function WhatsAppFab({ contact = CONTACT }: { contact?: SiteContact }) {
  return (
    <a href={whatsappLink(`Hello ${contact.productName}, I need some help.`, contact)} target="_blank" rel="noopener noreferrer" {...trackAttrs("whatsapp_click", { where: "fab" })} className="help-glow fixed bottom-4 right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-brand-cta pl-3 pr-4 text-sm font-semibold text-white transition-colors hover:bg-brand-cta-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cta sm:bottom-6 sm:right-6">
      <MessageCircle className="h-5 w-5" />
      <span>Need help?</span>
    </a>
  );
}
