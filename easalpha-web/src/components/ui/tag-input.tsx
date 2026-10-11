"use client";
import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Comma/Enter separated tags (areas, phones, emails). */
export function TagInput({ value, onChange, placeholder, className, validate }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; className?: string; validate?: (s: string) => boolean }) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const parts = draft.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean).filter((s) => !validate || validate(s));
    if (parts.length) onChange([...value, ...parts.filter((p) => !value.includes(p))]);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); }
    if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div className={cn("flex min-h-10 w-full flex-wrap items-center gap-1 rounded-md border bg-card px-2 py-1 text-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30", className)} onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}>
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
          {t}
          <button type="button" className="text-fg-muted hover:text-fg" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove ${t}`}><X className="h-3 w-3" /></button>
        </span>
      ))}
      <input className="min-w-24 flex-1 bg-transparent px-1 py-1 outline-none placeholder:text-fg-muted" value={draft} placeholder={value.length ? "" : placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={commit} />
    </div>
  );
}
