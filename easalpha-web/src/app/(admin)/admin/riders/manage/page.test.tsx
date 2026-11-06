import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Rider, Session, StaffInvitation } from "@/lib/types";
import { ApiError, api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { useToastStore } from "@/store/toast";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/riders/manage", useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(), useParams: () => ({}) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));

import RidersPage from "./page";

// L2, 7 Nov 2026: a rider added with a phone on a login that never confirmed it became a staff invitation that no page
// listed; the row said login "none" and the owner was told "Rider saved", so nothing seemed to happen.
const RIDER_PERMS = ["app.admin", "RIDERS", "RIDER_VIEW", "RIDER_CREATE", "RIDER_EDIT", "RIDER_DELETE", "riders.manage", "cash.in_out"];
const signIn = (permissions: string[]) =>
  useAuthStore.setState({ session: { access_token: "t", refresh_token: "r", user: { name: "Owner" }, business: { id: "biz", name: "Victim Grill" }, branch: { id: "b1" }, membership: { id: "m1", role: { name: "Owner", system_key: "owner" } }, permissions, businesses: [], modules: {} } as unknown as Session, branchId: "b1" });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RidersPage /></QueryClientProvider>);

const rider = (over: Partial<Rider>): Rider => ({
  id: "r-asif", branch_id: "b1", membership_id: null, name: "Asif", phone: "+923211230003", vehicle: "bike", vehicle_no: null, address: null, charge_per_delivery_minor: 0, float_minor: 0, status: "available",
  last_lat: null, last_lng: null, last_seen_at: null, active: true, archived_at: null, open_deliveries: 0, temporary: false, assigned_count: 0, completed_count: 0, ...over,
});
const invitation = (over: Partial<StaffInvitation>): StaffInvitation => ({
  id: "inv-asif", name: "Asif", phone: "+923211230003", email: null, role: { id: "role-rider", name: "Rider", system_key: "rider" }, staff_type: "rider", cashier_role: null, has_pin: true,
  status: "pending", expires_at: "2026-11-21T10:00:00Z", created_at: "2026-11-07T10:00:00Z", url: "https://easalpha.com/invite/inv-asif", rider_id: "r-asif", ...over,
});
const cashierInvite = invitation({ id: "inv-ali", name: "Ali", phone: "+923331234567", role: { id: "role-cashier", name: "Cashier", system_key: "cashier" }, staff_type: "cashier", rider_id: null });
const staffRiderInvite = invitation({ id: "inv-imran", name: "Imran", phone: "+923211230002", staff_type: "admin", rider_id: null }); // the Rider role picked on the Admin staff page

let created: Record<string, unknown> | null = null;
let addAnswer: unknown = null;
beforeEach(() => {
  created = null;
  addAnswer = null;
  useToastStore.setState({ toasts: [] });
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation((async (path: string, opts: { method?: string; body?: Record<string, unknown> } = {}) => {
    if (path === "/riders" && opts.method === "POST") { created = opts.body ?? null; if (addAnswer instanceof Error) throw addAnswer; return addAnswer; }
    if (path === "/riders") return { data: [rider({}), rider({ id: "r-kashif", name: "Kashif", phone: "+923211234567", membership_id: "m-kashif" })] };
    if (path === "/staff/invitations") return { data: [invitation({}), cashierInvite, staffRiderInvite] };
    return { data: [] };
  }) as typeof api);
});
afterEach(() => { cleanup(); useAuthStore.setState({ session: null, branchId: null }); });

const loginCell = (name: string) => screen.getByRole("link", { name }).closest("tr")!;

describe("Manage Riders: logins waiting for the rider", () => {
  it("lists the rider invitations under Waiting to join, with their actions, and marks the rider invited", async () => {
    signIn([...RIDER_PERMS, "staff.manage"]);
    show();
    const waiting = await screen.findByRole("region", { name: "Waiting to join" });
    expect(within(waiting).getByText("Asif")).toBeInTheDocument();
    expect(within(waiting).getByText("Imran")).toBeInTheDocument();
    expect(within(waiting).queryByText("Ali")).toBeNull(); // a cashier's invitation belongs to the Cashiers screen
    expect(within(waiting).getAllByRole("button", { name: /Resend/ })).toHaveLength(2);
    expect(within(waiting).getByRole("button", { name: "Cancel the invitation for Asif" })).toBeInTheDocument();
    expect(within(loginCell("Asif")).getByText("Invited")).toBeInTheDocument();
    expect(within(loginCell("Kashif")).getByText("App")).toBeInTheDocument();
  });

  it("asks for no invitations without staff.manage, as the staff screens", async () => {
    signIn(RIDER_PERMS);
    show();
    expect(await screen.findByRole("link", { name: "Asif" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Waiting to join" })).toBeNull();
    expect(within(loginCell("Asif")).getByText("None")).toBeInTheDocument();
    expect(vi.mocked(api).mock.calls.map(([p]) => p)).not.toContain("/staff/invitations");
  });

  it("says an add became an invitation, and when the phone is already on the staff", async () => {
    signIn([...RIDER_PERMS, "staff.manage"]);
    const user = userEvent.setup();
    show();
    await screen.findByRole("link", { name: "Asif" });
    addAnswer = { ...rider({ id: "r-new", name: "Bilal", phone: "+923211230009" }), invited: true, invitation: invitation({ id: "inv-bilal", name: "Bilal", phone: "+923211230009", rider_id: "r-new" }), linked_existing_user: false };
    await user.click(screen.getByRole("button", { name: /Add rider/ }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Bilal");
    await user.type(within(dialog).getByLabelText(/4-digit PIN/), "6060");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    expect(created).toMatchObject({ name: "Bilal", create_login: true, pin: "6060" });
    expect(useToastStore.getState().toasts[0]).toMatchObject({ variant: "info", title: "Bilal added; the app login waits for them", description: expect.stringContaining("Waiting to join") });

    addAnswer = new ApiError("staff.exists", "Sara is already on your staff with this phone. Put them on the Rider role in Staff and their rider profile is made, or add this rider without a login.", 409);
    await user.click(screen.getByRole("button", { name: /Add rider/ }));
    const again = screen.getByRole("dialog");
    await user.type(within(again).getByLabelText("Name"), "Sara");
    await user.type(within(again).getByLabelText(/4-digit PIN/), "7070");
    await user.click(within(again).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.variant === "error")).toBe(true));
    expect(useToastStore.getState().toasts.find((t) => t.variant === "error")).toMatchObject({ title: "Could not save", description: expect.stringContaining("Rider role in Staff") });
    expect(screen.getByRole("dialog")).toBeInTheDocument(); // the form stays open to change
  });
});
