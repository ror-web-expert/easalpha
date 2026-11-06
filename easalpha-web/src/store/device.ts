"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Branch, Business, Device, Session } from "@/lib/types";
import { useCartStore } from "@/store/cart";
import { clearRecentCustomers } from "@/lib/pos-customers";
import { clearStashes, forgetSessionKeys } from "@/lib/session-stash";

interface DeviceState {
  deviceToken: string | null;
  device: Device | null;
  business: Business | null;
  branch: Branch | null;
  /** PIN session on a paired till (app "pos" or "kitchen"). */
  session: Session | null;
  lastActivityAt: number;
  lockMinutes: number;
  hydrated: boolean;
  pair: (p: { device_token: string; device: Device; business: Business; branch: Branch }) => void;
  unpair: () => void;
  setSession: (s: Session | null) => void;
  setTokens: (access: string, refresh: string) => void;
  touch: () => void;
  lock: () => void;
}

export const useDeviceStore = create<DeviceState>()(
  persist(
    (set) => ({
      deviceToken: null,
      device: null,
      business: null,
      branch: null,
      session: null,
      lastActivityAt: Date.now(),
      lockMinutes: 5,
      hydrated: false,
      pair: ({ device_token, device, business, branch }) => set({ deviceToken: device_token, device, business, branch, session: null }),
      unpair: () => {
        // The next pairing may be another business: the cart, the recent-customers list and the sessions kept for an
        // offline unlock (lib/session-stash.ts) go with the token.
        useCartStore.getState().clear();
        clearRecentCustomers();
        clearStashes();
        set({ deviceToken: null, device: null, business: null, branch: null, session: null });
      },
      setSession: (session) => {
        const member = session?.membership?.id;
        if (member) useCartStore.getState().signIn(member);
        set({ session, lastActivityAt: Date.now() });
      },
      setTokens: (access_token, refresh_token) =>
        set((s) => (s.session ? { session: { ...s.session, access_token, refresh_token } } : {})),
      touch: () => set({ lastActivityAt: Date.now() }),
      // A lock keeps the cart: the same cashier unlocks and carries on (signIn drops it for anyone else). The key from
      // their PIN goes, so only the PIN opens their offline copy again (lib/session-stash.ts).
      lock: () => { forgetSessionKeys(); set({ session: null }); },
    }),
    {
      name: "easalpha.device",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ deviceToken: s.deviceToken, device: s.device, business: s.business, branch: s.branch, session: s.session, lockMinutes: s.lockMinutes }),
      onRehydrateStorage: () => () => useDeviceStore.setState({ hydrated: true }),
    },
  ),
);

export function usePosCan() {
  const perms = useDeviceStore((s) => s.session?.permissions);
  return (...codes: string[]) => !!perms && codes.some((c) => perms.includes(c));
}
