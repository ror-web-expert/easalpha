"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Globe, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import type { WebsiteConfig, WebsiteSections } from "@/lib/types";
import { PageHeader } from "@/components/admin/page";
import { useAction } from "@/components/admin/crud";
import { slugify } from "@/components/admin/marketing-helpers";
import { SectionForm, SectionList } from "@/components/admin/marketing-website";
import { Badge, Button, Card, CardBody, Field, Input, Loading, Switch } from "@/components/ui";

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
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <SectionList sections={sections} value={section} onChange={setSection} dirty={dirtySections} />
        <SectionForm section={section} values={values} onChange={setValue} onSave={onSave} saving={saveSection.isPending} dirty={dirtySections.has(section)} />
      </div>
    </>
  );
}
