import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badge = cva("inline-flex h-[22px] items-center gap-1 rounded-full px-2.5 text-xs font-semibold leading-4 whitespace-nowrap", {
  variants: {
    variant: {
      neutral: "bg-primary-soft/60 text-fg-secondary",
      primary: "bg-primary-soft text-primary-ink",
      success: "bg-success-soft text-success-ink",
      danger: "bg-danger-soft text-danger-ink",
      warning: "bg-warning-soft text-warning-ink",
      info: "bg-primary-soft text-primary",
      accent: "bg-accent-soft text-accent-ink",
      brand: "bg-cta-soft text-cta-ink",
      outline: "border border-border-strong text-fg-secondary",
    },
  },
  defaultVariants: { variant: "neutral" },
});

/** A plain lowercase word or phrase ("open", "not counted") is shown in sentence case so every chip reads the same;
 *  anything that looks like a code (digits, dots, colons, slashes) is left exactly as given. */
export function sentenceCase(children: React.ReactNode): React.ReactNode {
  return typeof children === "string" && /^[a-z][a-z\s'-]*$/.test(children) ? children.charAt(0).toUpperCase() + children.slice(1) : children;
}

export function Badge({ className, variant, children, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ variant }), className)} {...props}>{sentenceCase(children)}</span>;
}

export type BadgeVariant = NonNullable<VariantProps<typeof badge>["variant"]>;

export function orderStatusVariant(status: string | null | undefined): BadgeVariant {
  switch (status) {
    case "draft": case "held": return "neutral";
    case "placed": case "preparing": case "dispatched": return "info";
    case "ready": case "served": return "success";
    case "paid": case "closed": return "primary";
    case "voided": case "refunded": return "danger";
    default: return "neutral";
  }
}

export function paymentStatusVariant(status: string | null | undefined): BadgeVariant {
  switch (status) {
    case "paid": return "success";
    case "partial": return "warning";
    case "refunded": return "danger";
    default: return "warning";
  }
}

export function orderTypeVariant(t: string | null | undefined): BadgeVariant {
  switch (t) {
    case "dine_in": return "primary";
    case "takeaway": return "accent";
    case "delivery": return "info";
    default: return "neutral";
  }
}

export function tableStatusVariant(s: string | null | undefined): BadgeVariant {
  switch (s) {
    case "available": return "success";
    case "occupied": return "warning";
    case "reserved": return "info";
    case "bill_requested": return "primary";
    default: return "neutral";
  }
}
