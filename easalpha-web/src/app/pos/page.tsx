"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useCartStore, type Cart } from "@/store/cart";
import { useCatalogStore } from "@/store/catalog";
import { useDeviceStore, usePosCan } from "@/store/device";
import { ApiError, errorMessage } from "@/lib/api";
import type { Deal, DiningTable, Order, PaymentInput, Product, QuickAddItem, Receipt, Variant } from "@/lib/types";
import type { BarcodeMatch } from "@/lib/barcode";
import { attachDiscounts, displaySettings, priceFor, productDiscountFields, repriceLines, taxFor, type CartLine } from "@/lib/pricing";
import { holdOrder, payOrder, saveOrder, loadOrderForEdit, completeUnpaid, applyTaxChoice, applyServerDiscount, syncForPayment, TotalChangedError, regularPricing } from "@/lib/pos-actions";
import { useSyncStore } from "@/store/sync";
import { useCustomerStore } from "@/store/customers";
import { allowedOrderTypes, confirmationPopup, customerRequired, directUnpaidAllowed } from "@/lib/pos-rules";
import { hasPrinter, printJob, receiptLines } from "@/lib/print";
import { formatMoney } from "@/lib/money";
import { titleCase } from "@/lib/utils";
import { useApproval } from "@/components/approval";
import { PosShell } from "@/components/pos/shell";
import { ItemGrid } from "@/components/pos/item-grid";
import { QuickAddBar } from "@/components/pos/quick-add-bar";
import { ModifierSheet } from "@/components/pos/modifier-sheet";
import { useTillScanner } from "@/components/pos/scanner";
import { OrderPanel, OrderTypeSwitch } from "@/components/pos/order-panel";
import { PaymentDialog, type TaxChoiceInput } from "@/components/pos/payment-dialog";
import { ReceiptDialog } from "@/components/pos/receipt-dialog";
import { CustomerDialog, OpenItemDialog, PriceOverrideDialog, StaffMealDialog, TablePicker } from "@/components/pos/dialogs";
import { Button, Dialog, EmptyState, Field, PinDialog, Textarea } from "@/components/ui";
import { toast } from "@/store/toast";
import { BillPreviewDialog } from "@/components/pos/bill-preview";
import { Package } from "lucide-react";

type PinOpts = { pin?: string; approver_pin?: string };

function SellScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const catalog = useCatalogStore((s) => s.catalog);
  const tables = useCatalogStore((s) => s.tables);
  const refreshTables = useCatalogStore((s) => s.refreshTables);
  const refreshCatalog = useCatalogStore((s) => s.refresh);
  const session = useDeviceStore((s) => s.session);
  const can = usePosCan();
  const { cart, reset, load, patch, addLine, updateLine, removeLine, restoreLine, setQty } = useCartStore();
  // The cart as it will be charged. Offline the till takes a regular customer's discount off itself (pos-regular), so
  // the panel, the bill and the payment screen show the figure the server will ask for once the order syncs.
  const syncStatus = useSyncStore((s) => s.status);
  const savedCustomers = useCustomerStore((s) => s.byId);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- regularPricing reads the sync status, catalog and saved customers from their stores
  const shownCart = useMemo(() => regularPricing(cart), [cart, catalog, syncStatus, savedCustomers]);
  const { run, dialog: pinDialog, open: approvalOpen } = useApproval();
  const searchRef = useRef<HTMLInputElement>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  /** Variant a Quick Add item named, pre-selected when its product still needs the modifier sheet. */
  const [quickVariant, setQuickVariant] = useState<string | null>(null);
  // A scanned pack (6 cans) or a scale label's weight opens the options sheet on that quantity instead of 1.
  const [quickQty, setQuickQty] = useState<number | null>(null);
  const [editing, setEditing] = useState<CartLine | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [openItem, setOpenItem] = useState(false);
  const [override, setOverride] = useState<CartLine | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [receipt, setReceipt] = useState<{ receipt: Receipt; change: number; offline: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  // SPEC REQUIRE_PIN_FOR_ORDER_UPDATE: the user's own PIN, asked once per reopened order and reused for the payment save.
  const [orderPin, setOrderPin] = useState<string | undefined>();
  const [pinAsk, setPinAsk] = useState<{ resolve: (pin: string | null) => void } | null>(null);
  // The server's amount due from the last "Total updated" stop: the cashier has seen it, so the next press pays it.
  const seenDue = useRef<{ id: string; due: number } | null>(null);
  const settings = catalog?.business.settings;
  const currency = catalog?.business.currency;
  const display = displaySettings(settings);
  const perms = session?.permissions;
  const staffType = session?.membership?.staff_type;
  // SPEC "Take Orders": SALES_WALKIN / SALES_TAKEAWAY / SALES_DELIVERY gate the type switch.
  const allowedTypes = useMemo(() => allowedOrderTypes(perms), [perms]);
  // SPEC reopen flow: which edit controls this user may use on a reopened order.
  const reopened = !!cart.reopened;
  const canRemove = !reopened || can("DELETE_ORDER_ITEM");
  // Review 3.8: a removed line can be put back for five seconds (the bin button, or stepping the quantity to zero).
  const removeWithUndo = (key: string) => {
    const index = cart.lines.findIndex((l) => l.key === key);
    const line = cart.lines[index];
    if (!line) return;
    const orderId = cart.id;
    removeLine(key);
    toast.undo(`${line.quantity > 1 ? `${line.quantity} × ` : ""}${line.name} removed`, () => { if (useCartStore.getState().cart.id === orderId) restoreLine(line, index); });
  };
  const qtyWithUndo = (key: string, qty: number) => (qty <= 0 ? removeWithUndo(key) : setQty(key, qty));
  // Review 3.9: discounts and charges show only to roles allowed to give them; the server checks the same codes.
  const canDiscount = can("discounts.apply");
  const canCharge = can("prices.override");
  const canDecrease = !reopened || can("MODIFY_REOPEN_DECREASE_QTY");
  const needsPin = reopened && can("REQUIRE_PIN_FOR_ORDER_UPDATE");
  // SPEC "Direct Unpaid Orders": never for a reopened order.
  const unpaidOk = directUnpaidAllowed(settings, perms, staffType) && !reopened;
  const unpaidLabel = cart.saved && !["draft", "held"].includes(cart.status) ? "Complete unpaid" : "Place unpaid";
  // Lines loaded from the server or an older cache carry no product discount; copy it from the catalog so totals match.
  const loadCart = useCallback((c: Parameters<typeof load>[0]) => load({ ...c, lines: attachDiscounts(c.lines, useCatalogStore.getState().catalog) }), [load]);

  // ?order=<id> opens an existing order (from the orders tab / table picker / reopen)
  useEffect(() => {
    const id = params.get("order");
    if (!id) return;
    loadOrderForEdit(id).then((c) => { setOrderPin(undefined); loadCart(c); router.replace("/pos"); }).catch((e) => toast.error("Could not open order", errorMessage(e)));
  }, [params, loadCart, router]);
  useEffect(() => { if (settings?.default_order_type) useCartStore.setState({ defaultType: settings.default_order_type }); }, [settings?.default_order_type]);
  // A new cart never sits on a type the user may not take.
  useEffect(() => {
    if (cart.saved || !allowedTypes.length || allowedTypes.includes(cart.order_type)) return;
    patch({ order_type: allowedTypes[0], lines: repriceLines(cart.lines, allowedTypes[0], catalog, catalog?.branch?.id), table_id: null, table_code: null });
  }, [allowedTypes, cart.saved, cart.order_type, cart.lines, patch, catalog]);

  const newOrder = useCallback(() => { reset(); setReceipt(null); setPayOpen(false); setOrderPin(undefined); seenDue.current = null; }, [reset]);

  const addProduct = (p: Product) => {
    const needsSheet = (p.variants?.length ?? 0) > 0 || (p.modifier_group_ids?.length ?? 0) > 0;
    if (needsSheet) { setEditing(null); setProduct(p); return; }
    const tax = taxFor(p, catalog);
    const branchId = catalog?.branch?.id;
    const price = (p.prices ?? []).find((x) => !x.variant_id && x.order_type === cart.order_type && (x.branch_id === branchId || !x.branch_id))?.price_minor ?? p.base_price_minor;
    addLine({ product_id: p.id, variant_id: null, name: p.name, unit_price_minor: price, quantity: 1, modifiers: [], tax_rate: tax.rate, tax_inclusive: tax.inclusive, station_id: p.station_id, ...productDiscountFields(p) });
  };
  /** Adds a product (and size) straight to the cart; only a required modifier group opens the sheet first. */
  const addPicked = (p: Product, variant: Variant | null, quantity = 1) => {
    if (!catalog) return;
    const needsChoice = (p.modifier_group_ids ?? []).some((id) => { const g = catalog.modifier_groups.find((x) => x.id === id); return !!g && (g.required || g.min_select > 0); });
    if (needsChoice) { setEditing(null); setQuickVariant(variant?.id ?? null); setQuickQty(quantity !== 1 ? quantity : null); setProduct(p); return; }
    const tax = taxFor(p, catalog);
    addLine({ product_id: p.id, variant_id: variant?.id ?? null, name: variant ? `${p.name} (${variant.name})` : p.name, unit_price_minor: priceFor(p, cart.order_type, variant, catalog.branch?.id), quantity, modifiers: [], tax_rate: tax.rate, tax_inclusive: tax.inclusive, station_id: p.station_id, ...productDiscountFields(p) });
  };
  // SPEC "Quick Add Menu": one tap adds the pinned product/variant with quantity 1. Only a required modifier group opens the sheet.
  const quickAdd = (item: QuickAddItem) => {
    if (!catalog) return;
    const p = catalog.products.find((x) => x.id === item.product_id);
    if (!p || !p.active || p.archived_at) { toast.error("Not on the menu", `${item.name} is no longer available.`); return; }
    addPicked(p, item.variant_id ? p.variants?.find((v) => v.id === item.variant_id) ?? null : null);
  };
  /** A scanned barcode: its size and pack quantity (or a scale label's weight). A code for "any size" opens the sheet to pick one. */
  const addScanned = (m: BarcodeMatch): boolean => {
    const p = m.product;
    if (!p.active || p.archived_at) { toast.error("Not on sale", `${p.name} is switched off on the menu.`); return false; }
    if (!m.variant && p.variants?.length) { setEditing(null); setQuickVariant(null); setQuickQty(m.quantity !== 1 ? m.quantity : null); setProduct(p); return true; }
    addPicked(p, m.variant, m.quantity);
    return true;
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
  // A new type takes the charge defaults of that type again (SPEC Charges: the service charge is per order type).
  const changeType = (t: typeof cart.order_type) => patch({ order_type: t, lines: repriceLines(cart.lines, t, catalog, catalog?.branch?.id), table_id: t === "dine_in" ? cart.table_id : null, table_code: t === "dine_in" ? cart.table_code : null, service_charge_percent: undefined, service_charge_fixed_minor: undefined, delivery_charge_percent: undefined, delivery_charge_minor: t === "delivery" ? cart.delivery_charge_minor : undefined });
  const repeatOrder = (o: Order) => {
    const lines: CartLine[] = (o.items ?? []).filter((i) => i.status !== "cancelled").map((i) => {
      const p = catalog?.products.find((x) => x.id === i.product_id) ?? null;
      const tax = taxFor(p, catalog);
      return { key: crypto.randomUUID(), product_id: i.product_id ?? undefined, variant_id: i.variant_id, deal_id: i.deal_id ?? undefined, name: i.name, unit_price_minor: p ? (i.variant_id ? p.variants?.find((v) => v.id === i.variant_id)?.price_minor ?? p.base_price_minor : p.base_price_minor) : i.unit_price_minor, quantity: Number(i.quantity), notes: i.notes, modifiers: (i.modifiers ?? []).filter((m) => m.modifier_id).map((m) => ({ modifier_id: m.modifier_id!, name: m.name, price_minor: m.price_minor, quantity: Number(m.quantity) })), tax_rate: tax.rate, tax_inclusive: tax.inclusive, open_item: i.open_item ? { name: i.name, price_minor: i.unit_price_minor } : undefined, ...productDiscountFields(p) };
    });
    patch({ lines: repriceLines(lines, cart.order_type, catalog, catalog?.branch?.id), order_type: o.order_type });
    toast.success("Last order repeated");
  };
  const pickTable = async (t: DiningTable | null) => {
    if (t?.current_order_id && t.current_order_id !== cart.id) {
      try { setOrderPin(undefined); loadCart(await loadOrderForEdit(t.current_order_id)); toast.info(`Opened the running order on ${t.code}`); } catch (e) { toast.error("Could not open table order", errorMessage(e)); }
      return;
    }
    patch({ table_id: t?.id ?? null, table_code: t?.code ?? null });
  };

  // SPEC "Customer Required": enforced at order placement, per order type; the picker opens so the cashier can carry on.
  const ensureCustomer = (): boolean => {
    if (!customerRequired(settings, cart.order_type) || cart.customer) return true;
    toast.error("Customer required", `${titleCase(cart.order_type)} orders need a customer before they are placed. Pick one (F3) to continue.`);
    setCustomerOpen(true);
    return false;
  };
  const askOwnPin = () => new Promise<string | null>((resolve) => setPinAsk({ resolve }));
  /**
   * Runs a save on a reopened order the way SPEC REQUIRE_PIN_FOR_ORDER_UPDATE wants it: the user's own PIN first
   * (asked once with the PinPad), then a manager with REOPEN_ORDER through the usual approval dialog if the server
   * still answers pin.required. Permission refusals (permission.denied) go through the same approval dialog.
   * Returns null when the user cancels the PIN.
   */
  const withOrderPin = async <T,>(fn: (opts: PinOpts) => Promise<T>, label: string): Promise<T | null> => {
    let pin = orderPin;
    if (needsPin && !pin) { pin = (await askOwnPin()) ?? undefined; if (!pin) return null; }
    try {
      const v = await run((approver) => fn({ pin, approver_pin: approver }), label);
      if (pin) setOrderPin(pin);
      return v;
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "pin.required")) throw e;
      setOrderPin(undefined);
      toast.error("PIN not accepted", "A manager with REOPEN_ORDER can approve instead.");
      return run((approver) => (approver ? fn({ approver_pin: approver }) : Promise.reject(new ApiError("approval.required", e.message, 403))), label);
    }
  };

  const hold = async () => {
    if (reopened) return;
    setBusy(true);
    try { await run((pin) => (pin ? saveOrder(cart, { approver_pin: pin }).then(() => holdOrder(cart)) : holdOrder(cart)), "Hold order"); toast.success("Order held. Recall it from Orders."); reset(); }
    catch (e) { toast.error("Could not hold", errorMessage(e)); }
    finally { setBusy(false); }
  };
  /** SPEC reopen flow: saving a reopened order (PIN as required) leads straight to the payment screen. */
  const saveReopened = async (): Promise<Cart | null> => {
    setBusy(true);
    try {
      const r = await withOrderPin((o) => saveOrder(cart, o), `Save changes to ${cart.label ?? "the reopened order"}`);
      if (!r) return null;
      loadCart(r.cart);
      return r.cart;
    } catch (e) { toast.error("Could not save", errorMessage(e)); return null; }
    finally { setBusy(false); }
  };
  const send = async () => {
    if (!ensureCustomer()) return;
    if (reopened) {
      const c = await saveReopened();
      if (c) { toast.success("Changes saved", "Take payment of the amount due to complete the order."); setPayOpen(true); }
      return;
    }
    setBusy(true);
    try {
      const r = await run((pin) => saveOrder(cart, { place: true, approver_pin: pin }), "Send to kitchen");
      toast.success(r.offline ? `Saved on till as ${r.cart.label}; sends when online` : `${r.cart.label} sent to kitchen`);
      if (cart.order_type === "dine_in" && cart.table_id) { refreshTables(); reset(); } else reset();
    } catch (e) { toast.error("Could not send", errorMessage(e)); }
    finally { setBusy(false); }
  };
  const openPay = async () => {
    if (!cart.lines.length || !ensureCustomer()) return;
    if (reopened) { const c = await saveReopened(); if (!c) return; }
    else if (cart.customer) {
      // SPEC regular discounts: the server applies the best recency tier for this customer; sync once so the payment
      // page shows it before money is taken. Offline (or on a failure) the page opens with the local total.
      setBusy(true);
      try { const c = await withOrderPin((o) => syncForPayment(cart, o), "Check discounts"); if (c) loadCart(c); }
      catch (e) { toast.error("Could not check discounts", errorMessage(e)); }
      finally { setBusy(false); }
    }
    setPayOpen(true);
  };
  /** SPEC discounts: a voucher, loyalty points or a redemption option (or removing one), re-priced by the server. Online only. */
  const runDiscount = async (fn: (orderId: string) => Promise<Order>, label: string): Promise<boolean> => {
    setBusy(true);
    try {
      const r = await withOrderPin((o) => applyServerDiscount(cart, fn, o), label);
      if (!r) return false;
      loadCart(r);
      return true;
    } finally { setBusy(false); }
  };
  const printReceipt = async (r: Receipt) => {
    const res = await printJob({ role: "receipt", lines: receiptLines(r, { settings }) }, { settings });
    if (!res.ok) toast.error("Could not print", res.error);
  };
  /**
   * SPEC Charges: the cashier changed or removed the service / delivery charge on the payment page. The cart takes the
   * values at once (the total updates locally); a saved order is PATCHed too, or queued while offline.
   */
  const updateCharges = async (fields: Partial<Cart>) => {
    const next = { ...cart, ...fields };
    patch(fields);
    if (!cart.saved) return;
    setBusy(true);
    try {
      const r = await withOrderPin((o) => saveOrder(next, o), "Update charges");
      if (r) patch({ service_charge_percent: r.cart.service_charge_percent, service_charge_fixed_minor: r.cart.service_charge_fixed_minor, delivery_charge_percent: r.cart.delivery_charge_percent, delivery_charge_minor: r.cart.delivery_charge_minor, label: r.cart.label });
    } catch (e) { toast.error("Could not update the charge", errorMessage(e)); }
    finally { setBusy(false); }
  };
  /** SPEC Tax: No Tax / linked rate, re-priced by the server. Shown only while online. */
  const chooseTax = async (choice: TaxChoiceInput) => {
    setBusy(true);
    try {
      const r = await withOrderPin((o) => applyTaxChoice(cart, choice, o), "Tax choice");
      if (r) loadCart(r);
    } catch (e) { toast.error("Could not set the tax choice", errorMessage(e)); }
    finally { setBusy(false); }
  };
  const pay = async (payments: PaymentInput[], tip: number, shownDue: number) => {
    setBusy(true);
    try {
      const seen = seenDue.current?.id === cart.id ? seenDue.current.due : undefined;
      const r = await withOrderPin((o) => payOrder(cart, payments, tip, o.approver_pin, { pin: o.pin, shownDue, seenDue: seen }), "Take payment");
      if (!r) return;
      seenDue.current = null;
      setPayOpen(false);
      const fullyPaid = ["paid", "closed"].includes(r.local.status) || r.local.paid_minor >= r.local.total_minor;
      if (!fullyPaid) {
        // SPEC part payment: the order stays open as Pending with the remaining due on the panel. The panel takes the
        // order as payOrder left it (the server's lines, discounts, rounding, tip and paid; the reopen state kept),
        // so the due it shows is the one still owed.
        loadCart(r.cart);
        toast.info("Part payment taken", `${formatMoney(r.local.total_minor - r.local.paid_minor, currency)} still due on ${r.local.label}. The order stays open until it is paid.`);
        return;
      }
      if (cart.table_id) refreshTables();
      // SPEC "Order confirmation popup": on shows the receipt; off goes straight to a new order (and prints when a printer is reachable).
      if (confirmationPopup(settings)) setReceipt({ receipt: r.receipt, change: r.change_minor, offline: r.offline });
      else {
        if (hasPrinter(settings)) void printReceipt(r.receipt);
        toast.success(`${r.receipt.order.label} paid${r.change_minor ? ` · change ${formatMoney(r.change_minor, currency)}` : ""}`);
        newOrder();
      }
    } catch (e) {
      if (e instanceof TotalChangedError) {
        // Nothing was paid: show the order as the server prices it and leave the payment screen open on the new total.
        seenDue.current = { id: e.cart.id, due: e.toMinor };
        loadCart(e.cart);
        toast.info("Total updated", `The amount due is now ${formatMoney(e.toMinor, currency)} (it was ${formatMoney(e.fromMinor, currency)}). Nothing was charged. Check it and press Pay again.`);
      } else toast.error("Payment failed", errorMessage(e));
    }
    finally { setBusy(false); }
  };
  /** SPEC "Direct Unpaid Orders": place (or complete) without the payment screen. */
  const placeUnpaid = async () => {
    if (!ensureCustomer()) return;
    setBusy(true);
    try {
      const r = await run((pin) => completeUnpaid(cart, pin), unpaidLabel);
      toast.success(`${r.order.label} ${cart.saved ? "completed" : "placed"} unpaid`, "Payment is still due; it shows as Unpaid in Orders.");
      if (cart.table_id) refreshTables();
      newOrder();
    } catch (e) { toast.error(e instanceof ApiError && e.code === "order.unpaid" ? "Payment needed" : "Could not place", errorMessage(e)); }
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
      if (e.key === "F8") { e.preventDefault(); openPay(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, newOrder]);
  // Barcode scanning (pos.barcode_scanning.*): scanner, camera and unknown-code dialogs. Paused while money is being
  // taken, while a save runs (it sends the cart it started with, then clears it; a manager PIN waits inside it) and
  // while any dialog or sheet is open, so a scan never lands behind one or resets a half-built line.
  const sheetOrDialog = !!product || !!deal || customerOpen || tableOpen || openItem || notesOpen || staffOpen || !!override || payOpen || billOpen || !!receipt || !!pinAsk || approvalOpen;
  const scanner = useTillScanner({ catalog, orderType: cart.order_type, paused: busy || sheetOrDialog, onMatch: addScanned });

  if (!catalog) {
    return (
      <PosShell>
        <EmptyState icon={Package} title="No catalog on this till yet" hint="Connect to the internet once to download the menu." action={<Button onClick={() => refreshCatalog().catch((e) => toast.error("Could not load catalog", errorMessage(e)))}>Download catalog</Button>} className="m-6" />
      </PosShell>
    );
  }
  return (
    <PosShell title={<span className="hidden md:inline">{session?.user?.name}</span>}>
      {/* minmax(0,1fr): a bare 1fr can't shrink below its content, so a long switch or search row would push the
          order panel past the right edge of the screen. */}
      <div className="grid h-full grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="border-b bg-pos-panel p-2"><OrderTypeSwitch value={cart.order_type} onChange={changeType} allowed={allowedTypes} /></div>
          <div className="min-h-0 flex-1"><ItemGrid ref={searchRef} catalog={catalog} orderType={cart.order_type} settings={settings} onProduct={addProduct} onDeal={(d) => { setEditing(null); setDeal(d); }} onOpenItem={() => setOpenItem(true)} canOpenItem={true} onCode={scanner.lookupTyped} searchAction={scanner.cameraButton} onQuickAdd={(p) => addPicked(p, p.variants?.[0] ?? null)} /></div>
        </div>
        <div className="flex min-h-0 flex-col border-l">
          <QuickAddBar items={catalog.quick_add_items} currency={currency} showPrices={display.showPrices} onPick={quickAdd} />
          <div className="min-h-0 flex-1">
            <OrderPanel cart={shownCart} currency={currency} settings={settings} onQty={qtyWithUndo} onEditLine={editLine} onOverride={setOverride} onRemove={removeWithUndo}
              onCustomer={() => setCustomerOpen(true)} onTable={() => setTableOpen(true)} onNotes={() => { setEditing(null); setNotes(cart.notes); setNotesOpen(true); }} onStaffMeal={() => (cart.is_staff_meal ? patch({ is_staff_meal: false, staff_meal_reason: "" }) : setStaffOpen(true))}
              onHold={hold} onSend={send} onPay={openPay} onNew={newOrder} busy={busy} canOverride={true} overrideNeedsPin={!can("prices.override")} onPreview={() => setBillOpen(true)}
              canRemove={canRemove} canDecrease={canDecrease} onPlaceUnpaid={unpaidOk ? placeUnpaid : undefined} unpaidLabel={unpaidLabel} />
          </div>
        </div>
      </div>
      <ModifierSheet product={product} deal={deal} catalog={catalog} orderType={cart.order_type} editing={editing} initialVariantId={quickVariant} initialQuantity={quickQty} onClose={() => { setProduct(null); setDeal(null); setEditing(null); setQuickVariant(null); setQuickQty(null); }} onAdd={onSheetAdd} />
      <CustomerDialog open={customerOpen} onClose={() => setCustomerOpen(false)} onPick={(c) => patch({ customer: c })} onRepeat={repeatOrder} />
      <TablePicker open={tableOpen} onClose={() => setTableOpen(false)} tables={tables} current={cart.table_id} onPick={pickTable} onRefresh={refreshTables} />
      <OpenItemDialog open={openItem} onClose={() => setOpenItem(false)} onAdd={(name, price) => { const tax = taxFor(null, catalog); addLine({ name, unit_price_minor: price, quantity: 1, modifiers: [], open_item: { name, price_minor: price }, tax_rate: tax.rate, tax_inclusive: tax.inclusive }); }} />
      <PriceOverrideDialog open={!!override} onClose={() => setOverride(null)} current={override?.price_override_minor ?? override?.unit_price_minor ?? 0} onSet={(p) => override && updateLine(override.key, { price_override_minor: p })} />
      <StaffMealDialog open={staffOpen} onClose={() => setStaffOpen(false)} onConfirm={(reason) => patch({ is_staff_meal: true, staff_meal_reason: reason })} />
      <Dialog open={notesOpen} onClose={() => setNotesOpen(false)} title={editing ? `Notes for ${editing.name}` : "Order notes"} size="sm" footer={<><Button variant="secondary" onClick={() => setNotesOpen(false)}>Cancel</Button><Button onClick={() => { if (editing) updateLine(editing.key, { notes: notes || null }); else patch({ notes }); setNotesOpen(false); setEditing(null); }}>Save</Button></>}>
        <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="text-base" autoFocus /></Field>
      </Dialog>
      <BillPreviewDialog open={billOpen} onClose={() => setBillOpen(false)} cart={shownCart} />
      <PaymentDialog open={payOpen} onClose={() => setPayOpen(false)} cart={shownCart} onPay={pay} busy={busy} onCharges={canCharge ? updateCharges : undefined} onTaxChoice={chooseTax} onDiscount={canDiscount ? runDiscount : undefined} onCustomer={(c) => patch({ customer: c })} />
      <ReceiptDialog receipt={receipt?.receipt ?? null} change={receipt?.change} offline={receipt?.offline} onClose={() => { setReceipt(null); reset(); }} onNew={newOrder} />
      {/* SPEC REQUIRE_PIN_FOR_ORDER_UPDATE: the user's own 4-digit PIN before a reopened order is saved. */}
      <PinDialog open={!!pinAsk} title="Your PIN" what={`Save changes to ${cart.label ?? "the reopened order"}`} onClose={() => { pinAsk?.resolve(null); setPinAsk(null); }} onSubmit={(pin) => { pinAsk?.resolve(pin); setPinAsk(null); }} />
      {scanner.dialogs}
      {pinDialog}
    </PosShell>
  );
}

export default function PosPage() {
  return <Suspense fallback={null}><SellScreen /></Suspense>;
}
