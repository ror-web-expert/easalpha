"use client";
// Money received against a customer's account at the till (a student paying the month's khata): recorded on the server
// when it answers, queued as a customer_payment sync record when it does not, with a printed receipt either way
// (6 Nov 2026 review, debit side, items 1 to 3).
import { api, ApiError } from "@/lib/api";
import { enqueue, isOnline, noteNetworkFailure } from "@/lib/sync";
import { uuid } from "@/lib/utils";
import { useCatalogStore } from "@/store/catalog";
import { useDeviceStore } from "@/store/device";
import { useCustomerStore } from "@/store/customers";
import { readRecentCustomers, rememberRecentCustomer } from "@/lib/pos-customers";
import type { Customer, CustomerPayment } from "@/lib/types";
import type { AccountPaymentReceipt } from "@/lib/print";
import { publicTaxRegistration } from "@/lib/receipt-format";

export interface ReceiveInput { amount_minor: number; method_code: string; reference?: string | null }
/** The customer as the dialog knows them (a search row, a cached row or the cart's customer). */
export interface AccountCustomer { id: string; name: string; khata_no?: string | number | null; balance_minor?: number | null }
export interface ReceiveResult {
  offline: boolean; id: string; number: string | null; received_at: string;
  /** The account before and after, as the till knows them: null when it has no balance for this customer. */
  previous_balance_minor: number | null; new_balance_minor: number | null;
  input: ReceiveInput; customer: AccountCustomer;
}

/**
 * POST /customers/:id/payments online (a cashier without khata.collect gets 403 approval.required, which the caller
 * resolves with a manager's PIN in `approver_pin`); offline, or when the server does not answer, a customer_payment
 * record is queued and the saved balance takes the amount off at once. `paymentId` is fixed for one press of Receive:
 * the server answers a repeat with the payment it already has, so a retry never takes the money twice.
 */
export async function receiveCustomerPayment(customer: AccountCustomer, input: ReceiveInput, approver_pin?: string, paymentId: string = uuid()): Promise<ReceiveResult> {
  const membershipId = useDeviceStore.getState().session?.membership?.id ?? null;
  const cached = useCustomerStore.getState().byId.get(customer.id);
  const before = cached?.balance_minor ?? customer.balance_minor ?? null;
  const reference = input.reference?.trim() || null;
  const sent = { ...input, reference };
  if (isOnline()) {
    try {
      const res = await api<{ payment: CustomerPayment; customer: Customer }>(`/customers/${customer.id}/payments`, { method: "POST", auth: "pos", body: { payment_id: paymentId, amount_minor: input.amount_minor, method_code: input.method_code, reference, approver_pin } });
      // The server's copy of the customer carries the new balance: the saved list and the recent list take it.
      await useCustomerStore.getState().apply([res.customer]);
      rememberRecentCustomer(res.customer);
      return { offline: false, id: res.payment.id, number: res.payment.number == null ? null : String(res.payment.number), received_at: res.payment.received_at, previous_balance_minor: res.customer.balance_minor + input.amount_minor, new_balance_minor: res.customer.balance_minor, input: sent, customer };
    } catch (e) {
      if (!(e instanceof ApiError && e.isNetwork)) throw e;
      noteNetworkFailure();
    }
  }
  // The same id as the online attempt: a POST that reached the server but timed out is a duplicate at replay, not a second payment.
  const id = paymentId;
  const client_created_at = new Date().toISOString();
  await enqueue({ type: "customer_payment", id, membership_id: membershipId ?? undefined, payload: { customer_id: customer.id, amount_minor: input.amount_minor, method_code: input.method_code, reference, direction: "received", client_created_at } });
  await useCustomerStore.getState().notePayment(customer.id, input.amount_minor);
  const recent = readRecentCustomers().find((r) => r.id === customer.id);
  if (recent) rememberRecentCustomer({ ...recent, balance_minor: (recent.balance_minor ?? 0) - input.amount_minor });
  return { offline: true, id, number: null, received_at: client_created_at, previous_balance_minor: before, new_balance_minor: before === null ? null : before - input.amount_minor, input: sent, customer };
}

/** What the printed ACCOUNT PAYMENT receipt says, from the result and the till's own store, branch and cashier. */
export function accountPaymentReceipt(r: ReceiveResult): AccountPaymentReceipt {
  const c = useCatalogStore.getState();
  const d = useDeviceStore.getState();
  const biz = c.catalog?.business ?? d.business;
  const branch = d.branch ?? c.catalog?.branch ?? null;
  const method = c.paymentMethods.find((m) => m.code === r.input.method_code);
  return {
    business: { name: biz?.name ?? "", legal_name: null, phone: d.business?.phone ?? null, email: null, logo_key: biz?.logo_key ?? null, currency: biz?.currency ?? "PKR" },
    // The public numbers only, as the order receipt takes them: a stored branch may still carry the tax API token (S1).
    branch: { name: branch?.name ?? "", address: branch?.address ?? null, city: branch?.city ?? null, phone: branch?.phone ?? null, tax_registration: publicTaxRegistration(branch?.tax_registration) },
    number: r.number, customer: { name: r.customer.name, khata_no: r.customer.khata_no == null ? null : String(r.customer.khata_no) },
    amount_minor: r.input.amount_minor, method: method?.name ?? r.input.method_code, reference: r.input.reference ?? null,
    previous_balance_minor: r.previous_balance_minor, new_balance_minor: r.new_balance_minor, received_at: r.received_at, cashier: d.session?.user?.name ?? null, offline: r.offline,
  };
}
