import { SiteHeader } from "./header";
import { SiteFooter } from "./footer";
import { WhatsAppFab } from "./whatsapp-fab";
import { getSiteContact } from "./platform-server";
import { Analytics } from "./analytics";
import { RevealObserver } from "./reveal-observer";

/** Public-site wrapper: light theme regardless of the app's dark mode, larger reading type than the admin.
 *  The header is fixed over each page's navy top band, so no top padding here. */
export async function SiteShell({ children }: { children: React.ReactNode }) {
  const contact = await getSiteContact();
  return (
    <div className="flex min-h-screen flex-col bg-white text-[17px] leading-[1.6] tracking-normal text-slate-800 antialiased">
      <a href="#main" className="sr-only z-50 rounded-full bg-white px-5 text-sm font-semibold text-[#0B1F3A] shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:inline-flex focus:min-h-11 focus:items-center">Skip to content</a>
      <SiteHeader />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter contact={contact} />
      <WhatsAppFab contact={contact} />
      <Analytics />
      <RevealObserver />
    </div>
  );
}
