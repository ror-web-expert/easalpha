// Pure helpers for the public marketing site: plan prices, the currency toggle,
// yearly maths and sign-up validation. No React, so every rule here is unit tested.

export type Currency = "PKR" | "USD";
export type Period = "monthly" | "yearly";

/** Business::TRIAL_DAYS in easalpha-api/app/models/business.rb. */
export const TRIAL_DAYS = 40;

/** Yearly billing is ten months' price: two months free. */
export const YEARLY_MONTHS_CHARGED = 10;

export interface Plan {
  code: "starter" | "pro" | "business";
  name: string;
  tagline: string;
  pricePkrMinor: number;
  priceUsdMinor: number;
  /** null means unlimited. */
  limits: { tills: number | null; staff: number | null; branches: number; whatsappMessages: number };
  highlights: string[];
  features: Record<FeatureKey, boolean>;
  popular?: boolean;
}

export type FeatureKey =
  | "kitchen_display" | "tables" | "riders" | "inventory" | "tax" | "online_ordering"
  | "multi_branch" | "payroll" | "loyalty" | "aggregators" | "own_whatsapp_number" | "custom_domain";

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  kitchen_display: "Kitchen display",
  tables: "Tables and dine-in",
  riders: "Riders and delivery board",
  inventory: "Inventory, recipes and purchasing",
  tax: "FBR and PRA tax invoices",
  online_ordering: "Storefront and QR ordering",
  multi_branch: "Multiple branches",
  payroll: "Attendance and payroll",
  loyalty: "Loyalty points and vouchers",
  aggregators: "Foodpanda orders",
  own_whatsapp_number: "WhatsApp from your own number",
  custom_domain: "Custom storefront domain",
};

// Mirrors Plan::DEFAULTS in easalpha-api/app/models/plan.rb.
export const PLANS: Plan[] = [
  {
    code: "starter",
    name: "Starter",
    tagline: "One counter, the essentials done properly.",
    pricePkrMinor: 2_500_00,
    priceUsdMinor: 19_00,
    limits: { tills: 1, staff: 3, branches: 1, whatsappMessages: 300 },
    highlights: ["1 till", "3 staff logins", "1 branch", "Offline selling and receipts", "Customers, khata and expenses", "300 WhatsApp messages a month"],
    features: { kitchen_display: false, tables: false, riders: false, inventory: false, tax: false, online_ordering: false, multi_branch: false, payroll: false, loyalty: false, aggregators: false, own_whatsapp_number: false, custom_domain: false },
  },
  {
    code: "pro",
    name: "Pro",
    tagline: "Kitchen, stock, riders and tax for a busy restaurant.",
    pricePkrMinor: 4_999_00,
    priceUsdMinor: 39_00,
    limits: { tills: 10, staff: null, branches: 1, whatsappMessages: 1000 },
    highlights: ["10 tills", "Unlimited staff", "Inventory with recipe deduction", "Riders and tables", "Kitchen display", "Online ordering and tax invoices", "1,000 WhatsApp messages a month"],
    features: { kitchen_display: true, tables: true, riders: true, inventory: true, tax: true, online_ordering: true, multi_branch: false, payroll: false, loyalty: false, aggregators: false, own_whatsapp_number: false, custom_domain: false },
    popular: true,
  },
  {
    code: "business",
    name: "Business",
    tagline: "Every branch, every surface, every report.",
    pricePkrMinor: 8_999_00,
    priceUsdMinor: 69_00,
    limits: { tills: null, staff: null, branches: 20, whatsappMessages: 3000 },
    highlights: ["Unlimited tills", "Up to 20 branches", "Loyalty and vouchers", "Attendance and payroll", "Foodpanda and aggregators", "Custom domain", "WhatsApp from your own number", "3,000 WhatsApp messages a month"],
    features: { kitchen_display: true, tables: true, riders: true, inventory: true, tax: true, online_ordering: true, multi_branch: true, payroll: true, loyalty: true, aggregators: true, own_whatsapp_number: true, custom_domain: true },
  },
];

export function monthlyMinor(plan: Plan, currency: Currency): number {
  return currency === "PKR" ? plan.pricePkrMinor : plan.priceUsdMinor;
}

/** Charged once a year: ten months' price. */
export function yearlyMinor(monthly: number): number {
  return monthly * YEARLY_MONTHS_CHARGED;
}

