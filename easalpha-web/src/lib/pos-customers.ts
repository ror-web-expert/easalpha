// The till's customer search helpers (pure, tested in pos-customers.test.ts).
import type { Customer } from "@/lib/types";
import type { CartCustomer } from "@/store/cart";
import { formatMoney } from "@/lib/money";

/** Search once the cashier has typed two letters, or any digit (a khata or roll number can be one digit). */
export function searchReady(term: string): boolean {
  const t = term.trim();
  return t.length >= 2 || /\d/.test(t);
}

/** What the New customer form starts with: a typed number becomes the phone, typed words the name. */
export function newCustomerPrefill(query: string): { name: string; phone: string } {
  const q = query.trim();
  if (/^[+\d\s-]+$/.test(q) && /\d{4,}/.test(q.replace(/\D/g, ""))) return { name: "", phone: q };
  return { name: q, phone: "+92" };
}

/** The customer as the cart keeps it. */
export function toCartCustomer(c: Pick<Customer, "id" | "name" | "phone" | "balance_minor" | "credit_limit_minor">): CartCustomer {
  return { id: c.id, name: c.name, phone: c.phone, balance_minor: c.balance_minor, credit_limit_minor: c.credit_limit_minor };
}

/** "Khata 12 · Roll R-12 · Room C-7 · 0300 1112233", leaving out what is missing. */
export function customerDetails(c: Pick<Customer, "khata_no" | "member_no" | "room" | "phone" | "guardian_phone">): string {
  return [
    c.khata_no ? `Khata ${c.khata_no}` : null,
    c.member_no ? `Roll ${c.member_no}` : null,
    c.room ? `Room ${c.room}` : null,
    c.phone ? c.phone : c.guardian_phone ? `Guardian ${c.guardian_phone}` : null,
  ].filter(Boolean).join(" · ");
}

/**
 * The account line on the payment screen: what they owe now, their limit, and what this sale leaves them owing. A
 * customer that came with a saved order carries no account figures: a missing balance or limit is unknown (null
 * here), never "owes nothing" or "no limit", and no over-limit warning is given without both.
 */
export function accountSummary(c: { balance_minor?: number; credit_limit_minor?: number | null }, saleMinor: number, currency?: string) {
  const balance = c.balance_minor;
  const limit = c.credit_limit_minor; // null: no limit; undefined: not known
  const after = balance === undefined ? null : balance + Math.max(0, saleMinor);
  const owes = balance === undefined ? null : balance > 0 ? `owes ${formatMoney(balance, currency)}` : balance < 0 ? `${formatMoney(-balance, currency)} in advance` : "owes nothing";
  const limitText = limit === undefined ? null : limit === null ? "no limit" : limit === 0 ? "khata not allowed" : `limit ${formatMoney(limit, currency)}`;
  const over = after !== null && limit != null && after > limit;
  return { owes, limitText, after, afterText: after === null ? null : `${after < 0 ? `${formatMoney(-after, currency)} in advance` : formatMoney(after, currency)} after this sale`, over,
    overText: over ? (limit === 0 ? "Khata is not allowed for this customer. The till will refuse it." : `This passes the limit of ${formatMoney(limit as number, currency)} by ${formatMoney((after as number) - (limit as number), currency)}. The till will refuse it.`) : null };
}
