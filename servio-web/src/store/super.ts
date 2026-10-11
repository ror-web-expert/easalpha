"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { SuperAdmin } from "@/lib/types";

interface SuperState {
  token: string | null;
  admin: SuperAdmin | null;
  hydrated: boolean;
  setLogin: (token: string, admin: SuperAdmin) => void;
  clear: () => void;
}

// Owner panel (/super) login. A separate "super" token from POST /super/login; never an admin session.
export const useSuperStore = create<SuperState>()(
  persist(
    (set) => ({
      token: null,
      admin: null,
      hydrated: false,
      setLogin: (token, admin) => set({ token, admin }),
      clear: () => set({ token: null, admin: null }),
    }),
    {
      name: "servio.super",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ token: s.token, admin: s.admin }),
      onRehydrateStorage: () => () => useSuperStore.setState({ hydrated: true }),
    },
  ),
);
