"use client";
import { create } from "zustand";

export type Theme = "system" | "light" | "dark";
const KEY = "servio.theme";

function apply(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

interface ThemeState { theme: Theme; setTheme: (t: Theme) => void; init: () => void }

export const useThemeStore = create<ThemeState>((set) => ({
  theme: "system",
  setTheme: (theme) => {
    try { localStorage.setItem(KEY, theme); } catch {}
    apply(theme);
    set({ theme });
  },
  init: () => {
    let theme: Theme = "system";
    try { theme = (localStorage.getItem(KEY) as Theme) || "system"; } catch {}
    apply(theme);
    set({ theme });
  },
}));
