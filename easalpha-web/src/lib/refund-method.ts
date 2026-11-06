// Which method a refund goes back through by default: the way the order was paid. What was put on the customer's
// account goes back to the account (QA 6 Nov 2026: an account sale was refunded in cash by default, the cash left the
// drawer and the account still carried the charge; the server now refuses that too).

/** "cash:4500,khata:2000" (the server's payment_method_summary) as code and amount pairs, largest first. */
export function paidBy(summary: string | null | undefined, payments: { method_code: string; amount_minor: number }[] = []): { code: string; amount_minor: number }[] {
  const totals = new Map<string, number>();
  for (const part of String(summary ?? "").split(",")) {
    const [code, amount] = part.split(":");
    if (code?.trim()) totals.set(code.trim(), (totals.get(code.trim()) ?? 0) + (Number(amount) || 0));
  }
  if (!totals.size) for (const p of payments) totals.set(p.method_code, (totals.get(p.method_code) ?? 0) + p.amount_minor);
  return [...totals].map(([code, amount_minor]) => ({ code, amount_minor })).sort((a, b) => b.amount_minor - a.amount_minor);
}

/** The refund method to offer first: the method that took most of the order, if it is still active; else cash. */
export function defaultRefundMethod(
  summary: string | null | undefined,
  methods: { code: string; kind: string; active?: boolean }[],
  payments: { method_code: string; amount_minor: number }[] = [],
): string {
  const active = methods.filter((m) => m.active !== false);
  for (const p of paidBy(summary, payments)) if (active.some((m) => m.code === p.code)) return p.code;
  return active.find((m) => m.kind === "cash")?.code ?? active[0]?.code ?? "cash";
}
