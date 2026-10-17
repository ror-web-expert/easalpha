import type { Permission, PermissionRegistry } from "@/lib/types";

export interface PermissionSection { name: string; items: Permission[] }

/** Permissions in sections by module, in the registry's own order, filtered by a search over the label and the
 *  description (never the code: codes are not shown to people). Empty sections are dropped. */
export function permissionSections(registry: PermissionRegistry | undefined | null, query = ""): PermissionSection[] {
  if (!registry) return [];
  const q = query.trim().toLowerCase();
  const match = (p: Permission) => !q || p.label.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.module.toLowerCase().includes(q);
  const names = [...registry.modules, ...registry.data.map((p) => p.module).filter((m) => !registry.modules.includes(m))];
  return Array.from(new Set(names)).map((name) => ({ name, items: registry.data.filter((p) => p.module === name && match(p)) })).filter((s) => s.items.length);
}
