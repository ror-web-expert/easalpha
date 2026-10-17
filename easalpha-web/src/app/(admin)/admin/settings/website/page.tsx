"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Globe, ExternalLink, Copy, MessageCircle, Smartphone } from "lucide-react";
import { api } from "@/lib/api";
import type { WebsiteConfig, WebsiteSections } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { useAction } from "@/components/admin/crud";
import { slugify } from "@/components/admin/marketing-helpers";
import { SectionForm, SectionList } from "@/components/admin/marketing-website";
import { Badge, Button, Card, CardBody, Field, Input, Loading, Switch } from "@/components/ui";
import { QrCode } from "@/components/qr-code";
import { toast } from "@/store/toast";

// SPEC Website Config: Store Identity, Pages, Menu Slider, Documents, Footer, Availability, Customer Sign-ups, Location,
// Branches, Delivery, Pricing, Contact, Social Media, WhatsApp, Instagram, SEO, Mobile App and System. Each section
// saves on its own (PATCH /website_config merges key by key); slug and Published save from the header.

export default function WebsiteConfigPage() {
  const q = useQuery({ queryKey: ["website_config"], queryFn: () => api<WebsiteConfig>("/website_config") });
  const [section, setSection] = useState("identity");
  const [edits, setEdits] = useState<WebsiteSections>({});
  const [slug, setSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);
  const serverSlug = q.data?.slug ?? "";
  useEffect(() => { if (!slugDirty) setSlug(serverSlug); }, [serverSlug, slugDirty]);
  const sections = q.data?.section_names ?? Object.keys(q.data?.sections ?? {});
  const saveSection = useAction<{ section: string; values: Record<string, unknown> }, WebsiteConfig>(["website_config"], ({ section: s, values }) => api("/website_config", { method: "PATCH", body: { sections: { [s]: values } } }), "Section saved");
  const saveHeader = useAction<{ slug?: string; published?: boolean }, WebsiteConfig>(["website_config"], (body) => api("/website_config", { method: "PATCH", body: { ...body, sections: {} } }), "Saved");
  const serverValues = useMemo(() => q.data?.sections[section] ?? {}, [q.data, section]);
  const values = useMemo(() => ({ ...serverValues, ...(edits[section] ?? {}) }), [serverValues, edits, section]);
  const dirtySections = useMemo(() => new Set(Object.keys(edits).filter((s) => Object.keys(edits[s]).some((k) => JSON.stringify(edits[s][k]) !== JSON.stringify(q.data?.sections[s]?.[k])))), [edits, q.data]);
  const setValue = (key: string, v: unknown) => setEdits((e) => ({ ...e, [section]: { ...(e[section] ?? {}), [key]: v } }));
  const onSave = () => {
    const changed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(edits[section] ?? {})) if (JSON.stringify(v) !== JSON.stringify(serverValues[k])) changed[k] = v;
    saveSection.mutate({ section, values: changed }, { onSuccess: () => setEdits((e) => { const n = { ...e }; delete n[section]; return n; }) });
  };
  const published = q.data?.published === true;
  if (q.isLoading || !q.data) return <Loading />;
  return (
    <>
      <PageHeader icon={Globe} title="Website Config" description="The storefront builder: one screen per section. Save each section as you go; Published controls whether the site answers at all." actions={<>
        {slug ? <a href={`/store/${slug}`} target="_blank" rel="noreferrer"><Button variant="secondary"><ExternalLink className="h-4 w-4" /> View storefront</Button></a> : null}
      </>} />
      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-4">
          <Field label="URL slug" hint={slug ? `The site answers at /store/${slug}` : "Lowercase letters, digits and hyphens"} className="w-full sm:w-80">
            <div className="flex gap-2">
              <Input className="font-mono" value={slug} onChange={(e) => { setSlug(slugify(e.target.value)); setSlugDirty(true); }} placeholder="my-restaurant" />
              <Button variant="secondary" disabled={!slugDirty || slug === serverSlug || !slug} loading={saveHeader.isPending} onClick={() => saveHeader.mutate({ slug }, { onSuccess: () => setSlugDirty(false) })}>Save slug</Button>
            </div>
          </Field>
          <div className="flex items-center gap-3 pb-1">
            <Switch checked={published} onChange={(v) => saveHeader.mutate({ published: v })} label={published ? "Published" : "Unpublished"} disabled={saveHeader.isPending} />
            {published ? <Badge variant="success">live</Badge> : <Badge variant="warning">visitors see a 404</Badge>}
          </div>
        </CardBody>
      </Card>
      {published && serverSlug ? <CustomerAppCard slug={serverSlug} name={String(q.data.sections.identity?.name ?? "") || "your restaurant"} /> : null}
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <SectionList sections={sections} value={section} onChange={setSection} dirty={dirtySections} />
        <SectionForm section={section} values={values} onChange={setValue} onSave={onSave} saving={saveSection.isPending} dirty={dirtySections.has(section)} />
      </div>
    </>
  );
}

/** The storefront is also the restaurant's own customer app: customers open the link or scan the QR and tap Install,
 *  and the restaurant's name, logo and colour go on their home screen. No app store, nothing to pay. */
function CustomerAppCard({ slug, name }: { slug: string; name: string }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const url = origin ? `${origin}/store/${slug}` : `/store/${slug}`;
  const share = `https://wa.me/?text=${encodeURIComponent(`Order from ${name} online and install our app: ${url}`)}`;
  return (
    <Card className="mb-4">
      <CardBody className="flex flex-col gap-5 md:flex-row md:items-center">
        <QrCode value={url} size={152} label={`QR code for ${url}`} download={`${slug}-customer-app`} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-primary" /><h2 className="text-base font-semibold">Your customer app</h2><Badge variant="success">free</Badge></div>
          <p className="text-sm text-fg-secondary">Your website is also your app. Customers open this link or scan the QR, then tap Install (Android) or Share, Add to Home Screen (iPhone). Your name, logo and colour go on their home screen, and it opens straight to your menu. Print the QR on tables, bags and flyers.</p>
          <div className="flex flex-wrap gap-2">
            <Input readOnly value={url} className="w-full font-mono sm:w-96" onFocus={(e) => e.currentTarget.select()} aria-label="Customer app link" />
            <Button variant="secondary" onClick={() => { void navigator.clipboard?.writeText(url).then(() => toast.success("Link copied")); }}><Copy className="h-4 w-4" /> Copy</Button>
            <a href={share} target="_blank" rel="noreferrer"><Button variant="secondary"><MessageCircle className="h-4 w-4" /> Share on WhatsApp</Button></a>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
