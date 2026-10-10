"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { toast } from "@/store/toast";

/** Simple {data: T[]} list endpoint. */
export function useList<T>(key: string, path: string, query: Record<string, string | number | boolean | null | undefined> = {}, enabled = true) {
  return useQuery({ queryKey: [key, query], queryFn: () => api<{ data: T[] }>(path, { query }), enabled, select: (r) => r.data });
}

/** Save (POST or PATCH) with invalidation + toast. */
export function useSave<TIn = Record<string, unknown>, TOut = unknown>(keys: string[], path: (input: TIn & { id?: string }) => string, opts: { method?: "PATCH" | "PUT"; onSuccess?: (out: TOut) => void; success?: string } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TIn & { id?: string }) => api<TOut>(path(input), { method: input.id ? (opts.method ?? "PATCH") : "POST", body: input }),
    onSuccess: (out) => { keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] })); toast.success(opts.success ?? "Saved"); opts.onSuccess?.(out); },
    onError: (e) => toast.error("Could not save", errorMessage(e)),
  });
}

export function useRemove(keys: string[], path: (id: string) => string, success = "Removed") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(path(id), { method: "DELETE" }),
    onSuccess: () => { keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] })); toast.success(success); },
    onError: (e) => toast.error("Could not remove", errorMessage(e)),
  });
}

export function useAction<TIn = unknown, TOut = unknown>(keys: string[], fn: (input: TIn) => Promise<TOut>, success?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] })); if (success) toast.success(success); },
    onError: (e) => toast.error("Action failed", errorMessage(e)),
  });
}
