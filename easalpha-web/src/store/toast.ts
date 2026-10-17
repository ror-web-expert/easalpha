"use client";
import { create } from "zustand";

export interface Toast { id: number; title: string; description?: string; variant: "success" | "error" | "info"; action?: { label: string; onClick: () => void }; duration?: number }

interface ToastState { toasts: Toast[]; push: (t: Omit<Toast, "id">) => void; dismiss: (id: number) => void }

let seq = 1;
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = seq++;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.duration ?? (t.variant === "error" ? 6000 : 4000));
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  success: (title: string, description?: string) => useToastStore.getState().push({ title, description, variant: "success" }),
  error: (title: string, description?: string, action?: Toast["action"]) => useToastStore.getState().push({ title, description, variant: "error", action }),
  info: (title: string, description?: string) => useToastStore.getState().push({ title, description, variant: "info" }),
  /** Review 3.8: a removal the user can take back for five seconds. */
  undo: (title: string, onUndo: () => void, description?: string) => useToastStore.getState().push({ title, description, variant: "info", duration: 5000, action: { label: "Undo", onClick: onUndo } }),
};
