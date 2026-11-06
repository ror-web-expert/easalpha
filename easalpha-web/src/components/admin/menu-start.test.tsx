import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, type RequestOptions } from "@/lib/api";

// S7 and S8 (6 Nov 2026): a new owner hit a dead end building the menu, and archived products could not be restored.
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), id: "new" }));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin", useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => nav.params, useParams: () => ({ id: nav.id }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));

import CatalogPage from "@/app/(admin)/admin/products/catalog/page";
import ProductPage from "@/app/(admin)/admin/products/catalog/[id]/page";
import CategoriesPage from "@/app/(admin)/admin/products/categories/page";

type Handler = (path: string, opts?: RequestOptions) => unknown;
let handler: Handler;
const calls = () => vi.mocked(api).mock.calls.map(([path, opts]) => ({ path: path as string, method: (opts as RequestOptions | undefined)?.method ?? "GET", body: (opts as RequestOptions | undefined)?.body, query: (opts as RequestOptions | undefined)?.query }));

let qc: QueryClient;
const show = (ui: React.ReactNode) => render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  nav.params = new URLSearchParams();
  nav.id = "new";
  handler = () => ({ data: [], next_cursor: null });
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation((async (path: string, opts?: RequestOptions) => handler(path, opts)) as typeof api);
});
afterEach(() => cleanup());

describe("a catalog with nothing in it", () => {
  it("says how to start, links to a new category and loads the sample menu", async () => {
    show(<CatalogPage />);
    expect(await screen.findByText("Your menu is empty")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add a category/ })).toHaveAttribute("href", "/admin/products/categories?new=1");
    fireEvent.click(screen.getByRole("button", { name: /Load the sample menu/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Load it" }));
    await waitFor(() => expect(calls()).toContainEqual(expect.objectContaining({ path: "/onboarding/sample_menu", method: "POST" })));
  });

  it("lists archived products on their own and restores one", async () => {
    const chai = { id: "p1", name: "Chai", category_id: "c1", base_price_minor: 8000, active: false, show_online: true, archived_at: "2026-11-06T10:00:00Z", discount_value: "0.0", discount_type: "percent", image_key: null, variants: [], barcodes: [] };
    handler = (path, opts) => (path === "/products" && opts?.query?.archived === "true" ? { data: [chai], next_cursor: null } : { data: [], next_cursor: null });
    show(<CatalogPage />);
    fireEvent.click(await screen.findByLabelText("Archived"));
    fireEvent.click(await screen.findByRole("button", { name: "Restore Chai" }));
    await waitFor(() => expect(calls()).toContainEqual(expect.objectContaining({ path: "/products/p1/restore", method: "POST" })));
  });
});

describe("a new product with no category yet", () => {
  it("offers to add one and says why Save is greyed", async () => {
    show(<ProductPage />);
    expect(await screen.findByText("Enter the product name to save.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Product name"), { target: { value: "Chai" } });
    expect(await screen.findByText("Add a category first: every product sits in one.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    handler = (path, opts) => (path === "/categories" && opts?.method === "POST" ? { id: "c9", name: "Drinks" } : { data: [], next_cursor: null });
    fireEvent.click(screen.getByRole("button", { name: /Add a category/ }));
    fireEvent.change(await screen.findByLabelText("Category name"), { target: { value: "Drinks" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(calls()).toContainEqual(expect.objectContaining({ path: "/categories", method: "POST", body: { name: "Drinks" } })));
  });
});

describe("a new category with no menu yet", () => {
  it("opens from ?new=1, says the menu is made with it and saves without a menu_id", async () => {
    nav.params = new URLSearchParams("new=1");
    show(<CategoriesPage />);
    expect(await screen.findByDisplayValue("Main menu")).toBeDisabled();
    expect(screen.getByText("Enter a name to save.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Burgers" } });
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(calls().find((c) => c.path === "/categories" && c.method === "POST")?.body).toMatchObject({ name: "Burgers", menu_id: undefined }));
  });
});
