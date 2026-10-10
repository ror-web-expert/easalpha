"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { listToText, textToList, websiteFieldLabel, websiteFieldType, websiteSectionLabel } from "@/components/admin/marketing-helpers";
import { ImageUpload } from "@/components/admin/image-upload";
import { Button, Card, CardBody, CardHeader, CardTitle, Field, Input, MoneyInput, Switch, Textarea } from "@/components/ui";

// SPEC Website Config: a full site builder with one screen per section. Each section is a flat key/value hash on the
// API; the control for a key is decided by websiteFieldType so a new key on the API shows up without a screen change.

const THEME_PRESETS = ["#1976d2", "#005bbf", "#2e7d32", "#c62828", "#ef6c00", "#6a1b9a", "#00838f", "#191c23"];

const SECTION_HINTS: Record<string, string> = {
  identity: "Name, URL slug, description, theme colour, logo, cover image and favicon. These shape every page.",
  pages: "Which pages the site shows.",
  menu_slider: "Images that rotate at the top of the menu page, one per line.",
  documents: "Terms, privacy and refund text shown in the footer.",
  footer: "Footer text and links. A link is a JSON line like {\"label\": \"Menu\", \"url\": \"/menu\"}.",
  availability: "Whether online ordering is on, what to say when closed, and whether to accept orders outside business hours.",
  signups: "Customer sign-ups from the website; approval holds them as Pending until an admin approves.",
  location: "Address and map pin.",
  branches: "Show a branch picker when more than one outlet is linked.",
  delivery: "Delivery switch, minimum order, free-delivery threshold and the quoted ETA.",
  pricing: "Show prices, and whether order types have their own prices.",
  contact: "Phone, email and WhatsApp shown on the Contact page.",
  social: "Profile links. Leave blank to hide.",
  whatsapp: "The floating WhatsApp button and its greeting.",
  instagram: "Instagram handle and whether to show the feed.",
  seo: "Title, description and keywords for search engines.",
  mobile_app: "App store links and the banner inviting customers to install.",
  system: "Maintenance mode and analytics.",
};

export function sectionHint(section: string): string | undefined { return SECTION_HINTS[section]; }

export function SectionList({ sections, value, onChange, dirty }: { sections: string[]; value: string; onChange: (s: string) => void; dirty: Set<string> }) {
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Website sections">
      {sections.map((s) => (
        <button key={s} type="button" onClick={() => onChange(s)}
          className={cn("flex shrink-0 items-center justify-between gap-2 whitespace-nowrap rounded-full px-4 py-2 text-left text-sm font-medium tracking-[0.1px] transition-colors lg:w-full", value === s ? "bg-sidebar-active-bg text-sidebar-active" : "text-fg-secondary hover:bg-fg/8")}>
          {websiteSectionLabel(s)}
          {dirty.has(s) ? <span className="h-2 w-2 rounded-full bg-warning" aria-label="Unsaved changes" /> : null}
        </button>
      ))}
    </nav>
  );
}

export function SectionForm({ section, values, onChange, onSave, saving, dirty }: { section: string; values: Record<string, unknown>; onChange: (key: string, v: unknown) => void; onSave: () => void; saving?: boolean; dirty: boolean }) {
  const keys = Object.keys(values);
  return (
    <Card>
      <CardHeader>
        <div><CardTitle>{websiteSectionLabel(section)}</CardTitle>{sectionHint(section) ? <p className="mt-0.5 text-xs text-fg-secondary">{sectionHint(section)}</p> : null}</div>
        <Button size="sm" onClick={onSave} loading={saving} disabled={!dirty}>Save</Button>
      </CardHeader>
      <CardBody className="grid gap-4 sm:grid-cols-2">
        {keys.length ? keys.map((k) => <SectionField key={k} section={section} name={k} value={values[k]} onChange={(v) => onChange(k, v)} />) : <p className="text-sm text-fg-muted sm:col-span-2">This section has no settings yet.</p>}
      </CardBody>
    </Card>
  );
}

function KeyName({ k }: { k: string }) { return <p className="mt-1 font-mono text-[11px] text-fg-muted">{k}</p>; }

function SectionField({ section, name, value, onChange }: { section: string; name: string; value: unknown; onChange: (v: unknown) => void }) {
  const type = websiteFieldType(section, name, value);
  const label = websiteFieldLabel(name);
  const str = value === null || value === undefined ? "" : String(value);
  switch (type) {
    case "switch":
      return <div><Switch checked={value === true} onChange={onChange} label={label} /><KeyName k={name} /></div>;
    case "money":
      return <div><Field label={label} hint={name === "free_above_minor" ? "Blank = never free" : undefined}><MoneyInput value={typeof value === "number" ? value : 0} onChange={(v) => onChange(v === 0 && name !== "min_order_minor" ? null : v)} /></Field><KeyName k={name} /></div>;
    case "number":
      return <div><Field label={label}><Input type="number" step="any" className="tabular" value={str} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} /></Field><KeyName k={name} /></div>;
    case "color":
      return (
        <div className="sm:col-span-2">
          <Field label={label}>
            <div className="flex flex-wrap items-center gap-2">
              <input type="color" aria-label={label} value={/^#[0-9a-f]{6}$/i.test(str) ? str : "#1976d2"} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 cursor-pointer rounded-[4px] border border-border-strong bg-transparent p-1" />
              <Input className="w-32 font-mono" value={str} onChange={(e) => onChange(e.target.value)} placeholder="#1976d2" />
              <div className="flex flex-wrap gap-1.5">
                {THEME_PRESETS.map((c) => <button key={c} type="button" aria-label={`Preset ${c}`} onClick={() => onChange(c)} className={cn("h-7 w-7 rounded-full border-2", str.toLowerCase() === c ? "border-fg" : "border-transparent")} style={{ backgroundColor: c }} />)}
              </div>
            </div>
          </Field>
          <KeyName k={name} />
        </div>
      );
    case "image":
      return <div><ImageUpload label={label} value={str || null} onChange={(k) => onChange(k)} /><KeyName k={name} /></div>;
    case "list":
      return <ListField name={name} label={label} value={value} onChange={onChange} />;
    case "textarea":
      return <div className="sm:col-span-2"><Field label={label}><Textarea value={str} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} /></Field><KeyName k={name} /></div>;
    case "url":
      return <div><Field label={label}><Input type="url" value={str} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} placeholder="https://" /></Field><KeyName k={name} /></div>;
    case "email":
      return <div><Field label={label}><Input type="email" value={str} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} /></Field><KeyName k={name} /></div>;
    case "phone":
      return <div><Field label={label}><Input type="tel" value={str} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} placeholder="+92" /></Field><KeyName k={name} /></div>;
    default:
      return <div><Field label={label}><Input value={str} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} /></Field><KeyName k={name} /></div>;
  }
}

/** Lists are edited as text, one item per line; the list value is rebuilt on blur so typing does not reorder items. */
function ListField({ name, label, value, onChange }: { name: string; label: string; value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(listToText(value));
  const signature = listToText(value);
  useEffect(() => { setText(signature); }, [signature]);
  return (
    <div className="sm:col-span-2">
      <Field label={label} hint="One item per line">
        <Textarea className="font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => onChange(textToList(text))} spellCheck={false} />
      </Field>
      <KeyName k={name} />
    </div>
  );
}
