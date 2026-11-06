import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Users } from "lucide-react";
import type { Session, StaffInvitation } from "@/lib/types";
import { ApiError, api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { otpNext, inviteNext } from "@/lib/account-flows";
import { addOutcome } from "./staff-helpers";
import { SupportBanner, supportBannerText, switchableBusinesses } from "./support-banner";
import { StaffList } from "./staff-list";

// QA of 6 Nov 2026 (night): P1 strangers linked by an unproven phone or email, P3 support logins, P4 two businesses,
// P6 staff screens editable without staff.manage, P8 the password reset.
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
const params = vi.hoisted(() => ({ token: "tok" }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/admin/staff/cashiers", useParams: () => params, useSearchParams: () => new URLSearchParams("email=sara%40cafe.pk") }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span>{alt}</span> }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));

import InvitePage from "@/app/invite/[token]/page";
import ForgotPasswordPage from "@/app/forgot-password/page";

const signIn = (permissions: string[], extra: Partial<Session> = {}) =>
  useAuthStore.setState({ session: { access_token: "t", refresh_token: "r", user: { name: "Sana" }, business: { id: "biz", name: "Victim Grill" }, branch: { id: "b1" }, membership: { id: "m1", role: { name: "Owner", system_key: "owner" } }, permissions, businesses: [], ...extra } as unknown as Session, branchId: "b1" });
const show = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const invitation: StaffInvitation = { id: "inv1", name: "Ali", phone: "+923331234567", email: null, role: { id: "r1", name: "Cashier", system_key: "cashier" }, staff_type: "cashier", cashier_role: "cashier", has_pin: true, status: "pending", expires_at: "2026-11-20T10:00:00Z", created_at: "2026-11-06T10:00:00Z", url: "https://easalpha.com/invite/inv1abc", rider_id: null };

beforeEach(() => { vi.mocked(api).mockReset(); router.replace.mockReset(); });
afterEach(() => { cleanup(); useAuthStore.setState({ session: null, branchId: null }); });

describe("what the pages make of the API's answers", () => {
  it("otpNext: a password step with the inviting businesses, a joined message, or the error", () => {
    expect(otpNext(new ApiError("phone.password_required", "x", 403, { invitations: ["Victim Grill"] }))).toEqual({ kind: "password", invitations: ["Victim Grill"] });
    expect(otpNext(new ApiError("app.denied", "You joined Victim Grill as Cashier.", 403, { joined: [{ business: "Victim Grill", role: "Cashier" }] }))).toEqual({ kind: "joined", message: "You joined Victim Grill as Cashier." });
    expect(otpNext(new ApiError("app.denied", "You don't have access to this app", 403))).toEqual({ kind: "error", message: "You don't have access to this app" });
  });

  it("inviteNext: choose between the login's password and a new login, or closed", () => {
    expect(inviteNext(new ApiError("invitation.sign_in", "x", 409))).toEqual({ kind: "choose" });
    expect(inviteNext(new ApiError("invitation.closed", "Cancelled", 409))).toEqual({ kind: "closed", message: "Cancelled" });
    expect(inviteNext(new ApiError("code.invalid", "The code is wrong", 401))).toEqual({ kind: "error", message: "The code is wrong" });
  });

  it("addOutcome: an invitation is never called a link to an existing account", () => {
    expect(addOutcome({ invited: true, invitation }, "cashier")).toMatchObject({ tone: "info", title: "Invitation sent to Ali", body: expect.stringContaining("nothing is linked yet") });
    expect(addOutcome({ linked_existing_user: true } as never, "cashier").title).toBe("Linked to their EasAlpha login");
    expect(addOutcome({ linked_existing_user: false } as never, "cashier")).toEqual({ tone: "success", title: "Cashier added" });
  });

  it("switchableBusinesses: only a membership that opens the admin can be switched to", () => {
    const out = switchableBusinesses([{ id: "a", name: "A", slug: "a", role: "Manager", apps: ["admin", "pos"] }, { id: "b", name: "B", slug: "b", role: "Cashier", apps: ["pos"] }, { id: "c", name: "C", slug: "c", role: "Owner" }]);
    expect(out.map((o) => [o.business.id, o.admin])).toEqual([[ "a", true ], [ "b", false ], [ "c", true ]]);
  });
});

describe("the support banner (P3)", () => {
  const support = { session_id: "s1", reason: "Printer", expires_at: "2026-11-06T18:00:00Z", by: { name: "Hina", email: "hina@easalpha.com" } };

  it("names support and counts down to the end of the session", () => {
    const text = supportBannerText(support, "Victim Grill", Date.parse("2026-11-06T17:35:00Z"));
    expect(text).toContain("You are in Victim Grill as EasAlpha support (Hina).");
    expect(text).toContain("(25 min left)");
    expect(text).toContain("sign-in details, staff, devices and billing cannot be changed");
    expect(supportBannerText(support, "X", Date.parse("2026-11-06T19:00:00Z"))).toContain("Access has ended.");
  });

  it("shows only on a support session", () => {
    signIn(["settings.manage"]);
    const { container, rerender } = show(<SupportBanner />);
    expect(container.querySelector("[data-support-banner]")).toBeNull();
    act(() => { signIn(["settings.manage"], { support }); });
    rerender(<QueryClientProvider client={new QueryClient()}><SupportBanner /></QueryClientProvider>);
    expect(screen.getByRole("status").textContent).toContain("EasAlpha support (Hina)");
  });
});

describe("the staff screens (P1, P6, P7)", () => {
  const member = { id: "m2", business_id: "biz", user_id: "u2", role: { id: "r1", name: "Cashier", system_key: "cashier" }, status: "active", all_branches: true, branch_ids: [], staff_type: "cashier", cashier_role: "cashier", user: { id: "u2", name: "Bilal" } };

  it("is for looking only without staff.manage: no add, no role menus, no PIN or deactivate", async () => {
    signIn(["app.admin", "reports.view_all"]);
    vi.mocked(api).mockImplementation((async (path: string) => (path === "/staff" ? { data: [member] } : { data: [] })) as typeof api);
    show(<StaffList staffType="cashier" title="Cashiers" description="Till staff." icon={Users} />);
    expect(await screen.findByText("Bilal")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add cashier/ })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /Role for/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Set PIN" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Deactivate" })).toBeNull();
    expect(vi.mocked(api).mock.calls.map(([p]) => p)).not.toContain("/staff/invitations");
  });

  it("lists who is waiting to join, and says an add was an invitation", async () => {
    signIn(["app.admin", "staff.manage"]);
    vi.mocked(api).mockImplementation((async (path: string, opts?: { method?: string }) => {
      if (path === "/staff" && opts?.method === "POST") return { invited: true, invitation };
      if (path === "/staff/invitations") return { data: [invitation] };
      if (path === "/roles") return { data: [{ id: "r1", name: "Cashier", system_key: "cashier", permissions: [] }] };
      return { data: path === "/staff" ? [member] : [] };
    }) as typeof api);
    const user = userEvent.setup();
    show(<StaffList staffType="cashier" title="Cashiers" description="Till staff." icon={Users} />);
    const waiting = await screen.findByRole("region", { name: "Waiting to join" });
    expect(within(waiting).getByText("Ali")).toBeTruthy();
    expect(within(waiting).getByText("+923331234567")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Add cashier/ }));
    await user.type(screen.getByLabelText("Name"), "Ali");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(vi.mocked(api).mock.calls.some(([p, o]) => p === "/staff" && (o as { method?: string })?.method === "POST")).toBe(true));
  });
});