/** The yearly price spread over twelve months, rounded to the minor unit. */
export function yearlyPerMonthMinor(monthly: number): number {
  return Math.round(yearlyMinor(monthly) / 12);
}

/** What the customer keeps by paying yearly instead of twelve monthly payments. */
export function yearlySavingMinor(monthly: number): number {
  return monthly * 12 - yearlyMinor(monthly);
}

/** The price shown on a card for the chosen currency and period. */
export function displayPriceMinor(plan: Plan, currency: Currency, period: Period): number {
  const m = monthlyMinor(plan, currency);
  return period === "monthly" ? m : yearlyPerMonthMinor(m);
}

/** "Rs 2,500" or "$19". Whole units only when there are no minor units; otherwise two decimals. */
export function formatMoney(minor: number, currency: Currency): string {
  const units = minor / 100;
  const hasCents = minor % 100 !== 0;
  const num = units.toLocaleString("en-US", { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: hasCents ? 2 : 0 });
  return currency === "PKR" ? `Rs ${num}` : `$${num}`;
}

export function toggleCurrency(c: Currency): Currency {
  return c === "PKR" ? "USD" : "PKR";
}

export function limitLabel(n: number | null, noun: string): string {
  if (n === null) return `Unlimited ${noun}`;
  return `${n} ${noun}`;
}

// ---- Sign-up validation ----

export interface SignupInput {
  name: string;
  businessName: string;
  email: string;
  phone: string;
  password: string;
  agree: boolean;
  /** ISO 3166 code from COUNTRIES; sets the dialling code, currency and time zone of the new business. */
  country: string;
}

export interface Country { code: string; name: string; dial: string; currency: string; timeZone: string }

/** Where a restaurant can sign up from. The list sets sensible defaults only; everything is editable in Settings. */
export const COUNTRIES: Country[] = [
  { code: "PK", name: "Pakistan", dial: "+92", currency: "PKR", timeZone: "Asia/Karachi" },
  { code: "AE", name: "United Arab Emirates", dial: "+971", currency: "AED", timeZone: "Asia/Dubai" },
  { code: "SA", name: "Saudi Arabia", dial: "+966", currency: "SAR", timeZone: "Asia/Riyadh" },
  { code: "QA", name: "Qatar", dial: "+974", currency: "QAR", timeZone: "Asia/Qatar" },
  { code: "OM", name: "Oman", dial: "+968", currency: "OMR", timeZone: "Asia/Muscat" },
  { code: "KW", name: "Kuwait", dial: "+965", currency: "KWD", timeZone: "Asia/Kuwait" },
  { code: "BH", name: "Bahrain", dial: "+973", currency: "BHD", timeZone: "Asia/Bahrain" },
  { code: "GB", name: "United Kingdom", dial: "+44", currency: "GBP", timeZone: "Europe/London" },
  { code: "IE", name: "Ireland", dial: "+353", currency: "EUR", timeZone: "Europe/Dublin" },
  { code: "US", name: "United States", dial: "+1", currency: "USD", timeZone: "America/New_York" },
  { code: "CA", name: "Canada", dial: "+1", currency: "CAD", timeZone: "America/Toronto" },
  { code: "AU", name: "Australia", dial: "+61", currency: "AUD", timeZone: "Australia/Sydney" },
  { code: "NZ", name: "New Zealand", dial: "+64", currency: "NZD", timeZone: "Pacific/Auckland" },
  { code: "DE", name: "Germany", dial: "+49", currency: "EUR", timeZone: "Europe/Berlin" },
  { code: "FR", name: "France", dial: "+33", currency: "EUR", timeZone: "Europe/Paris" },
  { code: "NL", name: "Netherlands", dial: "+31", currency: "EUR", timeZone: "Europe/Amsterdam" },
  { code: "ES", name: "Spain", dial: "+34", currency: "EUR", timeZone: "Europe/Madrid" },
  { code: "IT", name: "Italy", dial: "+39", currency: "EUR", timeZone: "Europe/Rome" },
  { code: "TR", name: "Turkey", dial: "+90", currency: "TRY", timeZone: "Europe/Istanbul" },
  { code: "EG", name: "Egypt", dial: "+20", currency: "EGP", timeZone: "Africa/Cairo" },
  { code: "NG", name: "Nigeria", dial: "+234", currency: "NGN", timeZone: "Africa/Lagos" },
  { code: "KE", name: "Kenya", dial: "+254", currency: "KES", timeZone: "Africa/Nairobi" },
  { code: "ZA", name: "South Africa", dial: "+27", currency: "ZAR", timeZone: "Africa/Johannesburg" },
  { code: "IN", name: "India", dial: "+91", currency: "INR", timeZone: "Asia/Kolkata" },
  { code: "BD", name: "Bangladesh", dial: "+880", currency: "BDT", timeZone: "Asia/Dhaka" },
  { code: "LK", name: "Sri Lanka", dial: "+94", currency: "LKR", timeZone: "Asia/Colombo" },
  { code: "NP", name: "Nepal", dial: "+977", currency: "NPR", timeZone: "Asia/Kathmandu" },
  { code: "MY", name: "Malaysia", dial: "+60", currency: "MYR", timeZone: "Asia/Kuala_Lumpur" },
  { code: "SG", name: "Singapore", dial: "+65", currency: "SGD", timeZone: "Asia/Singapore" },
  { code: "ID", name: "Indonesia", dial: "+62", currency: "IDR", timeZone: "Asia/Jakarta" },
  { code: "PH", name: "Philippines", dial: "+63", currency: "PHP", timeZone: "Asia/Manila" },
  { code: "TH", name: "Thailand", dial: "+66", currency: "THB", timeZone: "Asia/Bangkok" },
  { code: "JP", name: "Japan", dial: "+81", currency: "JPY", timeZone: "Asia/Tokyo" },
  { code: "BR", name: "Brazil", dial: "+55", currency: "BRL", timeZone: "America/Sao_Paulo" },
  { code: "MX", name: "Mexico", dial: "+52", currency: "MXN", timeZone: "America/Mexico_City" },
];

