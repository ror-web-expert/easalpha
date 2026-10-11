import { MessageCircle } from "lucide-react";
import { whatsappLink } from "./site-helpers";

/** Floating "Need help?" WhatsApp button, bottom-right on every public page. */
export function WhatsAppFab() {
  return (
    <a href={whatsappLink("Hello Servio, I need some help.")} target="_blank" rel="noopener noreferrer" className="fixed bottom-4 right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-[#128C7E] pl-3 pr-4 text-sm font-semibold text-white shadow-[0_12px_30px_-10px_rgba(0,0,0,0.5)] transition hover:bg-[#0e7366] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#128C7E] sm:bottom-6 sm:right-6">
      <MessageCircle className="h-5 w-5" />
      <span>Need help?</span>
    </a>
  );
}
