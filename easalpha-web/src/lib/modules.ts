"use client";
import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import type { BusinessModule, BusinessModules, BusinessSettings, Session } from "@/lib/types";

/** Settings keys behind each module (the till reads them from its synced settings). */
export const MODULE_KEYS: Record<BusinessModule, string> = { customer_accounts: "modules.customer_accounts", payroll: "modules.payroll", canteen: "modules.canteen" };

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
  canteen: {
    title: "Canteen (factory mess)",
    summary: "Workers scan a finger at a kiosk, take one dish from the day's plan and collect with a token. Every meal goes on the worker's account and comes off the payroll run. Switching it on also switches on customer accounts.",
    screens: ["Kiosk and counter screens (paired devices)", "Meal sessions and daily plans", "Workers, meals and cancellations", "Daily, weekly and monthly reports"],
  },
};

/** Till side: is a module on, read from the synced settings store. */
export function moduleOn(settings: BusinessSettings | Record<string, unknown> | null | undefined, name: BusinessModule): boolean {
  return (settings as Record<string, unknown> | null | undefined)?.[MODULE_KEYS[name]] === true;
}

/** Review 6: GET /me feeds both the top bar pills and the modules, which asked for it separately on every page load.
 *  Both now go through this one fetch: requests made within two seconds of each other share a single call. */
export function fetchMe(qc: QueryClient, businessId: string | null | undefined): Promise<Session> {
  return qc.fetchQuery({ queryKey: ["me", businessId ?? null], queryFn: () => api<Session>("/me", { auth: "admin" }), staleTime: 2_000 });
}

/** Cached per business, so a login to another business in this tab never shows the last one's modules. */
const modulesKey = (businessId: string | null | undefined) => ["modules", businessId ?? null];

/** Writes the modules into the saved session when it is still that business's. Unlike setSession, it keeps the branch
 *  picked in the top bar. */
function saveModules(businessId: string, m: BusinessModules) {
  useAuthStore.setState((s) => (s.session?.business.id === businessId && JSON.stringify(s.session.modules) !== JSON.stringify(m) ? { session: { ...s.session, modules: m } } : {}));
}

/** Admin side: the business's modules. Starts from the saved session and refreshes from /me once per page load, so a
 *  change made on another computer shows up; sessions saved before modules existed load them the first time. */
export function useModules(): BusinessModules & { loaded: boolean } {
  const qc = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const businessId = session?.business.id ?? null;
  const q = useQuery({
    queryKey: modulesKey(businessId),
    queryFn: async () => (await fetchMe(qc, businessId)).modules ?? { customer_accounts: false, payroll: false, canteen: false },
    enabled: !!session,
    staleTime: 60_000,
  });
  useEffect(() => { if (q.data && businessId) saveModules(businessId, q.data); }, [q.data, businessId]);
  const m = q.data ?? session?.modules;
  return { customer_accounts: !!m?.customer_accounts || !!m?.canteen, payroll: !!m?.payroll, canteen: !!m?.canteen, loaded: !!m };
}

/** After the owner switches a module, everyone on this browser sees the new sidebar at once. */
export function useApplyModules() {
  const qc = useQueryClient();
  return (m: BusinessModules) => {
    const businessId = useAuthStore.getState().session?.business.id;
    if (!businessId) return;
    qc.setQueryData(modulesKey(businessId), m);
    saveModules(businessId, m);
  };
}
