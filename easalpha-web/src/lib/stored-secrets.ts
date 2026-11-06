"use client";
// S1 (6 Nov 2026): until the API stopped sending it, a branch's tax-authority API token was inside every branch record
// a browser kept: the till's paired device and its PIN session (easalpha.device), the admin login (easalpha.auth) and
// a rider phone (easalpha.rider). Once each store has loaded, its copies are cut down to the public registration
// numbers, which writes localStorage again without the token. Records the API sends now never carry it.
import { useAuthStore } from "@/store/auth";
import { useDeviceStore } from "@/store/device";
import { useRiderStore } from "@/components/rider/store";
import { PUBLIC_TAX_KEYS, publicTaxRegistration } from "@/lib/receipt-format";
import type { Branch, Session } from "@/lib/types";

/** The branch with nothing but the public numbers in its tax registration; the same object when it was clean already. */
export function cleanBranch<T extends Pick<Branch, "tax_registration">>(b: T | null | undefined): T | null | undefined {
  const reg = b?.tax_registration;
  if (!b || !reg || Object.keys(reg).every((k) => (PUBLIC_TAX_KEYS as readonly string[]).includes(k))) return b;
  return { ...b, tax_registration: publicTaxRegistration(reg) };
}

function cleanSession(s: Session | null): Session | null {
  if (!s) return s;
  const branch = cleanBranch(s.branch) ?? null;
  return branch === s.branch ? s : { ...s, branch };
}

function scrubDevice() {
  const d = useDeviceStore.getState();
  const branch = cleanBranch(d.branch) ?? null, session = cleanSession(d.session);
  if (branch !== d.branch || session !== d.session) useDeviceStore.setState({ branch, session });
}

function scrubAuth() {
  const a = useAuthStore.getState();
  const session = cleanSession(a.session);
  if (session !== a.session) useAuthStore.setState({ session });
}

function scrubRider() {
  const r = useRiderStore.getState();
  const branch = cleanBranch(r.branch) ?? null, session = cleanSession(r.session);
  if (branch !== r.branch || session !== r.session) useRiderStore.setState({ branch, session });
}

/** Scrubs each store as soon as it has loaded (and at once if it already has). Returns the unsubscribe. */
export function scrubStoredSecrets(): () => void {
  const stores = [[useDeviceStore, scrubDevice], [useAuthStore, scrubAuth], [useRiderStore, scrubRider]] as const;
  const offs = stores.map(([store, scrub]) => {
    if (store.persist.hasHydrated()) scrub();
    return store.persist.onFinishHydration(scrub);
  });
  return () => offs.forEach((off) => off());
}
