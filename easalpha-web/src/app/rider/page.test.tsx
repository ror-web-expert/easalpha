import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { useRiderStore } from "@/components/rider/store";

const rider = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), usePathname: () => "/rider" }));
vi.mock("@/components/rider/api", () => ({ riderApi: (...a: unknown[]) => rider.api(...a), refreshRiderSession: async () => "ok" }));

import RiderHomePage from "./page";

// Screen walk of 7 Nov 2026 (L2): a member put on the Rider role from Staff had no rider profile, every list answered
// 403 rider.none, and the app sat on "0 open · loading" with nothing to say.
const session = { access_token: "a", refresh_token: "r", app: "rider", user: { name: "Kashif Raza" }, membership: { id: "m-kashif", role: { name: "Rider", system_key: "rider" } }, permissions: ["app.rider"] } as unknown as Session;
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RiderHomePage /></QueryClientProvider>);

beforeEach(() => {
  rider.api.mockReset();
  useRiderStore.setState({ session, cache: null, deviceToken: "d", hydrated: true });
});
afterEach(() => { cleanup(); useRiderStore.setState({ session: null, cache: null, deviceToken: null }); });

describe("Rider app without a rider profile", () => {
  it("says the login has no rider profile instead of loading for ever", async () => {
    rider.api.mockRejectedValue(new ApiError("rider.none", "No rider profile is linked to this login", 403));
    show();
    expect(await screen.findByText("Your login has no rider profile yet. Ask the owner to add you under Riders.")).toBeInTheDocument();
    expect(screen.getByText("No rider profile")).toBeInTheDocument();
    expect(screen.queryByText(/loading/)).toBeNull();
    expect(screen.queryByText("FLOAT YOU HOLD")).toBeNull();
    expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
  });

  it("shows the deliveries as before when the profile is there", async () => {
    rider.api.mockImplementation(async (path: string) => {
      if (path === "/rider/deliveries") return { rider: { id: "r-1", name: "Kashif Raza", float_minor: 0, permissions: [], temporary: false }, data: [] };
      if (path === "/rider/float") return { float_minor: 0, rows: [], settlement: { cash_collected_minor: 0, deliveries_count: 0, expected_minor: 0 } };
      return {};
    });
    show();
    expect(await screen.findByText("Nothing assigned")).toBeInTheDocument();
    expect(screen.queryByText("No rider profile")).toBeNull();
  });
});
