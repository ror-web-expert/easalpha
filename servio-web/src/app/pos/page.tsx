"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useCartStore } from "@/store/cart";
import { useCatalogStore } from "@/store/catalog";
import { useDeviceStore } from "@/store/device";
import { errorMessage } from "@/lib/api";
import type { Deal, DiningTable, Order, PaymentInput, Product, Receipt } from "@/lib/types";
import { repriceLines, taxFor, type CartLine } from "@/lib/pricing";
import { holdOrder, payOrder, saveOrder, loadOrderForEdit } from "@/lib/pos-actions";
import { useApproval } from "@/components/approval";
import { PosShell } from "@/components/pos/shell";
import { ItemGrid } from "@/components/pos/item-grid";
import { ModifierSheet } from "@/components/pos/modifier-sheet";
import { OrderPanel, OrderTypeSwitch } from "@/components/pos/order-panel";
import { PaymentDialog } from "@/components/pos/payment-dialog";
import { ReceiptDialog } from "@/components/pos/receipt-dialog";
import { CustomerDialog, OpenItemDialog, PriceOverrideDialog, StaffMealDialog, TablePicker } from "@/components/pos/dialogs";
import { Button, Dialog, EmptyState, Field, Textarea } from "@/components/ui";
import { toast } from "@/store/toast";
import { Package } from "lucide-react";

function SellScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const catalog = useCatalogStore((s) => s.catalog);
  const tables = useCatalogStore((s) => s.tables);
  const refreshTables = useCatalogStore((s) => s.refreshTables);
  const refreshCatalog = useCatalogStore((s) => s.refresh);
  const session = useDeviceStore((s) => s.session);
  const { cart, reset, load, patch, addLine, updateLine, removeLine, setQty } = useCartStore();
  const { run, dialog: pinDialog } = useApproval();
  const searchRef = useRef<HTMLInputElement>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [editing, setEditing] = useState<CartLine | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [openItem, setOpenItem] = useState(false);
  const [override, setOverride] = useState<CartLine | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [receipt, setReceipt] = useState<{ receipt: Receipt; change: number; offline: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const settings = catalog?.business.settings;
  const currency = catalog?.business.currency;

  // ?order=<id> opens an existing order (from the orders tab / table picker)
  useEffect(() => {
    const id = params.get("order");
    if (!id) return;
    loadOrderForEdit(id).then((c) => { load(c); router.replace("/pos"); }).catch((e) => toast.error("Could not open order", errorMessage(e)));
  }, [params, load, router]);
  useEffect(() => { if (settings?.default_order_type) useCartStore.setState({ defaultType: settings.default_order_type }); }, [settings?.default_order_type]);

  const newOrder = useCallback(() => { reset(); setReceipt(null); setPayOpen(false); }, [reset]);

  const addProduct = (p: Product) => {
    const needsSheet = (p.variants?.length ?? 0) > 0 || (p.modifier_group_ids?.length ?? 0) > 0;
    if (needsSheet) { setEditing(null); setProduct(p); return; }
    const tax = taxFor(p, catalog);
    const branchId = catalog?.branch?.id;
    const price = (p.prices ?? []).find((x) => !x.variant_id && x.order_type === cart.order_type && (x.branch_id === branchId || !x.branch_id))?.price_minor ?? p.base_price_minor;
    addLine({ product_id: p.id, variant_id: null, name: p.name, unit_price_minor: price, quantity: 1, modifiers: [], tax_rate: tax.rate, tax_inclusive: tax.inclusive, station_id: p.station_id });
  };
  const editLine = (l: CartLine) => {
    const p = l.product_id ? catalog?.products.find((x) => x.id === l.product_id) : null;
    if (p && ((p.variants?.length ?? 0) > 0 || (p.modifier_group_ids?.length ?? 0) > 0)) { setEditing(l); setProduct(p); }
    else if (l.deal_id) { setEditing(l); setDeal(catalog?.deals.find((d) => d.id === l.deal_id) ?? null); }
    else { setNotes(l.notes ?? ""); setEditing(l); setNotesOpen(true); }
  };
  const onSheetAdd = (line: Omit<CartLine, "key">) => {
    if (editing) { updateLine(editing.key, line); setEditing(null); } else addLine(line);
  };
  const changeType = (t: typeof cart.order_type) => patch({ order_type: t, lines: repriceLines(cart.lines, t, catalog, catalog?.branch?.id), table_id: t === "dine_in" ? cart.table_id : null, table_code: t === "dine_in" ? cart.table_code : null });
  const repeatOrder = (o: Order) => {
    const lines: CartLine[] = (o.items ?? []).filter((i) => i.status !== "cancelled").map((i) => {
      const p = catalog?.products.find((x) => x.id === i.product_id) ?? null;
      const tax = taxFor(p, catalog);
      return { key: crypto.randomUUID(), product_id: i.product_id ?? undefined, variant_id: i.variant_id, deal_id: i.deal_id ?? undefined, name: i.name, unit_price_minor: p ? (i.variant_id ? p.variants?.find((v) => v.id === i.variant_id)?.price_minor ?? p.base_price_minor : p.base_price_minor) : i.unit_price_minor, quantity: Number(i.quantity), notes: i.notes, modifiers: (i.modifiers ?? []).filter((m) => m.modifier_id).map((m) => ({ modifier_id: m.modifier_id!, name: m.name, price_minor: m.price_minor, quantity: Number(m.quantity) })), tax_rate: tax.rate, tax_inclusive: tax.inclusive, open_item: i.open_item ? { name: i.name, price_minor: i.unit_price_minor } : undefined };
    });
    patch({ lines: repriceLines(lines, cart.order_type, catalog, catalog?.branch?.id), order_type: o.order_type });
    toast.success("Last order repeated");
  };
  const pickTable = async (t: DiningTable | null) => {
    if (t?.current_order_id && t.current_order_id !== cart.id) {
      try { load(await loadOrderForEdit(t.current_order_id)); toast.info(`Opened the running order on ${t.code}`); } catch (e) { toast.error("Could not open table order", errorMessage(e)); }
      return;
    }
    patch({ table_id: t?.id ?? null, table_code: t?.code ?? null });
  };

  const hold = async () => {
    setBusy(true);
    try { await run((pin) => (pin ? saveOrder(cart, { approver_pin: pin }).then(() => holdOrder(cart)) : holdOrder(cart)), "Hold order"); toast.success("Order held. Recall it from Orders."); reset(); }
    catch (e) { toast.error("Could not hold", errorMessage(e)); }
    finally { setBusy(false); }
  };
  const send = async () => {
    setBusy(true);
    try {
      const r = await run((pin) => saveOrder(cart, { place: true, approver_pin: pin }), "Send to kitchen");
      toast.success(r.offline ? `Saved on till as ${r.cart.label}; sends when online` : `${r.cart.label} sent to kitchen`);
      if (cart.order_type === "dine_in" && cart.table_id) { refreshTables(); reset(); } else reset();
    } catch (e) { toast.error("Could not send", errorMessage(e)); }
    finally { setBusy(false); }
  };
  const pay = async (payments: PaymentInput[], tip: number) => {
    setBusy(true);
    try {
      const r = await run((pin) => payOrder(cart, payments, tip, pin), "Take payment");
      setPayOpen(false);
      setReceipt({ receipt: r.receipt, change: r.change_minor, offline: r.offline });
      if (cart.table_id) refreshTables();
    } catch (e) { toast.error("Payment failed", errorMessage(e)); }
    finally { setBusy(false); }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F1") { e.preventDefault(); newOrder(); }
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
      if (e.key === "F3") { e.preventDefault(); setCustomerOpen(true); }
      if (e.key === "F4") { e.preventDefault(); if (cart.lines.length) hold(); else router.push("/pos/orders?held=1"); }
      if (e.key === "F5") { e.preventDefault(); if (cart.lines.length) send(); }
      if (e.key === "F8") { e.preventDefault(); if (cart.lines.length) setPayOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, newOrder]);

  if (!catalog) {
    return (
      <PosShell>
        <EmptyState icon={Package} title="No catalog on this till yet" hint="Connect to the internet once to download the menu." action={<Button onClick={() => refreshCatalog().catch((e) => toast.error("Could not load catalog", errorMessage(e)))}>Download catalog</Button>} className="m-6" />
      </PosShell>
    );
  }
  return (
    <PosShell title={<span className="hidden md:inline">{session?.user?.name}</span>}>
      <div className="grid h-full grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px]">
        <div className="flex min-h-0 flex-col">
          <div className="border-b bg-card p-2"><OrderTypeSwitch value={cart.order_type} onChange={changeType} /></div>
          <div className="min-h-0 flex-1"><ItemGrid ref={searchRef} catalog={catalog} orderType={cart.order_type} onProduct={addProduct} onDeal={(d) => { setEditing(null); setDeal(d); }} onOpenItem={() => setOpenItem(true)} canOpenItem={true} /></div>
        </div>
        <div className="min-h-0 border-l">
          <OrderPanel cart={cart} currency={currency} settings={settings} onQty={setQty} onEditLine={editLine} onOverride={setOverride} onRemove={removeLine}
            onCustomer={() => setCustomerOpen(true)} onTable={() => setTableOpen(true)} onNotes={() => { setEditing(null); setNotes(cart.notes); setNotesOpen(true); }} onStaffMeal={() => (cart.is_staff_meal ? patch({ is_staff_meal: false, staff_meal_reason: "" }) : setStaffOpen(true))}
            onHold={hold} onSend={send} onPay={() => setPayOpen(true)} onNew={newOrder} busy={busy} canOverride={true} />
        </div>
      </div>
      <ModifierSheet product={product} deal={deal} catalog={catalog} orderType={cart.order_type} editing={editing} onClose={() => { setProduct(null); setDeal(null); setEditing(null); }} onAdd={onSheetAdd} />
      <CustomerDialog open={customerOpen} onClose={() => setCustomerOpen(false)} onPick={(c) => patch({ customer: c })} onRepeat={repeatOrder} />
      <TablePicker open={tableOpen} onClose={() => setTableOpen(false)} tables={tables} current={cart.table_id} onPick={pickTable} onRefresh={refreshTables} />
      <OpenItemDialog open={openItem} onClose={() => setOpenItem(false)} onAdd={(name, price) => { const tax = taxFor(null, catalog); addLine({ name, unit_price_minor: price, quantity: 1, modifiers: [], open_item: { name, price_minor: price }, tax_rate: tax.rate, tax_inclusive: tax.inclusive }); }} />
      <PriceOverrideDialog open={!!override} onClose={() => setOverride(null)} current={override?.price_override_minor ?? override?.unit_price_minor ?? 0} onSet={(p) => override && updateLine(override.key, { price_override_minor: p })} />
      <StaffMealDialog open={staffOpen} onClose={() => setStaffOpen(false)} onConfirm={(reason) => patch({ is_staff_meal: true, staff_meal_reason: reason })} />
      <Dialog open={notesOpen} onClose={() => setNotesOpen(false)} title={editing ? `Notes for ${editing.name}` : "Order notes"} size="sm" footer={<><Button variant="secondary" onClick={() => setNotesOpen(false)}>Cancel</Button><Button onClick={() => { if (editing) updateLine(editing.key, { notes: notes || null }); else patch({ notes }); setNotesOpen(false); setEditing(null); }}>Save</Button></>}>
        <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="text-base" autoFocus /></Field>
      </Dialog>
      <PaymentDialog open={payOpen} onClose={() => setPayOpen(false)} cart={cart} onPay={pay} busy={busy} />
      <ReceiptDialog receipt={receipt?.receipt ?? null} change={receipt?.change} offline={receipt?.offline} onClose={() => { setReceipt(null); reset(); }} onNew={newOrder} />
      {pinDialog}
    </PosShell>
  );
}

export default function PosPage() {
  return <Suspense fallback={null}><SellScreen /></Suspense>;
}
