// Pure helpers for the Branding screen: the receipt-branding draft that maps onto the settings store, a realistic
// sample receipt for the live preview, the Website Config identity patch, and image URL checks for BrandImage.
// Nothing here touches React or the network so every rule is unit-tested in branding-helpers.test.ts.
import type { ReceiptBranding } from "@/components/pos/receipt";
import type { Branch, Receipt, SettingKey, SettingsResponse, WebsiteSections } from "@/lib/types";

// ---- Images ----
/** True for anything an <img> can load: an absolute http(s) URL (the API's /uploads/:signed_id), a data URI or a site-relative path. */
export function isImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!v) return false;
  return /^https?:\/\/\S+$/i.test(v) || /^data:image\//i.test(v) || /^blob:/i.test(v) || v.startsWith("/");
}

/** Theme colour swatches shared by Website Config and Branding: navy, orange, then six common restaurant colours. */
export const THEME_PRESETS = ["#10294d", "#ff7a1a", "#2e7d32", "#c62828", "#ef6c00", "#6a1b9a", "#00838f", "#191c23"];
export const DEFAULT_THEME = "#10294d";

/** A full 6-digit hex colour, lower-cased, or null. */
export function normalizeHex(value: unknown): string | null {
  const m = /^\s*#?([0-9a-f]{6})\s*$/i.exec(typeof value === "string" ? value : "");
  return m ? `#${m[1].toLowerCase()}` : null;
}

// ---- Receipt branding (settings store) ----
export type Paper = "80" | "58";
export type ReceiptLanguage = "en" | "ur";
export interface ReceiptDraft {
  header: string; footer: string; show_logo: boolean; footer_qr_url: string; paper: Paper; language: ReceiptLanguage; secondary_phone: string;
}
export const RECEIPT_SETTING_KEYS: Record<keyof ReceiptDraft, string> = {
  header: "pos.receipt.header", footer: "pos.receipt.footer", show_logo: "pos.receipt.show_logo", footer_qr_url: "pos.receipt.footer_qr_url",
  paper: "pos.receipt.paper", language: "pos.receipt.language", secondary_phone: "store.secondary_phone",
};
export const EMPTY_RECEIPT_DRAFT: ReceiptDraft = { header: "", footer: "", show_logo: true, footer_qr_url: "", paper: "80", language: "en", secondary_phone: "" };

/** Every key of every group and screen as one list, so a lookup does not care which screen the registry put a key on. */
export function flattenSettings(res: SettingsResponse | undefined | null): SettingKey[] {
  if (!res) return [];
  return Object.values(res.groups).flatMap((g) => Object.values(g.screens).flat());
}

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

/** The receipt draft as the settings store has it; a key missing from the registry keeps its default. */
export function receiptDraftFrom(keys: SettingKey[]): ReceiptDraft {
  const by = new Map(keys.map((k) => [k.key, k]));
  const value = (field: keyof ReceiptDraft) => by.get(RECEIPT_SETTING_KEYS[field])?.value;
  const paper = str(value("paper"));
  const language = str(value("language"));
  const show = value("show_logo");
  return {
    header: str(value("header")), footer: str(value("footer")),
    show_logo: show === undefined || show === null ? true : show === true,
    footer_qr_url: str(value("footer_qr_url")),
    paper: paper === "58" ? "58" : "80",
    language: language === "ur" ? "ur" : "en",
    secondary_phone: str(value("secondary_phone")),
  };
}

/** PATCH /settings { values } for the fields that changed. Blank text saves as null so the receipt line disappears. */
export function receiptValuesPatch(original: ReceiptDraft, edited: ReceiptDraft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const norm = (v: string | boolean) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v);
  for (const field of Object.keys(RECEIPT_SETTING_KEYS) as (keyof ReceiptDraft)[]) {
    const a = norm(original[field]), b = norm(edited[field]);
    if (a === b) continue;
    out[RECEIPT_SETTING_KEYS[field]] = b;
  }
  return out;
}

