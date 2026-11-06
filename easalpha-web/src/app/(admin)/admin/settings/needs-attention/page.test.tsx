import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, SyncRejection } from "@/lib/types";
import { api } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));

import SyncPage from "./page";
import { useAuthStore } from "@/store/auth";

// K7 (QA of 6 Nov 2026): refusals a till's retry or Dismiss settled stayed Open here. The server now resolves them;
// this screen lists the open ones unless Show resolved is ticked.
const session = { access_token: "t", refresh_token: "r", user: { name: "Owner" }, business: { id: "b", name: "Cafe", plan: null }, branch: { id: "br", name: "Main" }, businesses: [],
  membership: { role: { name: "Owner", system_key: "owner" } }, permissions: ["settings.manage"] } as unknown as Session;
const open: SyncRejection = { id: "r-1", device_id: "d-1", record_type: "order", record_id: "o-1", code: "approval.required", message: "A manager must approve", payload: {}, resolved_at: null, resolution: null, created_at: "2026-11-06T09:00:00Z" };
const settled: SyncRejection = { ...open, id: "r-2", record_id: "o-2", resolved_at: "2026-11-06T09:05:00Z", resolution: "accepted" };
const listCalls = () => vi.mocked(api).mock.calls.filter((c) => c[0] === "/sync/rejections").map((c) => (c[1] as { query: Record<string, unknown> }).query);

configure({ asyncUtilTimeout: 4000 });

beforeEach(() => {
  useAuthStore.setState({ session, branchId: "br" });
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation((async (path: string, opts?: { query?: Record<string, unknown> }) =>
    path === "/sync/rejections" ? { data: opts?.query?.include_resolved === "true" ? [open, settled] : [open], next_cursor: null } : undefined) as typeof api);
});
afterEach(() => { cleanup(); useAuthStore.setState({ session: null, branchId: null }); });

describe("Settings, Needs attention", () => {
  it("lists the open refusals by default and the resolved ones only when asked", async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SyncPage /></QueryClientProvider>);
    expect(await screen.findByText("A manager must approve")).toBeInTheDocument();
    expect(listCalls()[0].include_resolved).toBeFalsy(); // sent as nothing: the API's default is open only
    expect(screen.queryByText(/resolved · accepted/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Show resolved"));
    expect(await screen.findByText(/resolved · accepted/)).toBeInTheDocument();
    await waitFor(() => expect(listCalls().at(-1)?.include_resolved).toBe("true"));
  });
});
