"use client";
// The rider app keeps its own pairing and PIN session, apart from the till (easalpha.device) and the admin login
// (easalpha.auth), so a phone paired as a rider device never shares state with a till in the same browser.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Branch, Business, Device, RiderDeliveries, RiderFloat, Session } from "@/lib/types";

interface RiderState {
  deviceToken: string | null;
  device: Device | null;
  business: Business | null;
  branch: Branch | null;
  session: Session | null;
  /** The last lists the server sent, so the app opens with the rider's deliveries even with no signal. */
  cache: { deliveries: RiderDeliveries | null; float: RiderFloat | null; at: number } | null;
  hydrated: boolean;
  pair: (p: { device_token: string; device: Device; business: Business; branch: Branch }) => void;
  unpair: () => void;
  setSession: (s: Session | null) => void;
  signOut: () => void;
  setCache: (c: { deliveries?: RiderDeliveries; float?: RiderFloat }) => void;
}

export const useRiderStore = create<RiderState>()(
  persist(
    (set) => ({
      deviceToken: null,
      device: null,
      business: null,
      branch: null,
      session: null,
      cache: null,
      hydrated: false,
      pair: ({ device_token, device, business, branch }) => set({ deviceToken: device_token, device, business, branch, session: null, cache: null }),
      unpair: () => set({ deviceToken: null, device: null, business: null, branch: null, session: null, cache: null }),
      setSession: (session) => set({ session }),
      // The next rider on this phone must not see the last one's deliveries while their own load.
      signOut: () => set({ session: null, cache: null }),
      setCache: (c) => set((s) => ({ cache: { deliveries: c.deliveries ?? s.cache?.deliveries ?? null, float: c.float ?? s.cache?.float ?? null, at: Date.now() } })),
    }),
    {
      name: "easalpha.rider",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ deviceToken: s.deviceToken, device: s.device, business: s.business, branch: s.branch, session: s.session, cache: s.cache }),
      onRehydrateStorage: () => () => useRiderStore.setState({ hydrated: true }),
    },
  ),
);
