import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badge = cva("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium leading-4 tracking-[0.5px] whitespace-nowrap", {
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

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ variant }), className)} {...props} />;
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
