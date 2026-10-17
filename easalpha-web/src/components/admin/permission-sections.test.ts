import { describe, expect, it } from "vitest";
import type { Permission, PermissionRegistry } from "@/lib/types";
import { permissionSections } from "./permission-sections";

const perm = (code: string, module: string, label: string, description = label): Permission => ({ code, module, label, description, surface: "both", restriction: false, implies: [], spec: true });
const registry: PermissionRegistry = {
  modules: ["Dashboard", "Sales", "Orders"],
  data: [perm("VIEW_DAILY_SALES", "Dashboard", "Daily sales", "See today's sales on the dashboard"), perm("SALES_WALKIN", "Sales", "Walk-in orders"), perm("SALES_TAKEAWAY", "Sales", "Takeaway orders"), perm("OFFLINE_ORDERS", "Orders", "Offline orders"), perm("printers.manage", "Printers", "Manage printers")],
};

describe("permission sections (review 4.6)", () => {
  it("groups by module in the registry's order, with modules missing from the list at the end", () => {
    expect(permissionSections(registry).map((s) => [s.name, s.items.length])).toEqual([["Dashboard", 1], ["Sales", 2], ["Orders", 1], ["Printers", 1]]);
  });
  it("searches labels and descriptions, never codes", () => {
    expect(permissionSections(registry, "takeaway").map((s) => s.items.map((p) => p.label))).toEqual([["Takeaway orders"]]);
    expect(permissionSections(registry, "today's").map((s) => s.name)).toEqual(["Dashboard"]);
    expect(permissionSections(registry, "SALES_WALKIN")).toEqual([]);
  });
});
