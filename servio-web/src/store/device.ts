"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Branch, Business, Device, Session } from "@/lib/types";

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
      unpair: () => set({ deviceToken: null, device: null, business: null, branch: null, session: null }),
      setSession: (session) => set({ session, lastActivityAt: Date.now() }),
      setTokens: (access_token, refresh_token) =>
        set((s) => (s.session ? { session: { ...s.session, access_token, refresh_token } } : {})),
      touch: () => set({ lastActivityAt: Date.now() }),
      lock: () => set({ session: null }),
    }),
    {
      name: "servio.device",
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