export const DEFAULT_COUNTRY = "PK";

export function countryByCode(code: string | null | undefined): Country {
  return COUNTRIES.find((c) => c.code === (code ?? "").toUpperCase()) ?? COUNTRIES[0];
}

/** The country a browser locale such as "en-GB" or "ar-AE" points at, when it is one we list. */
export function detectCountry(locale: string | null | undefined): string {
  const region = (locale ?? "").split(/[-_]/)[1]?.toUpperCase();
  return region && COUNTRIES.some((c) => c.code === region) ? region : DEFAULT_COUNTRY;
}

export type SignupErrors = Partial<Record<keyof SignupInput, string>>;

export const PASSWORD_MIN = 8;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/**
 * Normalises a phone number to international form, +<country code><number>, for the given dialling code.
 * Accepts "0300 1234567" (local, leading zero dropped), "92 300 1234567", "+92 (300) 1234567" and "00923001234567".
 * Returns the stripped input when it does not fit, so validation can reject it.
 */
export function normalizePhone(raw: string, dial = "+92"): string {
  let s = raw.replace(/[\s\-()]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (/^0\d{6,12}$/.test(s)) return `${dial}${s.slice(1)}`;
  if (/^\d{8,15}$/.test(s) && s.startsWith(dial.slice(1))) return `+${s}`;
  return s;
}

/** An international mobile number: a plus sign, then 8 to 15 digits (E.164). */
export function isValidPhone(raw: string, dial = "+92"): boolean {
  return /^\+[1-9]\d{7,14}$/.test(normalizePhone(raw, dial));
}

/** A Pakistani number in international format: +92 followed by ten digits. */
export function isValidPakistaniPhone(raw: string): boolean {
  return /^\+92\d{10}$/.test(normalizePhone(raw, "+92"));
}

export type PasswordStrength = "too short" | "weak" | "good" | "strong";

export function passwordStrength(password: string): PasswordStrength {
  if (password.length < PASSWORD_MIN) return "too short";
  let classes = 0;
  if (/[a-z]/.test(password)) classes++;
  if (/[A-Z]/.test(password)) classes++;
  if (/\d/.test(password)) classes++;
  if (/[^A-Za-z0-9]/.test(password)) classes++;
  if (password.length >= 12 && classes >= 3) return "strong";
  if (classes >= 2) return "good";
  return "weak";
}

export function validateSignup(input: SignupInput): SignupErrors {
  const errors: SignupErrors = {};
  if (input.name.trim().length < 2) errors.name = "Enter your name.";
  if (input.businessName.trim().length < 2) errors.businessName = "Enter your restaurant's name.";
  if (!isValidEmail(input.email)) errors.email = "Enter a valid email address.";
  const dial = countryByCode(input.country).dial;
  if (!isValidPhone(input.phone, dial)) errors.phone = `Enter a mobile number with its country code, such as ${dial} 300 1234567.`;
  if (input.password.length < PASSWORD_MIN) errors.password = `Use at least ${PASSWORD_MIN} characters.`;
  if (!input.agree) errors.agree = "Please accept the terms to continue.";
  return errors;
}

export function isSignupValid(input: SignupInput): boolean {
  return Object.keys(validateSignup(input)).length === 0;
}

/** The body for POST /auth/signup. */
export function signupPayload(input: SignupInput) {
  const c = countryByCode(input.country);
  return {
    name: input.name.trim(),
    business_name: input.businessName.trim(),
    email: input.email.trim().toLowerCase(),
    password: input.password,
    phone: normalizePhone(input.phone, c.dial),
    country: c.code,
    currency: c.currency,
    time_zone: c.timeZone,
  };
}

// ---- Contact ----
// Defaults only. The live values come from the product owner's platform settings (GET /platform, edited in the super
// panel); contactFromPlatform maps them and every link helper takes the contact as its last argument.

/** The link-preview image every page shares, with the one tagline used everywhere ("for any restaurant, anywhere").
 *  The version query changes whenever the picture does, so WhatsApp, Facebook and X fetch the new one instead of
 *  showing the copy they cached for the old address (17 Oct 2026: the old picture said "built for Pakistan"). */
export const OG_IMAGE_PATH = "/og.png?v=20261017";
export const OG_IMAGE_ALT = "EasAlpha: the restaurant POS for any restaurant, anywhere";

/** The one-line description used by the layout metadata, Open Graph and the schema. 155 characters. */
export const SITE_DESCRIPTION = "EasAlpha is the restaurant POS that keeps selling offline: till, kitchen display, inventory, accounts, payroll, riders and WhatsApp receipts. 40 days free.";

/** The registered office, in parts for the schema's PostalAddress and joined for the footer. */
export const OFFICE = { street: "161 P Block, Gulberg 3", city: "Lahore", region: "Punjab", countryCode: "PK", country: "Pakistan" } as const;
export const OFFICE_ADDRESS = `${OFFICE.street}, ${OFFICE.city}, ${OFFICE.country}`;

/** phone is the number to call; when it is the WhatsApp number too, the footer shows it once with both labels. */
export interface SiteContact { email: string; whatsapp: string; whatsappDisplay: string; phone: string; phoneDisplay: string; address: string; hours: string; productName: string }

export const CONTACT: SiteContact = {
  email: "hello@easalpha.com",
  whatsapp: "+923437172731",
  whatsappDisplay: "+92 343 7172731",
  phone: "+923437172731",
  phoneDisplay: "+92 343 7172731",
  address: OFFICE_ADDRESS,
  hours: "24/7, every day of the year",
  productName: "EasAlpha",
};

/** "+923001234567" reads as "+92 300 1234567"; anything else is shown as typed. */
export function displayPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (/^92\d{10}$/.test(digits)) return `+92 ${digits.slice(2, 5)} ${digits.slice(5)}`;
  return raw.trim();
}

