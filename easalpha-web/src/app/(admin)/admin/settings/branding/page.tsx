"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, ExternalLink, Globe, ImageIcon, MessageCircle, MonitorSmartphone, Palette, QrCode, Receipt as ReceiptIcon, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Business, WebsiteConfig } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page";
import { useAction } from "@/components/admin/crud";
import { useSettings } from "@/components/admin/settings-screen";
import { ImageUpload } from "@/components/admin/image-upload";
import { BrandImage } from "@/components/admin/brand-image";
import { readableOn } from "@/components/admin/marketing-helpers";
import {
  brandingFor, DEFAULT_THEME, effectiveLogo, EMPTY_RECEIPT_DRAFT, flattenSettings, identityDraftFrom, identityPatch, type IdentityDraft, normalizeHex, type ReceiptDraft,
  receiptDraftFrom, receiptValuesPatch, sampleReceipt, siteTitle, THEME_PRESETS,
} from "@/components/admin/branding-helpers";
import { ReceiptView } from "@/components/pos/receipt";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Loading, Select, Switch, Textarea } from "@/components/ui";
import { WhatsAppCard } from "@/components/admin/branding-whatsapp";
import { useAuthStore } from "@/store/auth";

// Branding: every place the brand shows, edited in one screen with live previews. Three saves, three API calls:
//   Logo             -> PATCH /business        { logo_key }
//   Receipt branding -> PATCH /settings        { values: { "pos.receipt.*": ..., "store.secondary_phone": ... } }  (changed keys only)
//   Website identity -> PATCH /website_config  { sections: { identity: { ...changed keys } } }
// Each card shows an "Unsaved changes" badge and enables Save only while it is dirty.

function UnsavedBadge({ dirty }: { dirty: boolean }) {
  return dirty ? <Badge variant="warning">Unsaved changes</Badge> : null;
}

