// Pure helpers for the public marketing site: plan prices, the currency toggle,
// yearly maths and sign-up validation. No React, so every rule here is unit tested.

export type Currency = "PKR" | "USD";
export type Period = "monthly" | "yearly";

/** Business::TRIAL_DAYS in servio-api/app/models/business.rb. */
export const TRIAL_DAYS = 90;

/** Yearly billing is ten months' price: two months free. */
export const YEARLY_MONTHS_CHARGED = 10;

export interface Plan {
  code: "starter" | "pro" | "business";
  name: string;
  tagline: string;
  pricePkrMinor: number;
  priceUsdMinor: number;
  limits: { tills: number; staff: number | null; branches: number; whatsappMessages: number };
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

// Mirrors Plan::DEFAULTS in servio-api/app/models/plan.rb.
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
    limits: { tills: 3, staff: null, branches: 1, whatsappMessages: 1000 },
    highlights: ["3 tills", "Unlimited staff", "Inventory with recipe deduction", "Riders and tables", "Kitchen display", "Online ordering and tax invoices", "1,000 WhatsApp messages a month"],
    features: { kitchen_display: true, tables: true, riders: true, inventory: true, tax: true, online_ordering: true, multi_branch: false, payroll: false, loyalty: false, aggregators: false, own_whatsapp_number: false, custom_domain: false },
    popular: true,
  },
  {
    code: "business",
    name: "Business",
    tagline: "Every branch, every surface, every report.",
    pricePkrMinor: 8_999_00,
    priceUsdMinor: 69_00,
    limits: { tills: 10, staff: null, branches: 20, whatsappMessages: 3000 },
    highlights: ["10 tills", "Up to 20 branches", "Loyalty and vouchers", "Attendance and payroll", "Foodpanda and aggregators", "Custom domain", "WhatsApp from your own number", "3,000 WhatsApp messages a month"],
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
}

export type SignupErrors = Partial<Record<keyof SignupInput, string>>;

export const PASSWORD_MIN = 8;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/**
 * Normalises a Pakistani phone number to +92XXXXXXXXXX.
 * Accepts "0300 1234567", "0300-1234567", "92 300 1234567", "+92 300 1234567" and "00923001234567".
 * Returns the trimmed input unchanged when it does not look Pakistani so validation can reject it.
 */
export function normalizePhone(raw: string): string {
  let s = raw.replace(/[\s\-()]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (/^0\d{10}$/.test(s)) return `+92${s.slice(1)}`;
  if (/^92\d{10}$/.test(s)) return `+${s}`;
  return s;
}

/** A Pakistani number in international format: +92 followed by ten digits. */
export function isValidPakistaniPhone(raw: string): boolean {
  return /^\+92\d{10}$/.test(normalizePhone(raw));
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
  if (!isValidPakistaniPhone(input.phone)) errors.phone = "Enter a Pakistani mobile number such as +92 300 1234567.";
  if (input.password.length < PASSWORD_MIN) errors.password = `Use at least ${PASSWORD_MIN} characters.`;
  if (!input.agree) errors.agree = "Please accept the terms to continue.";
  return errors;
}

export function isSignupValid(input: SignupInput): boolean {
  return Object.keys(validateSignup(input)).length === 0;
}

/** The body for POST /auth/signup. */
export function signupPayload(input: SignupInput) {
  return {
    name: input.name.trim(),
    business_name: input.businessName.trim(),
    email: input.email.trim().toLowerCase(),
    password: input.password,
    phone: normalizePhone(input.phone),
  };
}

// ---- Contact ----
// Defaults only. The live values come from the product owner's platform settings (GET /platform, edited in the super
// panel); contactFromPlatform maps them and every link helper takes the contact as its last argument.

export interface SiteContact { email: string; whatsapp: string; whatsappDisplay: string; address: string; hours: string; productName: string }

export const CONTACT: SiteContact = {
  email: "hello@easalpha.com",
  whatsapp: "+923437172731",
  whatsappDisplay: "+92 343 7172731",
  address: "Office address to be announced, Lahore, Pakistan",
  hours: "10 am to 11 pm Pakistan time, every day",
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
  return {
    email: (p.support_email || CONTACT.email).trim(),
    whatsapp,
    whatsappDisplay: displayPhone(whatsapp),
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
  return `tel:${contact.whatsapp}`;
}

// ---- Site palette (also used as literal Tailwind classes in the components) ----
// Navy #0B1F3A / #10294D, tint #F4F7FB, orange #FF7A1A (buttons, icons, big numbers on navy),
// orange hover #E0640C, orange text on white #C2410C (small) and #D9580A (large, 3.9:1).

// ---- Language (English / Urdu) for the hero, buttons and section headings ----

export type Lang = "en" | "ur";
export const LANG_KEY = "servio.site.lang";
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
  "sec.pk": { en: "The details that only matter here, done right", ur: "پاکستان کی ضروریات، درست طریقے سے" },
  "sec.surfaces": { en: "Every screen your staff touch", ur: "آپ کے عملے کی ہر اسکرین" },
  "sec.pricing": { en: "Simple monthly plans in rupees", ur: "روپوں میں سادہ ماہانہ پلان" },
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
