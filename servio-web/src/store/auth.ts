"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Session } from "@/lib/types";

interface AuthState {
  session: Session | null;
  branchId: string | null;
  hydrated: boolean;
  setSession: (s: Session | null) => void;
  setTokens: (access: string, refresh: string) => void;
  setBranch: (id: string | null) => void;
  clear: () => void;
}

// Admin (web) login. Tokens live in localStorage only; never in cookies.
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      branchId: null,
      hydrated: false,
      setSession: (session) => set({ session, branchId: session?.branch?.id ?? null }),
      setTokens: (access_token, refresh_token) =>
        set((s) => (s.session ? { session: { ...s.session, access_token, refresh_token } } : {})),
      setBranch: (branchId) => set({ branchId }),
      clear: () => set({ session: null, branchId: null }),
    }),
    {
      name: "servio.auth",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ session: s.session, branchId: s.branchId }),
      onRehydrateStorage: () => () => useAuthStore.setState({ hydrated: true }),
    },
  ),
);

export function hasPermission(perms: string[] | undefined, ...codes: string[]) {
  if (!perms) return false;
  return codes.some((c) => perms.includes(c));
}

export function useCan() {
  const perms = useAuthStore((s) => s.session?.permissions);
  return (...codes: string[]) => hasPermission(perms, ...codes);
}
