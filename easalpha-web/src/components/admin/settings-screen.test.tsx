import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SettingKey, SettingsResponse } from "@/lib/types";
import { changedValues, controlFor, editValue, payloadValue, SettingsGroupPage } from "./settings-screen";

const k = (key: string, type: SettingKey["type"], value: unknown = null, extra: Partial<SettingKey> = {}): SettingKey =>
  ({ key, group: "point_of_sale", screen: "Test", type, label: key, value, default: null, ...extra });

describe("controlFor", () => {
  it("maps types to controls", () => {
    expect(controlFor(k("pos.kds.red_sound", "boolean")).control).toBe("switch");
    expect(controlFor(k("pos.kds.timeout_minutes", "integer")).control).toBe("number");
    expect(controlFor(k("charges.service_charge.value", "number")).control).toBe("number");
    expect(controlFor(k("pos.receipt.header", "string")).control).toBe("text");
    // Display Settings, Tile size: small or large tiles on the till.
    expect(controlFor(k("catalog.display.tile_size", "string"))).toEqual({ control: "select", options: [expect.objectContaining({ value: "small" }), expect.objectContaining({ value: "large" })] });
    expect(controlFor(k("security.expense_report_pin", "pin")).control).toBe("pin");
    expect(controlFor(k("store.linked_stores", "json")).control).toBe("json");
  });

  it("gives selects to known string suffixes", () => {
    expect(controlFor(k("pos.receipt.language", "string")).options?.map((o) => o.value)).toEqual(["en", "ur"]);
    expect(controlFor(k("charges.service_charge.mode", "string")).options?.map((o) => o.value)).toEqual(["percent", "fixed"]);
    expect(controlFor(k("tax.pra.environment", "string")).options?.map((o) => o.value)).toEqual(["sandbox", "production"]);
    expect(controlFor(k("pos.receipt.paper", "string")).options?.map((o) => o.value)).toEqual(["80", "58"]);
    expect(controlFor(k("pos.order_behavior.default_payment_method", "string")).options?.map((o) => o.value)).toEqual(["cash", "card", "easypaisa", "jazzcash", "bank", "khata"]);
  });

  it("renders customer fields and order types as checkbox sets", () => {
    expect(controlFor(k("pos.customer_fields", "json")).control).toBe("checkbox-set");
    expect(controlFor(k("pos.customer_fields", "json")).options?.map((o) => o.value)).toEqual(["name", "phone", "email", "address"]);
    expect(controlFor(k("charges.service_charge.order_types", "json")).control).toBe("checkbox-set");
  });

  it("treats masked string secrets as password fields", () => {
    expect(controlFor(k("tax.pra.bearer_token", "string")).control).toBe("secret");
  });
});

describe("edit and payload values", () => {
  it("starts pins blank even when the API says they are set", () => {
    expect(editValue(k("security.expense_report_pin", "pin", "set"))).toBe("");
  });
  it("round-trips json through text", () => {
    const key = k("store.linked_stores", "json", ["a"]);
    const text = editValue(key);
    expect(text).toBe('[\n  "a"\n]');
    expect(payloadValue(key, text)).toEqual(["a"]);
    expect(() => payloadValue(key, "{oops")).toThrow();
  });
  it("sends null for a cleared text field and a blank number", () => {
    expect(payloadValue(k("pos.receipt.footer_qr_url", "string", "x"), "")).toBeNull();
    expect(editValue(k("pos.kds.timeout_minutes", "integer", null))).toBeNull();
  });
});

describe("changedValues", () => {
  it("returns only keys that differ", () => {
    expect(changedValues({ a: 1, b: "x", c: true }, { a: 1, b: "y", c: false })).toEqual({ b: "y", c: false });
  });
  it("compares arrays by content", () => {
    expect(changedValues({ a: ["name", "phone"] }, { a: ["name", "phone"] })).toEqual({});
    expect(changedValues({ a: ["name"] }, { a: ["name", "phone"] })).toEqual({ a: ["name", "phone"] });
  });
  it("skips a blank pin so saving leaves it unchanged", () => {
    const pin = k("security.expense_report_pin", "pin", "set");
    const original = { [pin.key]: editValue(pin) };
    expect(changedValues(original, { [pin.key]: "" })).toEqual({});
    expect(changedValues(original, { [pin.key]: "1234" })).toEqual({ [pin.key]: "1234" });
  });
});

vi.mock("@/lib/api", () => ({
  api: vi.fn(async (): Promise<SettingsResponse> => ({
    version: 7,
    groups: {
      point_of_sale: {
        name: "Point of Sale",
        screens: {
          "Customer Required": [k("pos.customer_required.walk_in", "boolean", false, { screen: "Customer Required" })],
          "KDS Alerts": [k("pos.kds.timeout_minutes", "integer", 10, { screen: "KDS Alerts" })],
        },
      },
    },
  })),
  errorMessage: (e: unknown) => String(e),
}));

describe("SettingsGroupPage", () => {
  it("renders one card per screen and the version line", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><SettingsGroupPage group="point_of_sale" title="Point of Sale" /></QueryClientProvider>);
    expect(await screen.findByText("Customer Required")).toBeInTheDocument();
    expect(screen.getByText("KDS Alerts")).toBeInTheDocument();
    expect(screen.getByText(/Settings version 7/)).toBeInTheDocument();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByDisplayValue("10")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Save" })).toHaveLength(2);
  });
});
