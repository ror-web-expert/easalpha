import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "@/lib/api";

// S3 (6 Nov 2026): Chrome in en-US with its clock on Asia/Karachi and a +92 phone created a US business.
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));

import { SignupForm } from "./signup-form";

const zone = (timeZone: string) => {
  const real = Intl.DateTimeFormat.prototype.resolvedOptions;
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (this: Intl.DateTimeFormat) { return { ...real.call(this), timeZone }; });
};
const country = () => (screen.getByLabelText("Country") as HTMLSelectElement).value;
const show = () => render(<QueryClientProvider client={new QueryClient()}><SignupForm /></QueryClientProvider>);

beforeEach(() => {
  vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
  vi.mocked(api).mockReset();
  vi.mocked(api).mockResolvedValue({ access_token: "a" } as never);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("SignupForm country", () => {
  it("starts in Pakistan when the clock says Karachi, whatever the browser language", async () => {
    zone("Asia/Karachi");
    show();
    await waitFor(() => expect(country()).toBe("PK"));
    expect((screen.getByLabelText("Mobile number") as HTMLInputElement).value).toBe("+92 ");
  });

  it("starts in the US for a US clock, and moves with a number typed with another code until a country is picked", async () => {
    zone("America/Chicago");
    show();
    await waitFor(() => expect(country()).toBe("US"));
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "+92 300 1234567" } });
    expect(country()).toBe("PK");
    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "AE" } });
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "+92 300 1234568" } });
    expect(country()).toBe("AE"); // the owner's own pick stays
  });

  it("sends the detected country's currency and time zone with the sign-up", async () => {
    zone("Asia/Karachi");
    show();
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Sana Iqbal" } });
    fireEvent.change(screen.getByLabelText("Restaurant name"), { target: { value: "Chai Point" } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "sana@example.com" } });
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "+92 300 1234567" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longpassword1" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(screen.getByRole("button", { name: /Start|Create|Sign up/i }).closest("form")!);
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(vi.mocked(api).mock.calls[0][1]).toMatchObject({ body: { country: "PK", currency: "PKR", time_zone: "Asia/Karachi", phone: "+923001234567" } });
  });
});
