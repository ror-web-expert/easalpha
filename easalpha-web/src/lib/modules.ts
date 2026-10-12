"use client";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import type { BusinessModule, BusinessModules, BusinessSettings, Session } from "@/lib/types";

/** Settings keys behind each module (the till reads them from its synced settings). */
export const MODULE_KEYS: Record<BusinessModule, string> = { customer_accounts: "modules.customer_accounts", payroll: "modules.payroll" };

export const MODULE_INFO: Record<BusinessModule, { title: string; summary: string; screens: string[] }> = {
  customer_accounts: {
    title: "Customer accounts (khata)",
    summary: "Sell on account and collect later: hostels, canteens, offices and regular customers who pay at month end.",
    screens: ["Khata payment on the POS", "Customer Ledger, Payments, Account and AR Aging", "Opening balances and adjustments", "Monthly bills on WhatsApp and print"],
  },
  payroll: {
    title: "Payroll and wages",
    summary: "Staff pay: monthly salary, daily or weekly wages, advances, attendance and the fingerprint device.",
    screens: ["Employees, Advances and Run Payroll", "Pay Wages and Employee Statement", "Attendance and Fingerprint", "WhatsApp messages to staff"],
  },
};

/** Till side: is a module on, read from the synced settings store. */
export function moduleOn(settings: BusinessSettings | Record<string, unknown> | null | undefined, name: BusinessModule): boolean {
  return (settings as Record<string, unknown> | null | undefined)?.[MODULE_KEYS[name]] === true;
}

/** Admin side: the business's modules. Starts from the saved session and refreshes from /me once per page load, so a
 *  change made on another computer shows up; sessions saved before modules existed load them the first time. */
export function useModules(): BusinessModules & { loaded: boolean } {
  const session = useAuthStore((s) => s.session);
  const q = useQuery({
    queryKey: ["modules"],
    queryFn: async () => (await api<Session>("/me", { auth: "admin" })).modules ?? { customer_accounts: false, payroll: false },
    enabled: !!session,
    staleTime: 60_000,
  });
  useEffect(() => {
    const m = q.data;
    const cur = useAuthStore.getState().session;
    if (m && cur && JSON.stringify(cur.modules) !== JSON.stringify(m)) useAuthStore.getState().setSession({ ...cur, modules: m });
  }, [q.data]);
  const m = q.data ?? session?.modules;
  return { customer_accounts: !!m?.customer_accounts, payroll: !!m?.payroll, loaded: !!m };
}

/** After the owner switches a module, everyone on this browser sees the new sidebar at once. */
export function useApplyModules() {
  const qc = useQueryClient();
  return (m: BusinessModules) => {
    qc.setQueryData(["modules"], m);
    const cur = useAuthStore.getState().session;
    if (cur) useAuthStore.getState().setSession({ ...cur, modules: m });
  };
}