/** The ReceiptView branding props for a draft (what print.ts's receiptSettings derives from the store at print time). */
export function brandingFor(draft: ReceiptDraft): ReceiptBranding {
  return {
    paper: draft.paper,
    showLogo: draft.show_logo,
    footerQrUrl: draft.footer_qr_url.trim() || null,
    secondaryPhone: draft.secondary_phone.trim() || null,
  };
}

export interface SampleBusiness { name: string; legal_name?: string | null; phone?: string | null; logo_key?: string | null; currency?: string }
type SampleBranch = Pick<Branch, "name" | "address" | "city" | "phone" | "tax_registration">;

/** Fixed clock so the preview (and its test) never depends on the wall clock. */
export const SAMPLE_PAID_AT = "2026-10-11T13:42:00+05:00";

/**
 * A realistic paid order for the live preview: two items (one with a modifier), 16% sales tax on top, paid in cash
 * with change. Header, footer and language come from the draft; the business block comes from the session so the
 * preview shows the real name and logo. Amounts are in minor units (paisa).
 */
export function sampleReceipt(business: SampleBusiness, draft: ReceiptDraft, branch?: SampleBranch | null): Receipt {
  const karahi = 120_000, naan = 6_000, raita = 8_000;
  const subtotal = karahi * 1 + naan * 4 + raita;      // 1,200 + 240 + 80 = 1,520
  const tax = Math.round(subtotal * 0.16);              // 243.20
  const total = subtotal + tax;                         // 1,763.20
  const tendered = 200_000;
  return {
    receipt_number: "R-000128", duplicate: false, printed_at: SAMPLE_PAID_AT,
    business: { name: business.name || "Your business", legal_name: business.legal_name ?? null, phone: business.phone ?? null, logo_key: business.logo_key ?? null, currency: business.currency ?? "PKR" },
    branch: { name: branch?.name ?? "Main branch", address: branch?.address ?? "12 Main Boulevard", city: branch?.city ?? "Lahore", phone: branch?.phone ?? null, tax_registration: branch?.tax_registration ?? null },
    header: draft.header.trim() || null, footer: draft.footer.trim() || null, language: draft.language, paper: draft.paper,
    order: { id: "sample", serial: 128, label: "#128", order_type: "dine_in", table: "T4", business_day: SAMPLE_PAID_AT.slice(0, 10), placed_at: SAMPLE_PAID_AT, paid_at: SAMPLE_PAID_AT, cashier: "Ayesha", customer: null, guest_name: null, notes: null },
    lines: [
      { name: "Chicken Karahi (full)", quantity: "1", unit_price_minor: karahi, modifiers: [{ name: "Extra spicy", price_minor: 0 }], line_total_minor: karahi, discount_minor: 0, notes: null },
      { name: "Roghni Naan", quantity: "4", unit_price_minor: naan, modifiers: [], line_total_minor: naan * 4, discount_minor: 0, notes: null },
      { name: "Raita", quantity: "1", unit_price_minor: raita, modifiers: [], line_total_minor: raita, discount_minor: 0, notes: null },
    ],
    totals: { subtotal_minor: subtotal, discount_minor: 0, service_charge_minor: 0, tax_minor: tax, tax_lines: [{ rate: 16, inclusive: false, taxable_minor: subtotal, tax_minor: tax }], delivery_charge_minor: 0, rounding_minor: 0, tip_minor: 0, total_minor: total, paid_minor: total, due_minor: 0 },
    payments: [{ method: "cash", amount_minor: total, tendered_minor: tendered, change_minor: tendered - total, reference: null }],
    refunds: [], khata: null,
    tax_invoice: { number: null, qr: null, status: "not_registered" },
    feedback_whatsapp: business.phone ?? null,
  };
}

// ---- Website identity (Website Config) ----
export interface IdentityDraft { name: string; description: string; theme_color: string; logo_key: string; cover_key: string; favicon_key: string }
export const IDENTITY_FIELDS: (keyof IdentityDraft)[] = ["name", "description", "theme_color", "logo_key", "cover_key", "favicon_key"];