export default function BrandingPage() {
  const business = useQuery({ queryKey: ["business"], queryFn: () => api<Business>("/business") });
  const settings = useSettings();
  const site = useQuery({ queryKey: ["website_config"], queryFn: () => api<WebsiteConfig>("/website_config") });
  const qc = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);

  // ---- Logo (business) ----
  const serverLogo = business.data?.logo_key ?? null;
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => { setLogo(serverLogo); }, [serverLogo]);
  const logoDirty = business.data !== undefined && (logo ?? null) !== serverLogo;
  const saveLogo = useAction<string | null, Business>(["business", "me", "website_config"], (logo_key) => api<Business>("/business", { method: "PATCH", body: { logo_key } }), "Logo saved");
  const onSaveLogo = () => saveLogo.mutate(logo, {
    onSuccess: (biz) => { if (session) setSession({ ...session, business: biz }); qc.invalidateQueries({ queryKey: ["storefront"] }); },
  });

  // ---- Receipt branding (settings store) ----
  const receiptOriginal = useMemo(() => (settings.data ? receiptDraftFrom(flattenSettings(settings.data)) : EMPTY_RECEIPT_DRAFT), [settings.data]);
  const [receipt, setReceipt] = useState<ReceiptDraft>(EMPTY_RECEIPT_DRAFT);
  const receiptSignature = JSON.stringify(receiptOriginal);
  useEffect(() => { setReceipt(receiptOriginal); }, [receiptSignature]); // eslint-disable-line react-hooks/exhaustive-deps
  const receiptChanges = useMemo(() => receiptValuesPatch(receiptOriginal, receipt), [receiptOriginal, receipt]);
  const receiptDirty = Object.keys(receiptChanges).length > 0;
  const saveReceipt = useAction<Record<string, unknown>, { version: number }>(["settings"], (values) => api("/settings", { method: "PATCH", body: { values } }), "Receipt branding saved");
  const setR = <K extends keyof ReceiptDraft>(k: K, v: ReceiptDraft[K]) => setReceipt((d) => ({ ...d, [k]: v }));

  // ---- Website identity (Website Config) ----
  const identityOriginal = useMemo(() => identityDraftFrom(site.data?.sections), [site.data]);
  const [identity, setIdentity] = useState<IdentityDraft>(identityOriginal);
  const identitySignature = JSON.stringify(identityOriginal);
  useEffect(() => { setIdentity(identityOriginal); }, [identitySignature]); // eslint-disable-line react-hooks/exhaustive-deps
  const identityChanges = useMemo(() => identityPatch(site.data?.sections, identity), [site.data, identity]);
  const identityDirty = identityChanges !== null;
  const saveIdentity = useAction<Record<string, string | null>, WebsiteConfig>(["website_config"], (values) => api("/website_config", { method: "PATCH", body: { sections: { identity: values } } }), "Website identity saved");
  const setI = <K extends keyof IdentityDraft>(k: K, v: IdentityDraft[K]) => setIdentity((d) => ({ ...d, [k]: v }));

  // ---- Previews ----
  const biz = business.data ?? session?.business ?? null;
  const branch = session?.branch ?? null;
  // The Logo card's current pick (saved or not) is what the receipt shows, so the two cards agree.
  const sample = useMemo(() => sampleReceipt({ name: biz?.name ?? "Your business", legal_name: biz?.legal_name, phone: biz?.phone, logo_key: logo, currency: biz?.currency }, receipt, branch), [biz, logo, receipt, branch]);
  const theme = normalizeHex(identity.theme_color) ?? DEFAULT_THEME;
  const onTheme = readableOn(theme);
  const storeLogo = effectiveLogo(identity.logo_key, logo);
  const storeName = siteTitle(identity.name, biz?.name);
  const slug = site.data?.slug ?? biz?.slug ?? null;
  const storefrontHref = slug ? `/store/${slug}` : null;

  if (business.isLoading || settings.isLoading || site.isLoading) return <Loading />;
  return (
    <>
      <PageHeader icon={Palette} title="Branding" description="Your logo, receipt header and footer, WhatsApp number, and the storefront's colour, cover and favicon. Each card saves on its own; previews update as you type."
        actions={storefrontHref && site.data?.published ? <a href={storefrontHref} target="_blank" rel="noreferrer"><Button variant="secondary"><ExternalLink className="h-4 w-4" /> View storefront</Button></a> : null} />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* a. Logo */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2"><CardTitle>Logo</CardTitle><UnsavedBadge dirty={logoDirty} /></div>
            <Button size="sm" onClick={onSaveLogo} loading={saveLogo.isPending} disabled={!logoDirty}>Save</Button>
          </CardHeader>
          <CardBody className="space-y-4">
            <ImageUpload label="Business logo" kind="logo" value={logo} onChange={setLogo} hint="PNG with a transparent background prints best. Shown on receipts, the till, the storefront and WhatsApp images." />
            <div className="grid grid-cols-3 gap-3 text-center text-xs text-fg-muted">
              <div><BrandImage src={logo} kind="logo" className="mx-auto mb-1 h-16 w-16 rounded-lg border" /><span>Till and QR page</span></div>
              <div><BrandImage src={logo} kind="logo" surface="white" className="mx-auto mb-1 h-16 w-16 rounded-lg border" /><span>Receipt (white paper)</span></div>
              <div><BrandImage src={logo} kind="logo" surface="none" imgClassName="p-1" className="mx-auto mb-1 h-16 w-16 rounded-full border-2 border-white/40 bg-white shadow-[0_0_0_1px_var(--border)]" /><span>Storefront header</span></div>
            </div>
          </CardBody>
        </Card>

        {/* d. Where your branding shows */}
        <Card>
          <CardHeader><CardTitle>Where your branding shows</CardTitle></CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y text-sm">
              {[
                { icon: ReceiptIcon, title: "Printed receipt", text: "Logo (when Show logo is on), header, footer, both phone numbers and the footer QR.", href: "/admin/settings/point-of-sale", link: "Point of Sale" },
                { icon: MonitorSmartphone, title: "Till and kitchen screens", text: "The business name and logo on paired devices; tills pick up a new logo on their next sync.", href: "/admin/settings/devices", link: "Signed-in devices" },
                { icon: Globe, title: "Storefront", text: "Cover, round logo, name, description and theme colour at /store/<slug>; the favicon in the browser tab.", href: "/admin/settings/website", link: "Website Config" },
                { icon: QrCode, title: "QR ordering page", text: "The business logo and name at the top of the guest menu after a table-card scan.", href: "/admin/settings/qr", link: "QR ordering" },
                { icon: MessageCircle, title: "WhatsApp receipt image", text: "The store logo on receipt and statement images (Print the store logo on images).", href: "/admin/settings/whatsapp", link: "WhatsApp" },
              ].map(({ icon: Icon, title, text, href, link }) => (
                <li key={title} className="flex items-start gap-3 px-5 py-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-ink"><Icon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-heading">{title}</div>
                    <p className="text-fg-secondary">{text}</p>
                  </div>
                  <Link href={href} className="shrink-0 text-xs font-medium text-primary hover:underline">{link}</Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        {/* b. Receipt branding + live preview */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2"><CardTitle>Receipt branding</CardTitle><UnsavedBadge dirty={receiptDirty} /></div>
            <Button size="sm" onClick={() => saveReceipt.mutate(receiptChanges)} loading={saveReceipt.isPending} disabled={!receiptDirty}>Save</Button>
          </CardHeader>
          <CardBody className="grid gap-6 lg:grid-cols-[1fr_auto]">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Header text" hint="Printed under the address, before the order. Use new lines for several lines." className="sm:col-span-2"><Textarea value={receipt.header} onChange={(e) => setR("header", e.target.value)} rows={2} placeholder="Thank you for dining with us" /></Field>
              <Field label="Footer text" hint="Printed in bold at the bottom, above the QR." className="sm:col-span-2"><Textarea value={receipt.footer} onChange={(e) => setR("footer", e.target.value)} rows={2} placeholder="Follow us @yourrestaurant" /></Field>
              <div className="sm:col-span-2 flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
                <Switch checked={receipt.show_logo} onChange={(v) => setR("show_logo", v)} label="Print the logo at the top" />
                {!logo ? <span className="text-xs text-fg-muted">No logo uploaded yet</span> : null}
              </div>
              <Field label="Footer QR link" hint="Scan for our menu and reviews. Leave blank for no QR."><Input type="url" value={receipt.footer_qr_url} onChange={(e) => setR("footer_qr_url", e.target.value)} placeholder={storefrontHref ? `https://yourdomain${storefrontHref}` : "https://"} /></Field>
              <Field label="Secondary phone" hint="Printed next to the primary number"><Input type="tel" value={receipt.secondary_phone} onChange={(e) => setR("secondary_phone", e.target.value)} placeholder="+92" /></Field>
              <Field label="Paper width"><Select value={receipt.paper} onChange={(e) => setR("paper", e.target.value === "58" ? "58" : "80")}><option value="80">80 mm (48 chars)</option><option value="58">58 mm (32 chars)</option></Select></Field>
              <Field label="Language"><Select value={receipt.language} onChange={(e) => setR("language", e.target.value === "ur" ? "ur" : "en")}><option value="en">English</option><option value="ur">Urdu</option></Select></Field>
              <p className="text-xs text-fg-muted sm:col-span-2">Keys: pos.receipt.header, pos.receipt.footer, pos.receipt.show_logo, pos.receipt.footer_qr_url, pos.receipt.paper, pos.receipt.language, store.secondary_phone. Tills re-sync when the settings version changes.</p>
            </div>
            <div className="lg:w-[340px]">
              <div className="mb-2 flex items-center justify-between text-xs text-fg-muted"><span>Live preview</span><span>{receipt.paper} mm · sample order</span></div>
              <div className="overflow-x-auto rounded-xl bg-muted p-4">
                <div className="mx-auto w-fit shadow-[var(--shadow-pop)]"><ReceiptView r={sample} branding={brandingFor(receipt)} /></div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* c. Website identity + storefront header preview + browser tab */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2"><CardTitle>Website identity</CardTitle><UnsavedBadge dirty={identityDirty} /></div>
            <Button size="sm" onClick={() => identityChanges && saveIdentity.mutate(identityChanges)} loading={saveIdentity.isPending} disabled={!identityDirty}>Save</Button>
          </CardHeader>
          <CardBody className="grid gap-6 lg:grid-cols-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Site name" hint={`Blank uses the business name (${biz?.name ?? "..."})`}><Input value={identity.name} onChange={(e) => setI("name", e.target.value)} placeholder={biz?.name ?? ""} /></Field>
              <Field label="Theme colour" hint="Header, buttons and category titles on the storefront">
                <div className="flex flex-wrap items-center gap-2">
                  <input type="color" aria-label="Theme colour" value={theme} onChange={(e) => setI("theme_color", e.target.value)} className="h-10 w-12 cursor-pointer rounded-[4px] border border-border-strong bg-transparent p-1" />
                  <Input className="w-28 font-mono" value={identity.theme_color} onChange={(e) => setI("theme_color", e.target.value)} placeholder={DEFAULT_THEME} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {THEME_PRESETS.map((c) => <button key={c} type="button" aria-label={`Preset ${c}`} onClick={() => setI("theme_color", c)} className={cn("h-7 w-7 rounded-full border-2", theme === c ? "border-fg" : "border-transparent")} style={{ backgroundColor: c }} />)}
                </div>
              </Field>
              <Field label="Description" hint="One line under the name in the header, and the About section" className="sm:col-span-2"><Textarea value={identity.description} onChange={(e) => setI("description", e.target.value)} rows={2} placeholder="Family dining since 1998" /></Field>
              <ImageUpload label="Website logo" kind="logo" value={identity.logo_key || null} onChange={(k) => setI("logo_key", k ?? "")} hint={identity.logo_key ? "Shown in the storefront header instead of the business logo" : logo ? "Blank: the storefront uses the business logo above" : "Blank: the storefront uses the business logo, or the first letter of the name"} />
              <ImageUpload label="Favicon" kind="favicon" value={identity.favicon_key || null} onChange={(k) => setI("favicon_key", k ?? "")} hint="Square PNG, 32 to 512 px. Shown in the browser tab at 16 px." />
              <ImageUpload label="Cover image" kind="cover" value={identity.cover_key || null} onChange={(k) => setI("cover_key", k ?? "")} hint="Wide photo across the top of the storefront, 1600 x 600 px or similar" className="sm:col-span-2" />
              <p className="text-xs text-fg-muted sm:col-span-2">Saves the identity section of Website Config only. Slug, pages and the rest are under <Link href="/admin/settings/website" className="font-medium text-primary">Website Config</Link>.</p>
            </div>
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs text-fg-muted">Browser tab</div>
                <div className="overflow-hidden rounded-xl border bg-[#dee1e6] text-[#202124]">
                  <div className="flex items-end gap-1 px-2 pt-2">
                    <div className="flex min-w-0 max-w-[240px] items-center gap-2 rounded-t-lg bg-white px-3 py-2 text-xs">
                      <BrandImage src={identity.favicon_key || null} kind="favicon" placeholder={Globe} surface="none" className="h-4 w-4 rounded-sm" />
                      <span className="truncate" title={storeName}>{storeName}</span>
                      <X className="ml-auto h-3 w-3 shrink-0 opacity-60" />
                    </div>
                    <span className="mb-1 ml-1 text-base leading-none opacity-60">+</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white px-3 py-2">
                    <div className="flex-1 truncate rounded-full bg-[#f1f3f4] px-3 py-1 font-mono text-[11px] text-fg-secondary">{storefrontHref ? `easalpha.com${storefrontHref}` : "easalpha.com/store/your-slug"}</div>
                  </div>
                </div>
                {!identity.favicon_key ? <p className="mt-1 text-xs text-fg-muted">No favicon yet: visitors see the EasAlpha icon.</p> : null}
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-xs text-fg-muted"><span>Storefront header</span>{storeLogo.fallback ? <span>Using the business logo</span> : null}</div>
                <div className="overflow-hidden rounded-xl border" style={{ backgroundColor: theme, color: onTheme }}>
                  {identity.cover_key ? <BrandImage src={identity.cover_key} kind="cover" className="h-28 w-full" /> : null}
                  <div className="flex items-center gap-4 px-4 py-5">
                    {storeLogo.src ? (
                      <BrandImage src={storeLogo.src} kind="logo" surface="none" imgClassName="p-1" className="h-16 w-16 rounded-full border-2 border-white/40 bg-white" />
                    ) : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white/20 text-2xl font-bold">{storeName.charAt(0)}</span>}
                    <div className="min-w-0">
                      <div className="truncate text-2xl font-medium leading-8">{storeName}</div>
                      {identity.description.trim() ? <p className="mt-0.5 text-sm opacity-90">{identity.description.trim()}</p> : null}
                      <p className="mt-1 flex items-center gap-1 text-xs opacity-80"><Clock className="h-3.5 w-3.5" /> Open today 11:00 to 23:00</p>
                    </div>
                  </div>
                  <nav className="flex gap-4 px-4 pb-3 text-sm font-medium"><span>Menu</span><span>Contact</span><span>Reviews</span></nav>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-fg-muted">
                  <span className="inline-flex h-7 items-center rounded-full px-3 font-semibold" style={{ backgroundColor: theme, color: onTheme }}>Button on theme</span>
                  <span>Text turns {onTheme === "#ffffff" ? "white" : "dark"} automatically on this colour.</span>
                </div>
              </div>
              {!storeLogo.src && !identity.cover_key && !identity.favicon_key ? (
                <p className="flex items-start gap-2 rounded-xl bg-muted px-4 py-3 text-xs text-fg-secondary"><ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" /> No images yet. Upload a logo above and the storefront, receipt and tab previews fill in as you go.</p>
              ) : null}
              <p className="text-xs text-fg-muted">The logo picked in the Logo card (saved or not) already shows here and on the receipt preview; save it there so tills and the storefront get it too.</p>
              {storefrontHref ? <p className="text-xs text-fg-muted">Storefront: <a className="font-medium text-primary hover:underline" href={storefrontHref} target="_blank" rel="noreferrer">{storefrontHref}</a>{site.data?.published ? "" : " (unpublished; turn on Published under Website Config)"}</p> : null}
            </div>
          </CardBody>
        </Card>

        {/* e. WhatsApp: receipt line and storefront button */}
        <WhatsAppCard business={business.data} sections={site.data?.sections} />
      </div>
    </>
  );
}
