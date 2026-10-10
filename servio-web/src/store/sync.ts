"use client";
import { create } from "zustand";

export type SyncStatus = "online" | "offline" | "syncing";
/** SPEC "Pending Orders" reminder: open orders today and from previous days (GET /me pills, or the local orders when offline). */
export interface OpenCounts { today: number; previous: number }
interface SyncState { status: SyncStatus; pending: number; attention: number; lastSyncAt: string | null; lastError: string | null; openCounts: OpenCounts | null; set: (p: Partial<SyncState>) => void }

export const useSyncStore = create<SyncState>((set) => ({ status: "online", pending: 0, attention: 0, lastSyncAt: null, lastError: null, openCounts: null, set: (p) => set(p) }));
