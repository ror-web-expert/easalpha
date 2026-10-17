"use client";
import { cloneElement, forwardRef, isValidElement, type InputHTMLAttributes, type LabelHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Material Design 3 outlined text field (dense 40px): outline border, extra-small (4px) corners,
// Body Large input text, 2px primary outline on focus.
const base = "flex w-full rounded-[4px] border border-border-strong bg-transparent px-3 text-base text-fg transition-[border-color,box-shadow] placeholder:text-fg-muted hover:border-fg focus-visible:border-primary focus-visible:shadow-[inset_0_0_0_1px_var(--primary)] focus-visible:outline-none disabled:opacity-40";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  props.type === "date" ? <DateInput ref={ref} className={className} {...props} /> : <input ref={ref} className={cn(base, "h-10", className)} {...props} />
));
Input.displayName = "Input";

/**
 * Review 5.4: a native date field shows the browser's locale order, so a Pakistani owner on an en-US browser read
 * 10/17/2026 in a filter while every table said 17 Oct 2026. Decision: every date field shows "17 Oct 2026", the
 * same day-month-year the tables print, whatever the browser locale; the month is a word, so no order is ambiguous.
 * The native input stays the real control (value, events, ref, validation and min/max unchanged, so forms and tests
 * are untouched). Its own text is hidden and the formatted date is drawn over it. A mouse click opens the browser's
 * calendar; keyboard focus shows the native fields for typing; touch keeps the phone's own date wheel.
 */
const DateInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, onChange, onPointerDown, ...props }, ref) => {
  const own = useRef<HTMLInputElement>(null);
  const controlled = props.value !== undefined;
  const [uncontrolled, setUncontrolled] = useState(String(props.defaultValue ?? ""));
  const value = controlled ? String(props.value ?? "") : uncontrolled;
  // An uncontrolled field may get its first value through the ref (a form library) rather than defaultValue.
  useLayoutEffect(() => { if (!controlled && own.current?.value) setUncontrolled(own.current.value); }, [controlled]);
  const setRefs = (el: HTMLInputElement | null) => {
    own.current = el;
    if (typeof ref === "function") ref(el); else if (ref) ref.current = el;
  };
  const inline = /(^|\s)w-(auto|\d|\[)/.test(className ?? "");
  const small = /(^|\s)text-xs(\s|$)/.test(className ?? "");
  return (
    <span className={cn("relative", inline ? "inline-flex" : "flex w-full")}>
      <input ref={setRefs} {...props}
        className={cn(base, "h-10 text-transparent focus:text-fg [&::-webkit-datetime-edit]:text-inherit", "peer", className)}
        onChange={(e) => { if (!controlled) setUncontrolled(e.target.value); onChange?.(e); }}
        onPointerDown={(e) => {
          onPointerDown?.(e);
          const el = e.currentTarget;
          if (e.pointerType !== "mouse" || props.disabled || props.readOnly || typeof el.showPicker !== "function") return;
          e.preventDefault();
          try { el.showPicker(); } catch { el.focus(); }
        }} />
      <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 left-0 right-8 flex items-center overflow-hidden whitespace-nowrap px-3 peer-focus:invisible", small ? "text-xs" : "text-base", value ? "text-fg" : "text-fg-muted", props.disabled && "opacity-40")}>
        {value ? formatDay(value) : "Pick a date"}
      </span>
    </span>
  );
});
DateInput.displayName = "DateInput";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-17" as "17 Oct 2026" (the tables' format), without a timezone shift. */
export function formatDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

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

export function Field({ label, hint, error, children, className, htmlFor: given }: { label?: string; hint?: string; error?: string; children: React.ReactNode; className?: string; htmlFor?: string }) {
  // The label points at the control: a single child element without its own id gets one, so screen readers and
  // Lighthouse see the association (clicking the label focuses the field too). A control wrapped in another element
  // (an input with a button inside a div) passes htmlFor and carries that id itself.
  const generated = useId();
  const child = !given && isValidElement<{ id?: string }>(children) && !children.props.id ? cloneElement(children, { id: generated }) : children;
  const htmlFor = given ?? (isValidElement<{ id?: string }>(children) ? (children.props.id ?? generated) : undefined);
  return (
    <div className={cn("space-y-0", className)}>
      {label ? <Label htmlFor={htmlFor}>{label}</Label> : null}
      {child}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : hint ? <p className="mt-1 text-xs text-fg-muted">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode }) {
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
