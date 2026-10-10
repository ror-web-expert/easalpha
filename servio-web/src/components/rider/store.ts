"use client";
// The rider app keeps its own pairing and PIN session, apart from the till (servio.device) and the admin login
// (servio.auth), so a phone paired as a rider device never shares state with a till in the same browser.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Branch, Business, Device, Session } from "@/lib/types";

interface RiderState {
  deviceToken: string | null;
  device: Device | null;
  business: Business | null;
  branch: Branch | null;
  session: Session | null;
  hydrated: boolean;
  pair: (p: { device_token: string; device: Device; business: Business; branch: Branch }) => void;
  unpair: () => void;
  setSession: (s: Session | null) => void;
  signOut: () => void;
}

export const useRiderStore = create<RiderState>()(
  persist(
    (set) => ({
      deviceToken: null,
      device: null,
      business: null,
      branch: null,
      session: null,
      hydrated: false,
      pair: ({ device_token, device, business, branch }) => set({ deviceToken: device_token, device, business, branch, session: null }),
      unpair: () => set({ deviceToken: null, device: null, business: null, branch: null, session: null }),
      setSession: (session) => set({ session }),
      signOut: () => set({ session: null }),
    }),
    {
      name: "servio.rider",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ deviceToken: s.deviceToken, device: s.device, business: s.business, branch: s.branch, session: s.session }),
      onRehydrateStorage: () => () => useRiderStore.setState({ hydrated: true }),
    },
  ),
);
