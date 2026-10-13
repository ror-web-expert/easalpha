import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BusinessModules, Session } from "@/lib/types";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { useApplyModules, useModules } from "./modules";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));

const ON: BusinessModules = { customer_accounts: true, payroll: true };
const OFF: BusinessModules = { customer_accounts: false, payroll: false };
const sessionFor = (id: string, modules: BusinessModules) => ({ business: { id, name: id }, branch: { id: `${id}-main` }, modules } as unknown as Session);

let qc: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(api).mockReset();
});
afterEach(() => {
  cleanup();
  useAuthStore.setState({ session: null, branchId: null });
});

describe("useModules", () => {
  it("never shows the last business's modules to the next business that logs in on this tab", async () => {
    vi.mocked(api).mockResolvedValueOnce({ modules: ON });
    act(() => useAuthStore.getState().setSession(sessionFor("a", ON)));
    const { result } = renderHook(() => useModules(), { wrapper });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(result.current.customer_accounts).toBe(true);

    // Within the minute A's answer stays fresh, business B logs in here.
    vi.mocked(api).mockResolvedValueOnce({ modules: OFF });
    act(() => useAuthStore.getState().setSession(sessionFor("b", OFF)));
    expect(result.current).toEqual({ ...OFF, loaded: true });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2)); // B's own /me
    await waitFor(() => expect(result.current.customer_accounts).toBe(false));
    expect(useAuthStore.getState().session?.modules).toEqual(OFF);
  });

  it("refreshes the saved session from /me but keeps the branch picked in the top bar", async () => {
    vi.mocked(api).mockResolvedValue({ modules: { customer_accounts: true, payroll: false } });
    act(() => { useAuthStore.getState().setSession(sessionFor("a", OFF)); useAuthStore.getState().setBranch("a-second"); });
    renderHook(() => useModules(), { wrapper });
    await waitFor(() => expect(useAuthStore.getState().session?.modules?.customer_accounts).toBe(true));
    expect(useAuthStore.getState().branchId).toBe("a-second");
  });
});

describe("useApplyModules", () => {
  it("updates this business's cached modules and session at once, and keeps the branch", async () => {
    vi.mocked(api).mockResolvedValue({ modules: { customer_accounts: true, payroll: false } });
    act(() => { useAuthStore.getState().setSession(sessionFor("a", OFF)); useAuthStore.getState().setBranch("a-second"); });
    const { result } = renderHook(() => ({ modules: useModules(), apply: useApplyModules() }), { wrapper });
    act(() => result.current.apply({ customer_accounts: true, payroll: false }));
    expect(result.current.modules.customer_accounts).toBe(true);
    expect(qc.getQueryData(["modules", "a"])).toEqual({ customer_accounts: true, payroll: false });
    expect(useAuthStore.getState().session?.modules?.customer_accounts).toBe(true);
    expect(useAuthStore.getState().branchId).toBe("a-second");
  });
});
