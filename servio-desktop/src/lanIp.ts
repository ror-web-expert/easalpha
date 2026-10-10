import os from "node:os";

/** First non-internal IPv4 address, preferring private LAN ranges. */
export function lanIPv4(): string {
  const all: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === "IPv4" && !i.internal) all.push(i.address);
    }
  }
  const isPrivate = (a: string) =>
    a.startsWith("192.168.") || a.startsWith("10.") || /^172\.(1[6-9]|2\d|3[01])\./.test(a);
  return all.find(isPrivate) ?? all[0] ?? "127.0.0.1";
}
