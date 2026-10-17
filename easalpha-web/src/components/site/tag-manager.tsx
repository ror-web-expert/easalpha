import Script from "next/script";

/** The Google Tag Manager container for the public website (added 17 Oct 2026). NEXT_PUBLIC_GTM_ID overrides it at build
 *  time; an empty value turns Tag Manager off. Only a well-formed id is ever written into the inline script. */
export const GTM_ID = (process.env.NEXT_PUBLIC_GTM_ID ?? "GTM-MQ8PKZS2").trim();

export function validGtmId(id: string): boolean {
  return /^GTM-[A-Z0-9]{4,12}$/.test(id);
}

/** Google's two snippets: the loader (after the page is interactive, so it never delays the first paint) and the
 *  no-JavaScript iframe. Rendered by the public site's shell and the sign-up page only: the admin, the till, the
 *  kitchen and rider screens and restaurants' own store pages never load it, because a tag manager can run any script
 *  and those screens hold sign-in tokens and customers' details. The site's own events reach it through the dataLayer
 *  (lib/analytics.ts track). */
export function TagManager({ id = GTM_ID }: { id?: string }) {
  if (!validGtmId(id)) return null;
  return (
    <>
      <Script id="google-tag-manager" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');`}
      </Script>
      <noscript>
        <iframe src={`https://www.googletagmanager.com/ns.html?id=${id}`} height="0" width="0" style={{ display: "none", visibility: "hidden" }} title="Google Tag Manager" />
      </noscript>
    </>
  );
}
