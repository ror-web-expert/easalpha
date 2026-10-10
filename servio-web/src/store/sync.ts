"use client";
import { create } from "zustand";

export type SyncStatus = "online" | "offline" | "syncing";
interface SyncState { status: SyncStatus; pending: number; attention: number; lastSyncAt: string | null; lastError: string | null; set: (p: Partial<SyncState>) => void }

export const useSyncStore = create<SyncState>((set) => ({ status: "online", pending: 0, attention: 0, lastSyncAt: null, lastError: null, set: (p) => set(p) }));
