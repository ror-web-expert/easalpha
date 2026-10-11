import { describe, expect, it } from "vitest";
import {
  BUSINESS_STATUSES, PLATFORM_FIELDS, businessStatusVariant, composeSupportSession, effectivePlatformValues, flagScopeLabel,
  healthChecks, invoiceActionable, invoiceStatusVariant, platformForm, platformPayload, secondsUntil, supportRequestStatusVariant,
  supportSessionStatusVariant, whatsappHref, type MePayload, type SupportTokenResponse,
} from "./super-helpers";
import type { Business, Membership, SuperHealth, User } from "@/lib/types";

describe("businessStatusVariant", () => {
  it("maps every API status to a badge tone", () => {
    expect(businessStatusVariant("trial")).toBe("info");
    expect(businessStatusVariant("active")).toBe("success");
    expect(businessStatusVariant("grace")).toBe("warning");
    expect(businessStatusVariant("read_only")).toBe("danger");
    expect(businessStatusVariant("deleted")).toBe("outline");
    expect(businessStatusVariant(undefined)).toBe("neutral");
    expect(BUSINESS_STATUSES).toHaveLength(5);
  });
});

describe("flagScopeLabel", () => {
  it("says Global for a platform-wide flag and names the business otherwise", () => {
    expect(flagScopeLabel(null)).toBe("Global");
    expect(flagScopeLabel(undefined)).toBe("Global");
    expect(flagScopeLabel("a5ce3608-6828-4c34", "Quia recusandae Inc")).toBe("Quia recusandae Inc");
    expect(flagScopeLabel("a5ce3608-6828-4c34")).toBe("Business a5ce3608");
  });
});

describe("invoiceActionable", () => {
  it("allows confirming reported and open invoices only", () => {
    expect(invoiceActionable("reported")).toBe(true);
    expect(invoiceActionable("open")).toBe(true);
    expect(invoiceActionable("pending")).toBe(true);
    expect(invoiceActionable("paid")).toBe(false);
    expect(invoiceActionable("void")).toBe(false);
    expect(invoiceActionable(null)).toBe(false);
  });
  it("tones the invoice badge", () => {
    expect(invoiceStatusVariant("paid")).toBe("success");
    expect(invoiceStatusVariant("reported")).toBe("warning");
    expect(invoiceStatusVariant("void")).toBe("outline");
  });
});

describe("support badges", () => {
  it("tones request and session statuses", () => {
    expect(supportRequestStatusVariant("open")).toBe("warning");
    expect(supportRequestStatusVariant("answered")).toBe("success");
    expect(supportRequestStatusVariant("closed")).toBe("outline");
    expect(supportSessionStatusVariant("approved", true)).toBe("success");
    expect(supportSessionStatusVariant("approved", false)).toBe("outline");
    expect(supportSessionStatusVariant("requested")).toBe("warning");
    expect(supportSessionStatusVariant("denied")).toBe("danger");
  });
});

describe("secondsUntil", () => {
  const now = Date.parse("2026-10-11T10:00:00Z");
  it("counts whole seconds to the expiry", () => {
    expect(secondsUntil("2026-10-11T11:00:00Z", now)).toBe(3600);
    expect(secondsUntil("2026-10-11T10:00:30.900Z", now)).toBe(30);
  });
  it("is zero when missing, invalid or past", () => {
    expect(secondsUntil(null, now)).toBe(0);
    expect(secondsUntil("nonsense", now)).toBe(0);
    expect(secondsUntil("2026-10-11T09:00:00Z", now)).toBe(0);
  });
});

const business = { id: "b1", name: "Cafe", slug: "cafe", status: "active", currency: "PKR" } as unknown as Business;
const user = { id: "u1", name: "Owner", email: "o@x.pk", phone: null, locale: null, two_factor_enabled: false, last_login_at: null } as User;
const membership = { id: "m1", business_id: "b1", user_id: "u1", role: { id: "r1", name: "Owner", system_key: "owner" } } as unknown as Membership;

