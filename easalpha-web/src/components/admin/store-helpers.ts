// Pure helpers for the Store Profile and branch screens: the country, currency and time zone pickers, and what the
// branch form sends for its tax registration. The country list is the sign-up list, so both screens offer the same.
import { COUNTRIES } from "@/components/site/site-helpers";

/** Zones the API accepts (IANA names such as Asia/Karachi): what this browser knows, plus UTC. */
const FALLBACK_ZONES = [...new Set(["UTC", ...COUNTRIES.map((c) => c.timeZone)])];

export function timeZoneOptions(current?: string | null): string[] {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch { zones = []; }
  const all = new Set([...(zones.length ? zones : FALLBACK_ZONES), "UTC"]);
  // A zone saved before the check (or one this browser lacks) still shows, so opening the form changes nothing.
  if (current) all.add(current);
  return [...all].sort((a, b) => a.localeCompare(b));
}

/** True for a zone name a browser can format in; "Pakistan" or "GMT+5" are not (S14). */
export function isTimeZone(zone: string | null | undefined): boolean {
  if (!zone || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(zone)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; }
}

/** Every currency a sign-up country uses, Pakistan's first; the Store screen offered five (S14). */
export const CURRENCIES: string[] = [...new Set(COUNTRIES.map((c) => c.currency))];

export function currencyOptions(current?: string | null): string[] {
  return current && !CURRENCIES.includes(current) ? [...CURRENCIES, current] : CURRENCIES;
}

export interface TaxForm { authority: string; ntn: string; strn: string; pos_id: string; token: string; token_clear: boolean }

/**
 * The tax registration the branch form sends: the numbers as typed, the token only when a new one was typed, and
 * token_clear to remove the saved one. The API never sends the token back, so an empty box keeps it (S1).
 */
export function taxRegistrationPayload(f: TaxForm): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = { authority: f.authority, ntn: f.ntn.trim(), strn: f.strn.trim(), pos_id: f.pos_id.trim() };
  if (f.token_clear) out.token_clear = true;
  else if (f.token.trim()) out.token = f.token.trim();
  return out;
}
