import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AuditFilterBar } from "./audit-filters";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));

afterEach(cleanup);

// Review of 6 Nov 2026, R16: the actions the fix pass added are in the Action filter, by their labels.
describe("AuditFilterBar", () => {
  it("lists every action the API names, by its label", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => (path === "/audit_logs/entities"
      ? { data: ["orders"], actions: ["create", "client_time_clamped", "khata_over_limit_offline", "approve"], action_labels: { create: "Create", client_time_clamped: "Till clock corrected", khata_over_limit_offline: "Khata over limit (offline)", approve: "Manager approval" } }
      : { data: [] }) as never);
    const filters = { range: { from: "2026-11-01", to: "2026-11-06" }, userId: "", action: "", table: "", recordId: "" };
    render(<QueryClientProvider client={new QueryClient()}><AuditFilterBar value={filters} onChange={() => {}} /></QueryClientProvider>);
    const select = screen.getByLabelText("Action");
    expect(await within(select).findByRole("option", { name: "Till clock corrected" })).toHaveValue("client_time_clamped");
    expect(within(select).getByRole("option", { name: "Khata over limit (offline)" })).toHaveValue("khata_over_limit_offline");
    expect(within(select).getByRole("option", { name: "Manager approval" })).toHaveValue("approve");
  });

  // S13: the Entity filter listed table names (order_items, memberships).
  it("lists entities by their labels, and a table without one by its words", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => (path === "/audit_logs/entities"
      ? { data: ["memberships", "order_items", "stock_documents"], actions: [], entity_labels: { memberships: "Staff", order_items: "Order items" } }
      : { data: [] }) as never);
    const filters = { range: { from: "2026-11-01", to: "2026-11-06" }, userId: "", action: "", table: "", recordId: "" };
    render(<QueryClientProvider client={new QueryClient()}><AuditFilterBar value={filters} onChange={() => {}} /></QueryClientProvider>);
    const select = screen.getByLabelText("Entity");
    expect(await within(select).findByRole("option", { name: "Staff" })).toHaveValue("memberships");
    expect(within(select).getByRole("option", { name: "Order items" })).toHaveValue("order_items");
    expect(within(select).getByRole("option", { name: "Stock documents" })).toHaveValue("stock_documents");
  });
});