describe("the invitation page (P1)", () => {
  const summary = { business: { name: "Victim Grill", logo_key: null }, role: "Manager", name: "Ali", proof: "phone", to: "+92******4567", status: "pending", expires_at: "2026-11-20T10:00:00Z" };

  it("sends the code, offers the login's password or a new login, and signs a manager in", async () => {
    const session = { access_token: "a", refresh_token: "r", business: { id: "biz", name: "Victim Grill" }, branch: { id: "b1" }, joined: true } as unknown as Session;
    vi.mocked(api).mockImplementation((async (path: string, opts?: { body?: Record<string, unknown> }) => {
      if (path === "/invitations/tok") return summary;
      if (path === "/invitations/tok/code") return { sent: true, dev_code: "123456" };
      if (opts?.body?.new_login) return session;
      throw new ApiError("invitation.sign_in", "On a login that has not confirmed it", 409);
    }) as typeof api);
    const user = userEvent.setup();
    show(<InvitePage />);
    expect(await screen.findByText(/Victim Grill invited Ali to EasAlpha as Manager/)).toBeTruthy();
    expect(screen.getByText(/by WhatsApp to \+92\*\*\*\*\*\*4567/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Send code" }));
    await user.click(await screen.findByRole("button", { name: "Join" }));
    expect(await screen.findByLabelText("Password of that login")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Join with a new login" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin"));
    expect(useAuthStore.getState().session?.access_token).toBe("a");
  });

  it("says when the invitation is closed", async () => {
    vi.mocked(api).mockImplementation((async () => ({ ...summary, status: "cancelled" })) as typeof api);
    show(<InvitePage />);
    expect(await screen.findByText("This invitation is no longer open")).toBeTruthy();
  });
});

describe("the password reset page (P8)", () => {
  it("sends a code to the email, sets the new password and signs in", async () => {
    const session = { access_token: "n", refresh_token: "r", business: { id: "biz", name: "Cafe" }, branch: { id: "b1" } } as unknown as Session;
    vi.mocked(api).mockImplementation((async (path: string) => {
      if (path === "/auth/password/forgot") return { sent: true, dev_code: "654321" };
      if (path === "/auth/password/reset") return { reset: true };
      if (path === "/auth/login") return session;
      throw new Error("unexpected " + path);
    }) as typeof api);
    const user = userEvent.setup();
    show(<ForgotPasswordPage />);
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("sara@cafe.pk");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText(/If sara@cafe.pk has an EasAlpha login, a code is on its way/)).toBeTruthy();
    await user.type(screen.getByLabelText(/New password/), "brand-new-pass");
    await user.click(screen.getByRole("button", { name: "Set new password" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin"));
    expect(vi.mocked(api).mock.calls.find(([p]) => p === "/auth/password/reset")?.[1]).toMatchObject({ body: { email: "sara@cafe.pk", code: "654321", password: "brand-new-pass" } });
  });
});
