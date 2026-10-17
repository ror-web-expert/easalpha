"use client";
// The rider's outbox: every status tap (Picked up, Arrived, Delivered with the cash, Failed with the reason) is saved
// on the phone first and sent in the order it was made. With signal it goes at once; without, it waits and is sent when
// the connection returns, carrying the time of the tap. Kept in localStorage so a closed app or a flat battery loses
// nothing.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { errorMessage } from "@/lib/api";
import { riderApi } from "./api";
import { outcomeFor, statusBody, type OutboxItem } from "./outbox-helpers";
import { useRiderStore } from "./store";

interface OutboxState {
  items: OutboxItem[];
  add: (item: OutboxItem) => void;
  remove: (id: string) => void;
  patch: (id: string, p: Partial<OutboxItem>) => void;
}

export const useOutbox = create<OutboxState>()(
  persist(
    (set) => ({
      items: [],
      add: (item) => set((s) => ({ items: [...s.items, item] })),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      patch: (id, p) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...p } : i)) })),
    }),
    { name: "easalpha.rider.outbox", storage: createJSONStorage(() => localStorage) },
  ),
);

export interface FlushResult { sent: OutboxItem[]; dropped: { item: OutboxItem; message: string; status: number }[]; waiting: number }

let flushing: Promise<FlushResult> | null = null;

/** Sends this rider's queued taps in order. Stops at the first one that has to wait (no signal), so order is kept. */
export function flushOutbox(): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = (async () => {
    const result: FlushResult = { sent: [], dropped: [], waiting: 0 };
    const membershipId = useRiderStore.getState().session?.membership?.id ?? null;
    if (!useRiderStore.getState().session) { result.waiting = useOutbox.getState().items.length; return result; }
    const queue = useOutbox.getState().items.filter((i) => i.membershipId === membershipId);
    for (const item of queue) {
      try {
        await riderApi(`/rider/deliveries/${item.deliveryId}/status`, { method: "POST", body: statusBody(item), timeoutMs: 15000 });
        useOutbox.getState().remove(item.id);
        result.sent.push(item);
      } catch (e) {
        if (outcomeFor(e) === "drop") {
          useOutbox.getState().remove(item.id);
          result.dropped.push({ item, message: errorMessage(e), status: (e as { status?: number }).status ?? 0 });
        } else {
          useOutbox.getState().patch(item.id, { attempts: item.attempts + 1, lastError: errorMessage(e) });
          break;
        }
      }
    }
    result.waiting = useOutbox.getState().items.filter((i) => i.membershipId === membershipId).length;
    return result;
  })().finally(() => { flushing = null; });
  return flushing;
}

export function newOutboxId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
