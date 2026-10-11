"use client";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { api } from "@/lib/api";
import type { Business, WebsiteConfig, WebsiteSections } from "@/lib/types";
import { useAuthStore } from "@/store/auth";
import { useAction } from "@/components/admin/crud";
import { waLink, whatsappDraftFrom, whatsappPatch, type WhatsappDraft } from "@/components/admin/branding-helpers";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Switch } from "@/components/ui";

// Branding, WhatsApp card: the business number that prints on every receipt as the WhatsApp line (PATCH /business
// { phone }) and the storefront's floating WhatsApp button (PATCH /website_config { sections: { whatsapp } }).

export function WhatsAppCard({ business, sections }: { business: Business | undefined; sections: WebsiteSections | undefined }) {
  const qc = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);
  const original = useMemo(() => whatsappDraftFrom(business?.phone, sections), [business?.phone, sections]);
  const [draft, setDraft] = useState<WhatsappDraft>(original);
  const signature = JSON.stringify(original);
  useEffect(() => { setDraft(original); }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = useMemo(() => whatsappPatch(original, draft), [original, draft]);
  const dirty = patch.business !== null || patch.section !== null;
  const set = <K extends keyof WhatsappDraft>(k: K, v: WhatsappDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = useAction<typeof patch, Business | null>(["business", "me", "website_config", "storefront"], async (p) => {
    let biz: Business | null = null;
    if (p.business) biz = await api<Business>("/business", { method: "PATCH", body: p.business });
    if (p.section) await api<WebsiteConfig>("/website_config", { method: "PATCH", body: { sections: { whatsapp: p.section } } });
    return biz;
  }, "WhatsApp saved");
  const onSave = () => save.mutate(patch, { onSuccess: (biz) => { if (biz && session) setSession({ ...session, business: biz }); qc.invalidateQueries({ queryKey: ["storefront"] }); } });

  const buttonNumber = draft.number.trim() || draft.phone.trim();
  const link = waLink(buttonNumber, draft.greeting);
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center gap-2"><CardTitle>WhatsApp</CardTitle>{dirty ? <Badge variant="warning">Unsaved changes</Badge> : null}</div>
        <Button size="sm" onClick={onSave} loading={save.isPending} disabled={!dirty}>Save</Button>
      </CardHeader>
      <CardBody className="grid gap-4 lg:grid-cols-[1fr_minmax(260px,1fr)]">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Business WhatsApp" hint="Printed on every receipt as the WhatsApp line and used for receipt and statement messages"><Input type="tel" value={draft.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+92 3xx xxxxxxx" /></Field>
          <Field label="Storefront button number" hint={draft.number.trim() ? "The storefront button chats to this number" : "Blank: the storefront button uses the business WhatsApp"}><Input type="tel" value={draft.number} onChange={(e) => set("number", e.target.value)} placeholder={draft.phone || "+92 3xx xxxxxxx"} /></Field>
          <Field label="Greeting" hint="Pre-filled in the customer's chat" className="sm:col-span-2"><Input value={draft.greeting} onChange={(e) => set("greeting", e.target.value)} placeholder="Salam! I would like to place an order." /></Field>
          <Field label="Button text" hint="On the floating button, bottom right of the storefront"><Input value={draft.button_label} onChange={(e) => set("button_label", e.target.value)} placeholder="Need help?" maxLength={30} /></Field>
          <div className="flex items-end pb-2"><Switch checked={draft.show_button} onChange={(v) => set("show_button", v)} label="Show the floating button" /></div>
          <p className="text-xs text-fg-muted sm:col-span-2">EasAlpha&apos;s own support WhatsApp is set by the product owner and shows in Help &amp; Support, not here.</p>
        </div>
        <div className="rounded-[12px] border bg-page p-4">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-fg-muted">Preview</p>
          <div className="mx-auto w-[220px] rounded-md border bg-white p-2 text-center font-mono text-[11px] leading-snug text-black">
            <div className="opacity-70">… receipt footer …</div>
            <div>{draft.phone.trim() ? `WhatsApp ${draft.phone.trim()}` : "No WhatsApp line (business number blank)"}</div>
          </div>
          <div className="relative mt-3 h-28 overflow-hidden rounded-md border bg-muted">
            <span className="absolute left-2 top-2 text-[11px] text-fg-muted">Storefront page</span>
            {draft.show_button && link ? (
              <a href={link} target="_blank" rel="noreferrer" className="help-glow absolute bottom-3 right-3 inline-flex h-10 items-center gap-1.5 rounded-full bg-cta pl-3 pr-3.5 text-xs font-semibold text-cta-fg"><MessageCircle className="h-4 w-4" /> {draft.button_label.trim() || "Need help?"}</a>
            ) : <span className="absolute bottom-2 right-2 text-[11px] text-fg-muted">{draft.show_button ? "No valid number: button hidden" : "Button hidden"}</span>}
          </div>
          {link ? <p className="mt-2 break-all font-mono text-[11px] text-fg-muted">{link}</p> : null}
        </div>
      </CardBody>
    </Card>
  );
}
