import { describe, expect, it } from "vitest";
import {
  PLANS, TRIAL_DAYS, displayPriceMinor, formatMoney, isValidEmail, isValidPakistaniPhone, mailtoLink, monthlyMinor,
  normalizePhone, passwordStrength, signupPayload, toggleCurrency, validateSignup, whatsappLink, yearlyMinor,
  yearlyPerMonthMinor, yearlySavingMinor, type SignupInput, UI, t, toggleLang, isLang, telLink,
} from "./site-helpers";

const starter = PLANS[0];
const pro = PLANS[1];
const business = PLANS[2];

describe("plans", () => {
  it("mirrors the API seed prices", () => {
    expect(monthlyMinor(starter, "PKR")).toBe(250000);
    expect(monthlyMinor(pro, "PKR")).toBe(499900);
    expect(monthlyMinor(business, "PKR")).toBe(899900);
    expect(monthlyMinor(starter, "USD")).toBe(1900);
    expect(monthlyMinor(pro, "USD")).toBe(3900);
    expect(monthlyMinor(business, "USD")).toBe(6900);
  });
  it("carries the seed limits", () => {
    expect(starter.limits).toEqual({ tills: 1, staff: 3, branches: 1, whatsappMessages: 300 });
    expect(pro.limits.staff).toBeNull();
    expect(business.limits.branches).toBe(20);
  });
  it("uses the API trial length", () => {
    expect(TRIAL_DAYS).toBe(90);
  });
});

describe("yearly maths", () => {
  it("charges ten months for a year", () => {
    expect(yearlyMinor(250000)).toBe(2500000);
    expect(yearlySavingMinor(250000)).toBe(500000);
  });
  it("spreads the yearly price over twelve months", () => {
    expect(yearlyPerMonthMinor(250000)).toBe(208333);
    expect(yearlyPerMonthMinor(1900)).toBe(1583);
  });
  it("shows the monthly price or the yearly equivalent", () => {
    expect(displayPriceMinor(pro, "PKR", "monthly")).toBe(499900);
    expect(displayPriceMinor(pro, "PKR", "yearly")).toBe(416583);
    expect(displayPriceMinor(pro, "USD", "yearly")).toBe(3250);
  });
});

describe("formatMoney", () => {
  it("formats rupees with a thousands separator and no decimals when whole", () => {
    expect(formatMoney(250000, "PKR")).toBe("Rs 2,500");
    expect(formatMoney(899900, "PKR")).toBe("Rs 8,999");
  });
  it("formats dollars", () => {
    expect(formatMoney(1900, "USD")).toBe("$19");
    expect(formatMoney(1583, "USD")).toBe("$15.83");
  });
  it("keeps two decimals when there are minor units", () => {
    expect(formatMoney(208333, "PKR")).toBe("Rs 2,083.33");
  });
});

describe("currency toggle", () => {
  it("flips between PKR and USD", () => {
    expect(toggleCurrency("PKR")).toBe("USD");
    expect(toggleCurrency("USD")).toBe("PKR");
  });
});

describe("email", () => {
  it("accepts ordinary addresses", () => {
    expect(isValidEmail("owner@restaurant.pk")).toBe(true);
    expect(isValidEmail("  a.b+c@example.com ")).toBe(true);
  });
  it("rejects malformed addresses", () => {
    expect(isValidEmail("owner")).toBe(false);
    expect(isValidEmail("owner@")).toBe(false);
    expect(isValidEmail("owner@x")).toBe(false);
    expect(isValidEmail("a b@example.com")).toBe(false);
  });
});

describe("phone", () => {
  it("normalises local and international spellings to +92", () => {
    expect(normalizePhone("0300 1234567")).toBe("+923001234567");
    expect(normalizePhone("0300-1234567")).toBe("+923001234567");
    expect(normalizePhone("92 300 1234567")).toBe("+923001234567");
    expect(normalizePhone("+92 (300) 1234567")).toBe("+923001234567");
    expect(normalizePhone("00923001234567")).toBe("+923001234567");
  });
  it("accepts a valid Pakistani number", () => {
    expect(isValidPakistaniPhone("+923001234567")).toBe(true);
    expect(isValidPakistaniPhone("03001234567")).toBe(true);
  });
  it("rejects other numbers", () => {
    expect(isValidPakistaniPhone("+92300123456")).toBe(false);
    expect(isValidPakistaniPhone("+4420123456789")).toBe(false);
    expect(isValidPakistaniPhone("")).toBe(false);
    expect(isValidPakistaniPhone("+92300123456789")).toBe(false);
  });
});

describe("password", () => {
  it("grades by length and character variety", () => {
    expect(passwordStrength("short")).toBe("too short");
    expect(passwordStrength("abcdefgh")).toBe("weak");
    expect(passwordStrength("abcdefg1")).toBe("good");
    expect(passwordStrength("Abcdefg1234!")).toBe("strong");
  });
});

describe("validateSignup", () => {
  const good: SignupInput = { name: "Ali Raza", businessName: "Karachi Grill", email: "ali@karachigrill.pk", phone: "0300 1234567", password: "spicy-biryani-1", agree: true };
  it("passes a complete form", () => {
    expect(validateSignup(good)).toEqual({});
  });
  it("reports every missing field", () => {
    const errors = validateSignup({ name: "", businessName: "K", email: "nope", phone: "123", password: "1234567", agree: false });
    expect(Object.keys(errors).sort()).toEqual(["agree", "businessName", "email", "name", "password", "phone"]);
  });
  it("builds the API payload with a normalised phone and lower-case email", () => {
    expect(signupPayload({ ...good, email: " Ali@KarachiGrill.pk " })).toEqual({
      name: "Ali Raza", business_name: "Karachi Grill", email: "ali@karachigrill.pk", password: "spicy-biryani-1", phone: "+923001234567",
    });
  });
});

describe("contact links", () => {
  it("builds a WhatsApp click-to-chat link", () => {
    expect(whatsappLink()).toBe("https://wa.me/923001234567");
    expect(whatsappLink("Hi Servio")).toBe("https://wa.me/923001234567?text=Hi%20Servio");
  });
  it("builds a mailto with an encoded subject and body", () => {
    expect(mailtoLink("Demo request", "Name: Ali\nPhone: +92")).toBe("mailto:hello@servio.pk?subject=Demo%20request&body=Name%3A%20Ali%0APhone%3A%20%2B92");
  });
});

describe("language dictionary", () => {
  it("has English and Urdu for every key", () => {
    for (const [k, v] of Object.entries(UI)) {
      expect(v.en.trim().length, k).toBeGreaterThan(0);
      expect(v.ur.trim().length, k).toBeGreaterThan(0);
      expect(/[؀-ۿ]/.test(v.ur), `${k} Urdu script`).toBe(true);
    }
  });
  it("translates and falls back to English", () => {
    expect(t("cta.start", "en")).toBe("Start free");
    expect(t("cta.start", "ur")).toBe("مفت شروع کریں");
    expect(t("hero.trial", "en")).toBe("90-day free trial");
  });
  it("toggles and validates languages", () => {
    expect(toggleLang("en")).toBe("ur");
    expect(toggleLang("ur")).toBe("en");
    expect(isLang("ur")).toBe(true);
    expect(isLang("fr")).toBe(false);
  });
  it("builds a phone link", () => {
    expect(telLink()).toBe("tel:+923001234567");
  });
});
