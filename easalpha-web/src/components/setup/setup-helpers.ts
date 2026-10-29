import type { Device } from "@/lib/types";

/**
 * "Set up this device": one app for every machine. A manager signs in once on the machine, picks what it is, and from
 * then on the machine opens only that screen. These helpers are pure so the choices can be unit tested.
 */
export type DeviceRole = "till" | "tablet" | "kitchen" | "token" | "queue" | "rider" | "canteen" | "counter";

export interface RoleOption {
  role: DeviceRole;
  /** The Device.kind the API stores. */
  kind: "till" | "tablet" | "kitchen" | "token_screen" | "rider" | "kiosk";
  title: string;
  text: string;
  /** Where the machine goes once it is set up. */
  screen: string;
  /** Which browser store keeps the device token: the rider app has its own. */
  store: "device" | "rider";
  /** Whether staff sign in with a PIN on this screen. */
  login: boolean;
  namePrefix: string;
}

export const ROLE_OPTIONS: RoleOption[] = [
  { role: "till", kind: "till", title: "Till (cashier)", text: "Takes orders and payments, prints receipts. Cashiers sign in with a PIN.", screen: "/pos/pin", store: "device", login: true, namePrefix: "Counter" },
  { role: "tablet", kind: "tablet", title: "Order-taker tablet", text: "Waiters take orders at the table. Prints through the till's print server.", screen: "/pos/pin", store: "device", login: true, namePrefix: "Tablet" },
  { role: "kitchen", kind: "kitchen", title: "Kitchen display", text: "Tickets per station with timers. Cooks bump items when ready.", screen: "/kitchen", store: "device", login: false, namePrefix: "Kitchen" },
  { role: "token", kind: "token_screen", title: "Token screen", text: "Faces the pickup counter and shows which orders are ready.", screen: "/token", store: "device", login: false, namePrefix: "Token screen" },
  { role: "queue", kind: "token_screen", title: "Queue screen", text: "Shows customers what is preparing and what is ready.", screen: "/queue", store: "device", login: false, namePrefix: "Queue screen" },
  { role: "rider", kind: "rider", title: "Rider phone", text: "The rider's deliveries and status. Riders sign in with a PIN.", screen: "/rider/pin", store: "rider", login: true, namePrefix: "Rider phone" },
  { role: "canteen", kind: "kiosk", title: "Canteen kiosk", text: "Workers scan a finger, pick a dish and get a token. Needs the Canteen module.", screen: "/canteen", store: "device", login: false, namePrefix: "Kiosk" },
  { role: "counter", kind: "kiosk", title: "Canteen counter", text: "Shows the tokens waiting; tap one when the meal is handed over.", screen: "/canteen/serve", store: "device", login: false, namePrefix: "Counter" },
];

export const SCREEN_CHOICE_KEY = "easalpha.setup.screen";

export function roleOption(role: DeviceRole): RoleOption {
  return ROLE_OPTIONS.find((r) => r.role === role) ?? ROLE_OPTIONS[0];
}

/** "Counter 1", "Counter 2": the next free number among the branch's devices of the same kind. */
export function defaultDeviceName(role: DeviceRole, existing: Pick<Device, "name" | "kind" | "revoked_at">[]): string {
  const opt = roleOption(role);
  const taken = new Set(existing.filter((d) => !d.revoked_at && d.kind === opt.kind).map((d) => d.name.trim().toLowerCase()));
  let n = 1;
  while (taken.has(`${opt.namePrefix} ${n}`.toLowerCase())) n += 1;
  return `${opt.namePrefix} ${n}`;
}

export function canSetUpDevices(permissions: string[] | undefined): boolean {
  return !!permissions && permissions.includes("devices.manage");
}

/**
 * Where a browser that is already set up should go, or null when nothing is set up yet. The rider store wins when both
 * are present (a phone paired as a rider), a token-screen device opens whichever of token or queue was chosen.
 */
export function existingScreen(input: { deviceKind: string | null; riderPaired: boolean; screenChoice: string | null }): string | null {
  if (input.riderPaired) return "/rider";
  switch (input.deviceKind) {
    case "till":
    case "tablet":
      return "/pos";
    case "kitchen":
      return "/kitchen";
    case "token_screen":
      return input.screenChoice === "/queue" ? "/queue" : "/token";
    case "kiosk":
      return input.screenChoice === "/canteen/serve" ? "/canteen/serve" : "/canteen";
    default:
      return null;
  }
}

/** The staff list shown on the ready screen: people without a PIN first so the manager sees who to set up. */
export function sortStaffForSetup<T extends { name: string | null; has_pin: boolean }>(staff: T[]): T[] {
  return [...staff].sort((a, b) => Number(a.has_pin) - Number(b.has_pin) || (a.name ?? "").localeCompare(b.name ?? ""));
}

export function validPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