/** Platform settings (support_* keys) to the site's contact block; blanks keep the defaults. */
export function contactFromPlatform(p: { support_email?: string | null; support_whatsapp?: string | null; support_phone?: string | null; support_hours?: string | null; product_name?: string | null } | null | undefined): SiteContact {
  if (!p) return CONTACT;
  const whatsapp = (p.support_whatsapp || p.support_phone || CONTACT.whatsapp).trim();
  const phone = (p.support_phone || whatsapp).trim();
  return {
    email: (p.support_email || CONTACT.email).trim(),
    whatsapp,
    whatsappDisplay: displayPhone(whatsapp),
    phone,
    phoneDisplay: displayPhone(phone),
    address: CONTACT.address,
    hours: (p.support_hours || CONTACT.hours).trim(),
    productName: (p.product_name || CONTACT.productName).trim(),
  };
}

export function whatsappLink(message?: string, contact: SiteContact = CONTACT): string {
  const base = `https://wa.me/${contact.whatsapp.replace(/\D/g, "")}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function mailtoLink(subject: string, body: string, contact: SiteContact = CONTACT): string {
  return `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function telLink(contact: SiteContact = CONTACT): string {
  return `tel:${contact.phone}`;
}

// ---- Site palette (also used as literal Tailwind classes in the components) ----
// Navy #0B1F3A / #10294D, tint #F4F7FB, orange #FF7A1A (icons, highlights, big numbers on navy, decorative tiles),
// orange text on white #C2410C (small) and #D9580A (large, 3.9:1). Buttons and badges with white text use the
// brand-cta token (#C2410C, hover #9A3412) from globals.css: white on #FF7A1A measures 2.61:1 and fails WCAG AA.

// ---- Language (English / Urdu) for the hero, buttons and section headings ----

export type Lang = "en" | "ur";
export const LANG_KEY = "easalpha.site.lang";
export type Bi = { en: string; ur: string };

export const UI = {
  "hero.badge": { en: "Works offline during load-shedding", ur: "لوڈ شیڈنگ میں بھی آف لائن چلتا ہے" },
  "hero.title.pre": { en: "Run every counter, kitchen and branch from one system that ", ur: "ہر کاؤنٹر، کچن اور برانچ ایک ایسے سسٹم سے چلائیں جو " },
  "hero.title.accent": { en: "keeps selling when the internet does not.", ur: "انٹرنیٹ بند ہونے پر بھی بیچتا رہے۔" },
  "hero.subtitle": {
    en: "EasAlpha gives restaurant owners an offline till, kitchen screens, stock that deducts itself, supplier and khata ledgers, payroll, riders, WhatsApp receipts and 27 reports, all in one account.",
    ur: "سرویو ریسٹورنٹ مالکان کو آف لائن ٹِل، کچن اسکرینیں، خود کٹنے والا اسٹاک، سپلائر اور کھاتہ لیجر، پے رول، رائڈرز، واٹس ایپ رسیدیں اور 27 رپورٹیں ایک ہی اکاؤنٹ میں دیتا ہے۔",
  },
  "cta.start": { en: "Start free", ur: "مفت شروع کریں" },
  "cta.demo": { en: "See it in action", ur: "عملی مظاہرہ دیکھیں" },
  "cta.talk": { en: "Talk to us", ur: "ہم سے بات کریں" },
  "cta.login": { en: "Log in", ur: "لاگ اِن" },
  "hero.trial": { en: `${TRIAL_DAYS}-day free trial`, ur: `${TRIAL_DAYS} دن مفت آزمائش` },
  "hero.nocard": { en: "No card needed", ur: "کارڈ کی ضرورت نہیں" },
  "hero.setup": { en: "Set up in a day", ur: "ایک دن میں سیٹ اپ" },
  "nav.features": { en: "Features", ur: "خصوصیات" },
  "nav.pricing": { en: "Pricing", ur: "قیمتیں" },
  "nav.contact": { en: "Contact", ur: "رابطہ" },
  "nav.download": { en: "Download", ur: "ڈاؤن لوڈ" },
  "sec.tour": { en: "Everything a restaurant runs on, in one account", ur: "ریسٹورنٹ کی ہر ضرورت، ایک اکاؤنٹ میں" },
  "sec.pk": { en: "The local details, done right", ur: "مقامی ضروریات، درست طریقے سے" },
  "sec.surfaces": { en: "Every screen your staff touch", ur: "آپ کے عملے کی ہر اسکرین" },
  "sec.pricing": { en: "Simple monthly plans", ur: "سادہ ماہانہ پلان" },
  "sec.faq": { en: "Before you start", ur: "شروع کرنے سے پہلے" },
  "sec.cta": { en: "Open your account today", ur: "آج ہی اپنا اکاؤنٹ کھولیں" },
} satisfies Record<string, Bi>;

export type UiKey = keyof typeof UI;

/** Text for a key in a language; falls back to English when the Urdu string is empty. */
export function t(key: UiKey, lang: Lang): string {
  const entry: Bi = UI[key];
  return lang === "ur" && entry.ur ? entry.ur : entry.en;
}

export function toggleLang(l: Lang): Lang {
  return l === "en" ? "ur" : "en";
}

export function isLang(v: unknown): v is Lang {
  return v === "en" || v === "ur";
}
