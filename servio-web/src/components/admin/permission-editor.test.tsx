import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Membership, MembershipPermissions, Permission, PermissionPreset, PermissionRegistry } from "@/lib/types";
import { PermissionEditor, applyPreset, baseline, impliedBy, moduleCounts, sameSelection, selectAll, toggle } from "./permission-editor";

vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

const perm = (code: string, module: string, extra: Partial<Permission> = {}): Permission =>
  ({ code, module, label: code.toLowerCase().replace(/_/g, " "), description: `${code} description`, surface: "both", restriction: false, implies: [], spec: !code.includes("."), ...extra });

const registry: PermissionRegistry = {
  modules: ["Dashboard", "Take Orders", "Security", "Servio extras"],
  data: [
    perm("DASHBOARD", "Dashboard", { surface: "software", implies: ["reports.view_own"] }),
    perm("VIEW_DAILY_SALES", "Dashboard", { surface: "app" }),
    perm("SETTINGS", "Dashboard"),
    perm("SALES_WALKIN", "Take Orders", { implies: ["orders.create"] }),
    perm("SALES_TAKEAWAY", "Take Orders", { implies: ["orders.create"] }),
    perm("REQUIRE_PIN_FOR_ORDER_UPDATE", "Security", { restriction: true }),
    perm("orders.create", "Servio extras"),
    perm("reports.view_own", "Servio extras"),
  ],
};

describe("permission editor selection logic", () => {
  it("toggle adds a missing code and removes a present one", () => {
    expect(toggle(["A"], "B")).toEqual(["A", "B"]);
    expect(toggle(["A", "B"], "A")).toEqual(["B"]);
  });

  it("applyPreset replaces the selection with the preset's codes, without duplicates", () => {
    expect(applyPreset({ codes: ["SALES_WALKIN", "DASHBOARD", "SALES_WALKIN"] })).toEqual(["SALES_WALKIN", "DASHBOARD"]);
  });

  it("selectAll ticks every SPEC code, restrictions included, and keeps ticked Servio extras", () => {
    const out = selectAll(registry.data, ["orders.create", "SETTINGS"]);
    expect(out).toContain("REQUIRE_PIN_FOR_ORDER_UPDATE");
    expect(out).toContain("orders.create");
    expect(out.filter((c) => !c.includes(".")).length).toBe(6);
    expect(out).not.toContain("reports.view_own");
  });

  it("moduleCounts gives granted-of-total per module in API order", () => {
    expect(moduleCounts(registry, ["DASHBOARD", "SETTINGS", "SALES_WALKIN", "orders.create", "UNKNOWN"])).toEqual([
      { name: "Dashboard", total: 3, granted: 2 },
      { name: "Take Orders", total: 2, granted: 1 },
      { name: "Security", total: 1, granted: 0 },
      { name: "Servio extras", total: 2, granted: 1 },
    ]);
  });

  it("impliedBy lists Servio codes the ticked SPEC codes imply but that are not ticked", () => {
    expect([...impliedBy(registry.data, ["DASHBOARD", "SALES_WALKIN", "orders.create"])]).toEqual(["reports.view_own"]);
  });

  it("sameSelection ignores order and duplicates", () => {
    expect(sameSelection(["A", "B", "B"], ["B", "A"])).toBe(true);
    expect(sameSelection(["A"], ["A", "B"])).toBe(false);
  });

  it("baseline: owner holds everything, role shows effective, custom shows granted", () => {
    const access = { owner: false, mode: "role" as const, granted: [], effective: ["DASHBOARD", "reports.view_own"] };
    expect(baseline(access, registry.data)).toEqual(["DASHBOARD", "reports.view_own"]);
    expect(baseline({ ...access, mode: "custom", granted: ["SETTINGS"] }, registry.data)).toEqual(["SETTINGS"]);
    expect(baseline({ ...access, owner: true }, registry.data)).toHaveLength(registry.data.length);
  });
});

describe("PermissionEditor", () => {
  const member: Membership = {
    id: "m1", business_id: "b", user_id: "u", role: { id: "r1", name: "Cashier", system_key: "cashier" }, status: "active", all_branches: true, branch_ids: [],
    has_pin: true, pin_locked: false, invited_via: null, created_at: "2026-10-01T00:00:00Z", deactivated_at: null,
    staff_type: "cashier", cashier_role: "cashier", permissions_mode: "role",
    user: { id: "u", name: "Ali Raza", email: null, phone: "+923001112233", locale: null, two_factor_enabled: false, last_login_at: null },
  };
  const access: MembershipPermissions = {
    membership_id: "m1", mode: "role", owner: false, granted: ["orders.create"], effective: ["orders.create", "SALES_WALKIN", "SALES_TAKEAWAY"],
    modules: [], takes_effect: "next sign-in",
  };
  const presets: PermissionPreset[] = [
    { key: "cashier", name: "Cashier", codes: ["DASHBOARD", "SALES_WALKIN"] },
    { key: "supervisor", name: "Supervisor", codes: ["DASHBOARD", "SALES_WALKIN", "SALES_TAKEAWAY", "SETTINGS"] },
    { key: "manager", name: "Manager", codes: ["DASHBOARD", "VIEW_DAILY_SALES", "SETTINGS", "SALES_WALKIN", "SALES_TAKEAWAY"] },
  ];
  let puts: unknown[];

  beforeEach(() => {
    puts = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace(/^.*\/api\/v1/, "");
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
      if (path === "/staff/m1") return json(member);
      if (path === "/roles/permissions") return json(registry);
      if (path === "/roles/presets") return json({ data: presets });
      if (path === "/staff/m1/permissions" && init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as { codes: string[] };
        puts.push(body);
        return json({ ...access, mode: "custom", granted: body.codes, effective: body.codes });
      }
      if (path === "/staff/m1/permissions") return json(access);
      return new Response(JSON.stringify({ error: { code: "not_found", message: path } }), { status: 404 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const mount = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={qc}><PermissionEditor membershipId="m1" /></QueryClientProvider>);
  };

  it("pre-fills a role member from the effective set and shows module counts", async () => {
    mount();
    expect(await screen.findByText("Ali Raza")).toBeInTheDocument();
    expect(screen.getByText("Access comes from the role until you save a custom set.")).toBeInTheDocument();
    expect(screen.getByText(/next sign-in/)).toBeInTheDocument();
    expect(screen.getByText("0/3")).toBeInTheDocument();
    expect(screen.getByText("2/2")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("applies a preset, enables Save, PUTs the codes and shows the custom mode", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("Ali Raza");
    await user.click(screen.getByRole("button", { name: "Supervisor" }));
    expect(screen.getByText("2/3")).toBeInTheDocument();
    expect(screen.queryByText("0/3")).toBeNull();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();
    await user.click(save);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ codes: presets[1].codes });
    expect(await screen.findByText("Custom set")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeDisabled());
  });

  it("shows code, surface and RESTRICTION badges for the selected module", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("Ali Raza");
    expect(screen.getByText("Software")).toBeInTheDocument();
    expect(screen.getByText("App")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Security/ }));
    expect(screen.getByText("REQUIRE_PIN_FOR_ORDER_UPDATE")).toBeInTheDocument();
    expect(screen.getByText("RESTRICTION")).toBeInTheDocument();
    expect(screen.getByText(/adds a step rather than opening a door/)).toBeInTheDocument();
  });
});
