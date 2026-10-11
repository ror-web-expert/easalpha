"use client";
import { create } from "zustand";
import { LANG_KEY, isLang, type Lang } from "./site-helpers";

interface LangState { lang: Lang; setLang: (l: Lang) => void; init: () => void }

/** Site language for the hero, buttons and headings. Starts in English on the server; init() reads the saved choice after mount. */
export const useLangStore = create<LangState>((set) => ({
  lang: "en",
  setLang: (lang) => {
    try { localStorage.setItem(LANG_KEY, lang); } catch {}
    set({ lang });
  },
  init: () => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (isLang(saved)) set({ lang: saved });
    } catch {}
  },
}));
