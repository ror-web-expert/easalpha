"use client";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, type RequestOptions } from "@/lib/api";
import { useSuperStore } from "@/store/super";

export type SuperRequest = Omit<RequestOptions, "auth" | "headers">;

/** One super-token call. Throws ApiError like api(); the caller decides what a 401 means. */
export function superFetch<T = unknown>(token: string | null, path: string, opts: SuperRequest = {}): Promise<T> {
  return api<T>(path, { ...opts, auth: "none", headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

/** api() bound to the super token. Any 401 clears the owner login and sends the tab to /super/login. */
export function useSuperApi() {
  const router = useRouter();
  const token = useSuperStore((s) => s.token);
  return useCallback(
    async <T = unknown>(path: string, opts: SuperRequest = {}): Promise<T> => {
      try {
        return await superFetch<T>(token, path, opts);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          useSuperStore.getState().clear();
          router.replace("/super/login");
        }
        throw e;
      }
    },
    [token, router],
  );
}

export const superKey = (...parts: unknown[]) => ["super", ...parts] as const;