/** The identity section as a flat string draft (null -> ""), ignoring keys this screen does not edit (slug). */
export function identityDraftFrom(sections: WebsiteSections | undefined | null): IdentityDraft {
  const identity = sections?.identity ?? {};
  return {
    name: str(identity.name), description: str(identity.description), theme_color: str(identity.theme_color),
    logo_key: str(identity.logo_key), cover_key: str(identity.cover_key), favicon_key: str(identity.favicon_key),
  };
}

/**
 * The identity keys to send in PATCH /website_config { sections: { identity } }: only the keys that differ from
 * what the server holds, blank strings as null (the API treats null as "unset", the storefront then falls back).
 * Returns null when nothing changed so the caller can skip the request.
 */
export function identityPatch(sections: WebsiteSections | undefined | null, edited: IdentityDraft): Record<string, string | null> | null {
  const server = sections?.identity ?? {};
  const out: Record<string, string | null> = {};
  for (const field of IDENTITY_FIELDS) {
    const next = field === "theme_color" ? (normalizeHex(edited[field]) ?? edited[field].trim()) : edited[field].trim();
    const value = next === "" ? null : next;
    const current = server[field] === undefined || server[field] === null || server[field] === "" ? null : String(server[field]);
    if (field === "theme_color" && current && value && normalizeHex(current) === normalizeHex(value)) continue;
    if (value !== current) out[field] = value;
  }
  return Object.keys(out).length ? out : null;
}

/** The logo the storefront shows: the website's own logo when set, otherwise the business logo (storefront.tsx does the same). */
export function effectiveLogo(identityLogo: string | null | undefined, businessLogo: string | null | undefined): { src: string | null; fallback: boolean } {
  if (isImageUrl(identityLogo)) return { src: identityLogo.trim(), fallback: false };
  if (isImageUrl(businessLogo)) return { src: businessLogo.trim(), fallback: true };
  return { src: null, fallback: false };
}

/** What the browser tab reads: the website name when set, otherwise the business name. */
export function siteTitle(identityName: string | null | undefined, businessName: string | null | undefined): string {
  return (identityName ?? "").trim() || (businessName ?? "").trim() || "Your storefront";
}

// ---- WhatsApp (business number on the receipt, storefront button) ----
export interface WhatsappDraft { phone: string; number: string; greeting: string; show_button: boolean; button_label: string }

/** The business phone (printed on the receipt as the WhatsApp line) plus the storefront's WhatsApp section. */
export function whatsappDraftFrom(businessPhone: string | null | undefined, sections: WebsiteSections | undefined | null): WhatsappDraft {
  const wa = sections?.whatsapp ?? {};
  return { phone: str(businessPhone), number: str(wa.number), greeting: str(wa.greeting), show_button: wa.show_button !== false, button_label: str(wa.button_label) };
}

/** Digits of a phone for a wa.me link, or null when there are none. "0300 1234567" becomes 923001234567. */
export function waDigits(phone: string | null | undefined): string | null {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = "92" + d.slice(1);
  return d.length >= 8 ? d : null;
}

export function waLink(phone: string | null | undefined, greeting?: string): string | null {
  const d = waDigits(phone);
  if (!d) return null;
  const g = (greeting ?? "").trim();
  return g ? `https://wa.me/${d}?text=${encodeURIComponent(g)}` : `https://wa.me/${d}`;
}

/** What changed, split by where it is saved: the business phone (PATCH /business) and the whatsapp section (PATCH /website_config). */
export function whatsappPatch(original: WhatsappDraft, edited: WhatsappDraft): { business: { phone: string | null } | null; section: Record<string, string | boolean | null> | null } {
  const business = edited.phone.trim() !== original.phone.trim() ? { phone: edited.phone.trim() || null } : null;
  const section: Record<string, string | boolean | null> = {};
  if (edited.number.trim() !== original.number.trim()) section.number = edited.number.trim() || null;
  if (edited.greeting.trim() !== original.greeting.trim()) section.greeting = edited.greeting.trim() || null;
  if (edited.show_button !== original.show_button) section.show_button = edited.show_button;
  if (edited.button_label.trim() !== original.button_label.trim()) section.button_label = edited.button_label.trim() || null;
  return { business, section: Object.keys(section).length ? section : null };
}
