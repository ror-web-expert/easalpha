"use client";
import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// Material Design 3 outlined text field (dense 40px): outline border, extra-small (4px) corners,
// Body Large input text, 2px primary outline on focus.
const base = "flex w-full rounded-[4px] border border-border-strong bg-transparent px-3 text-base text-fg transition-[border-color,box-shadow] placeholder:text-fg-muted hover:border-fg focus-visible:border-primary focus-visible:shadow-[inset_0_0_0_1px_var(--primary)] focus-visible:outline-none disabled:opacity-40";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(base, "h-10", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(base, "min-h-20 py-2.5", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(base, "h-10 appearance-none bg-transparent pr-9", className)} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-xs font-medium tracking-[0.4px] text-fg-secondary", className)} {...props} />;
}

export function Field({ label, hint, error, children, className }: { label?: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-0", className)}>
      {label ? <Label>{label}</Label> : null}
      {children}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : hint ? <p className="mt-1 text-xs text-fg-muted">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className={cn("flex w-fit cursor-pointer items-center gap-3 text-sm", className)}>
      <input type="checkbox" className="h-[18px] w-[18px] shrink-0 rounded-[2px] accent-[var(--primary)]" {...props} />
      {label}
    </label>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <label className={cn("inline-flex items-center gap-3 text-sm", disabled ? "opacity-40" : "cursor-pointer")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn("relative h-8 w-[52px] shrink-0 rounded-full border-2 transition-colors", checked ? "border-primary bg-primary" : "border-border-strong bg-muted")}
      >
        <span className={cn("absolute top-1/2 -translate-y-1/2 rounded-full transition-all", checked ? "left-[22px] h-6 w-6 bg-primary-fg" : "left-[6px] h-4 w-4 bg-border-strong")} />
      </button>
      {label}
    </label>
  );
}

/** Money in major units; value/onChange in minor units. */
export function MoneyInput({ value, onChange, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { value: number; onChange: (minor: number) => void }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-fg-muted">Rs</span>
      <Input
        type="number"
        inputMode="decimal"
        step="1"
        className={cn("pl-9 tabular", className)}
        value={value === 0 ? "" : value / 100}
        onChange={(e) => onChange(Math.round(parseFloat(e.target.value || "0") * 100) || 0)}
        {...props}
      />
    </div>
  );
}
