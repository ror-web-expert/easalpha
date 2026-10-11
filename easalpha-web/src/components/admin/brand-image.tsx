"use client";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { isImageUrl } from "@/components/admin/branding-helpers";

export type BrandImageKind = "logo" | "cover" | "favicon";

/**
 * A brand image that always renders something: logos and favicons sit object-contain on a checkered or white
 * backdrop (so transparent PNGs read), covers fill with object-cover, and a missing or broken URL shows a
 * placeholder icon instead of the browser's broken-image glyph. The caller sets the box size via className.
 */
export function BrandImage({ src, alt = "", kind = "logo", className, imgClassName, placeholder: Placeholder = ImageIcon, surface = "checkered", onError }: {
  src: string | null | undefined; alt?: string; kind?: BrandImageKind; className?: string; imgClassName?: string;
  /** Icon shown when there is no image or it failed to load. */
  placeholder?: LucideIcon;
  /** Backdrop behind contain-fit images; "none" lets the parent's background through (storefront header, receipt). */
  surface?: "checkered" | "white" | "none";
  onError?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  // A new URL gets a fresh chance; the error state belongs to the URL that failed.
  useEffect(() => { setFailed(false); }, [src]);
  const valid = isImageUrl(src) && !failed;
  const contain = kind !== "cover";
  return (
    <div
      data-kind={kind}
      data-state={valid ? "image" : "placeholder"}
      className={cn("relative grid shrink-0 place-items-center overflow-hidden", contain && surface === "checkered" && "brand-checkered", contain && surface === "white" && "bg-white", className)}
    >
      {valid ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src as string} alt={alt} className={cn("h-full w-full", contain ? "object-contain" : "object-cover", imgClassName)} onError={() => { setFailed(true); onError?.(); }} draggable={false} />
      ) : (
        <Placeholder aria-hidden="true" className={cn("text-fg-muted", kind === "favicon" ? "h-3 w-3" : "h-6 w-6")} />
      )}
    </div>
  );
}