describe("composeSupportSession", () => {
  const now = Date.parse("2026-10-11T10:00:00Z");
  const token: SupportTokenResponse = { access_token: "tok", expires_at: "2026-10-11T11:00:00Z", business };
  const me: MePayload = {
    user, business, branch: { id: "br1", name: "Main" } as unknown as MePayload["branch"], membership,
    permissions: ["settings.manage"], businesses: [{ id: "b1", name: "Cafe", slug: "cafe", role: "Owner" }], pills: { open_orders_today: 1, open_orders_previous: 0, low_stock_items: 2 },
  };
  it("looks like POST /auth/login's Session with no refresh token and a countdown to expiry", () => {
    const s = composeSupportSession(token, me, now);
    expect(s.access_token).toBe("tok");
    expect(s.refresh_token).toBe("");
    expect(s.token_type).toBe("Bearer");
    expect(s.app).toBe("admin");
    expect(s.expires_in).toBe(3600);
    expect(s.user).toBe(user);
    expect(s.business).toBe(business);
    expect(s.branch?.id).toBe("br1");
    expect(s.membership).toBe(membership);
    expect(s.permissions).toEqual(["settings.manage"]);
    expect(s.businesses).toHaveLength(1);
    expect(s.pills?.low_stock_items).toBe(2);
  });
  it("falls back to the token's business and empty lists when /me is thin", () => {
    const thin = { user, membership } as unknown as MePayload;
    const s = composeSupportSession(token, thin, now);
    expect(s.business).toBe(business);
    expect(s.branch).toBeNull();
    expect(s.permissions).toEqual([]);
    expect(s.businesses).toEqual([]);
    expect(s.pills).toBeNull();
  });
});

describe("healthChecks", () => {
  const base: SuperHealth = { status: "ok", time: "", version: "0.1.0", database: true, pending_jobs: 0, businesses: 44, orders_today: 21, tax_failed: 0, whatsapp_failed_24h: 0 };
  it("is all green on a healthy API", () => {
    expect(healthChecks(base).every((c) => c.ok)).toBe(true);
    expect(healthChecks(base).map((c) => c.label)).toEqual(["Database", "Pending jobs", "Failed tax invoices", "Failed WhatsApp (24h)", "Version"]);
  });
  it("goes red on failures and an unknown queue", () => {
    const rows = healthChecks({ ...base, database: false, pending_jobs: null, tax_failed: 2, whatsapp_failed_24h: 1 });
    expect(rows.map((c) => c.ok)).toEqual([false, false, false, false, true]);
    expect(rows[1].value).toBe("Unknown");
  });
});

describe("platform settings form", () => {
  const defaults = {
    product_name: "EasAlpha", support_email: "hello@easalpha.com", support_whatsapp: "+923001234567", support_phone: null, support_hours: "10 am to 11 pm",
    support_url: null, docs_url: null, powered_by: "Powered by EasAlpha", announcement: null, announcement_level: "info" as const,
    downloads_url: null, desktop_version: "0.2.0",
  };
  it("lists every PUT key once (announcement_level is the select)", () => {
    const keys = PLATFORM_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys, "announcement_level"].sort()).toEqual(Object.keys(defaults).sort());
  });
  it("blank form values restore the default in the preview", () => {
    const eff = effectivePlatformValues({ product_name: "", support_email: "help@x.pk", support_phone: null }, defaults);
    expect(eff.product_name).toBe("EasAlpha");
    expect(eff.support_email).toBe("help@x.pk");
    expect(eff.support_phone).toBeNull();
  });
  it("sends blanks as null so the API restores the default", () => {
    expect(platformPayload({ product_name: "  ", support_email: " a@b.pk " })).toEqual({ values: { product_name: null, support_email: "a@b.pk" } });
  });
  it("round-trips GET values into form strings", () => {
    const form = platformForm({ ...defaults, announcement: "Maintenance tonight", announcement_level: "warning" });
    expect(form.support_phone).toBe("");
    expect(form.announcement).toBe("Maintenance tonight");
    expect(form.announcement_level).toBe("warning");
  });
  it("builds a wa.me link from digits only", () => {
    expect(whatsappHref("+92 300 1234567")).toBe("https://wa.me/923001234567");
    expect(whatsappHref(null)).toBeNull();
    expect(whatsappHref("abc")).toBeNull();
  });
});
