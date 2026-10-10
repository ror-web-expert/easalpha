"use client";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Material Design 3 common buttons: full-radius, 40px, Label Large (14px medium, 0.1px tracking).
// primary = filled, secondary = outlined, soft = tonal, ghost = text / standard icon button.
// Hover and press use M3 state layers (8% and 10% of the content colour).
const button = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium tracking-[0.1px] transition-[background-color,box-shadow,color] disabled:pointer-events-none disabled:opacity-40 select-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg hover:bg-primary-hover hover:shadow-[var(--elev-1)] active:shadow-none",
        secondary: "border border-border-strong text-primary hover:bg-primary/8 active:bg-primary/10",
        ghost: "text-fg-secondary hover:bg-fg/8 active:bg-fg/10",
        destructive: "bg-danger text-danger-fg hover:shadow-[var(--elev-1)] hover:brightness-110",
        soft: "bg-primary-soft text-primary-ink hover:shadow-[var(--elev-1)] active:shadow-none",
        accent: "bg-accent text-accent-fg hover:shadow-[var(--elev-1)] hover:brightness-105",
        link: "h-auto rounded-none px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-[13px] has-[>svg:first-child]:pl-2.5",
        md: "h-10 px-6 has-[>svg:first-child]:pl-4",
        lg: "h-12 px-6 text-base has-[>svg:first-child]:pl-5",
        xl: "h-14 px-8 text-base",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> { loading?: boolean }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading, children, disabled, type = "button", ...props }, ref) => (
  <button ref={ref} type={type} className={cn(button({ variant, size }), className)} disabled={disabled || loading} {...props}>
    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
    {children}
  </button>
));
Button.displayName = "Button";
