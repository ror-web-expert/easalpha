import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@/lib/types";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import LoginPage from "@/app/login/page";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span>{alt}</span> }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));

afterEach(() => {
  cleanup();
  useAuthStore.setState({ session: null, branchId: null, hydrated: false });
});

describe("Login", () => {
  it("drops what an earlier session cached before the new session is set", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["modules", "biz-a"], { customer_accounts: true, payroll: true });
    qc.setQueryData(["customers", {}], { data: [{ id: "c1", name: "Ali Raza" }] });
    const next = { business: { id: "biz-b", name: "Canteen B" }, branch: { id: "b2" }, modules: { customer_accounts: false, payroll: false } } as unknown as Session;
    vi.mocked(api).mockResolvedValue(next);
    useAuthStore.setState({ session: null, hydrated: true });
    let cachedWhenSet: number | null = null;
    const stop = useAuthStore.subscribe((s) => { if (s.session && cachedWhenSet === null) cachedWhenSet = qc.getQueryCache().getAll().length; });
    const user = userEvent.setup();
    render(<QueryClientProvider client={qc}><LoginPage /></QueryClientProvider>);
    await user.type(screen.getByPlaceholderText("you@restaurant.pk"), "owner@canteen.pk");
    await user.type(document.querySelector('input[type="password"]')!, "secret-pass");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin"));
    stop();
    expect(cachedWhenSet).toBe(0);
    expect(useAuthStore.getState().session?.business.id).toBe("biz-b");
    expect(qc.getQueryData(["modules", "biz-a"])).toBeUndefined();
  });
});
