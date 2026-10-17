"use client";
import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import type { Cart } from "@/store/cart";
import { buildLocalReceipt, cartToLocal } from "@/lib/pos-actions";
import { printJob, receiptLines, receiptSettings } from "@/lib/print";
import { useCatalogStore } from "@/store/catalog";
import { toast } from "@/store/toast";
import { Button, Dialog } from "@/components/ui";
import { ReceiptView } from "./receipt";

/**
 * Review 3.10: the bill as it will print, before anything is printed or paid. Built from the cart with the same
 * receipt builder and the same receipt view the paid receipt uses, so the preview is the printed layout: the lines
 * with their options and notes, the bill block and BALANCE DUE. Print bill sends exactly these lines to the printer.
 */
export function BillPreviewDialog({ open, onClose, cart }: { open: boolean; onClose: () => void; cart: Cart }) {
  const settings = useCatalogStore((s) => s.catalog?.business.settings);
  const [printing, setPrinting] = useState(false);
  const receipt = useMemo(() => {
    if (!open || !cart.lines.length) return null;
    const r = buildLocalReceipt(cartToLocal(cart, cart.status || "draft"));
    // An order not placed yet has the server's "draft" label; the bill says what the cashier calls it.
    return r.order.label && r.order.label !== "draft" ? r : { ...r, order: { ...r.order, label: "New order" } };
  }, [open, cart]);
  const branding = receiptSettings(settings, receipt);
  const print = async () => {
    if (!receipt) return;
    setPrinting(true);
    const r = await printJob({ role: "receipt", lines: receiptLines(receipt, { settings }) }, { settings });
    setPrinting(false);
    if (!r.ok) toast.error("Could not print", r.error);
    else toast.success("Bill printed");
  };
  return (
    <Dialog open={open && !!receipt} onClose={onClose} title="Bill preview" description="Exactly what the printer will print. Nothing is charged or saved." size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button onClick={print} loading={printing}><Printer className="h-4 w-4" /> Print bill</Button></>}>
      {receipt ? (
        <div className="print-area mx-auto max-w-sm rounded-lg border bg-white p-2">
          <ReceiptView r={receipt} branding={{ secondaryPhone: branding.secondaryPhone, footerQrUrl: branding.footerQrUrl, showLogo: branding.showLogo, paper: branding.paper }} />
        </div>
      ) : null}
    </Dialog>
  );
}
