"use client";
import { useState } from "react";
import { Printer, MessageCircle, Check } from "lucide-react";
import type { Receipt } from "@/lib/types";
import { api, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { Button, Dialog, Input } from "@/components/ui";
import { ReceiptView } from "./receipt";
import { toast } from "@/store/toast";
import { isOnline } from "@/lib/sync";
import { useCatalogStore } from "@/store/catalog";
import { printJob, receiptLines, receiptSettings } from "@/lib/print";

export function ReceiptDialog({ receipt, change, onClose, onNew, offline }: { receipt: Receipt | null; change?: number; onClose: () => void; onNew?: () => void; offline?: boolean }) {
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [printing, setPrinting] = useState(false);
  const settings = useCatalogStore((s) => s.catalog?.business.settings);
  const branding = receiptSettings(settings, receipt);
  // Desktop app -> print server -> browser dialog (src/lib/print.ts). The on-screen receipt stays as the browser's print area.
  const print = async () => {
    if (!receipt) return;
    setPrinting(true);
    const r = await printJob({ role: "receipt", lines: receiptLines(receipt, { settings }) }, { settings });
    setPrinting(false);
    if (!r.ok) { toast.error("Could not print", r.error); return; }
    if (isOnline()) api(`/orders/${receipt.order.id}/receipt/printed`, { method: "POST", auth: "pos" }).catch(() => {});
  };
  const send = async () => {
    if (!receipt) return;
    setSending(true);
    try {
      const r = await api<{ sent: boolean; to: string }>(`/orders/${receipt.order.id}/receipt/send`, { method: "POST", auth: "pos", body: { phone: phone || undefined } });
      toast.success(`Receipt sent to ${r.to}`);
    } catch (e) { toast.error("Could not send", errorMessage(e)); }
    finally { setSending(false); }
  };
  return (
    <Dialog open={!!receipt} onClose={onClose} title={receipt?.duplicate ? "Receipt (duplicate)" : "Paid"} description={offline ? "Saved on this till; it syncs when the connection returns." : undefined} size="lg"
      footer={<>
        <Button variant="secondary" onClick={print} loading={printing}><Printer className="h-4 w-4" /> Print</Button>
        {onNew ? <Button onClick={onNew}><Check className="h-4 w-4" /> New order (F1)</Button> : <Button onClick={onClose}>Done</Button>}
      </>}>
      {receipt ? (
        <div className="grid gap-4 md:grid-cols-[1fr_280px]">
          <div className="print-area rounded-lg border bg-white p-2"><ReceiptView r={receipt} branding={{ secondaryPhone: branding.secondaryPhone, footerQrUrl: branding.footerQrUrl }} /></div>
          <div className="no-print space-y-4">
            {change ? <div className="rounded-lg bg-success-soft p-4 text-center"><div className="text-sm">Change due</div><div className="text-4xl font-bold tabular">{formatMoney(change, receipt.business?.currency)}</div></div> : null}
            <div className="rounded-lg border p-3">
              <div className="mb-2 text-sm font-semibold">Send by WhatsApp</div>
              <Input type="tel" placeholder={receipt.order.customer?.phone ?? "+92…"} value={phone} onChange={(e) => setPhone(e.target.value)} className="mb-2 h-12" />
              <Button variant="secondary" className="w-full" size="lg" onClick={send} loading={sending} disabled={offline || (!phone && !receipt.order.customer?.phone)}><MessageCircle className="h-4 w-4" /> Send</Button>
              {offline ? <p className="mt-1 text-xs text-fg-muted">Available when online.</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
