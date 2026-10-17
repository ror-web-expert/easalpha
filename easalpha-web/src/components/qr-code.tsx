"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

/** A QR code for a link, drawn as SVG (sharp when printed), with an optional "Download PNG" for printing on a card. */
export function QrCode({ value, size = 176, label, download, className }: { value: string; size?: number; label?: string; download?: string; className?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then((s) => { if (live) setSvg(s); }).catch(() => setSvg(""));
    return () => { live = false; };
  }, [value]);
  const save = async () => {
    const url = await QRCode.toDataURL(value, { width: 1024, margin: 2, errorCorrectionLevel: "M" });
    const a = document.createElement("a");
    a.href = url; a.download = `${download ?? "qr-code"}.png`; a.click();
  };
  return (
    <div className={cn("inline-flex flex-col items-center gap-2", className)}>
      <div role="img" aria-label={label ?? `QR code for ${value}`} className="rounded-xl bg-white p-2 ring-1 ring-border" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />
      {download ? <button type="button" onClick={save} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-primary hover:bg-primary-soft"><Download className="h-3.5 w-3.5" /> Download PNG</button> : null}
    </div>
  );
}
