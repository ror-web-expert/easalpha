import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

// public/sw.js run in a sandbox with a fake Cache Storage and network. Review R30: cache-first on /_next/static/ stored
// whatever came back, so a 404 for a chunk (an old build's, after a deploy) or a 502 while the server restarted was
// served for that file from then on.
type Listener = (e: unknown) => void;

function loadWorker(network: (url: string) => Response) {
  const listeners: Record<string, Listener> = {};
  const stored: string[] = [];
  const deleted: string[] = [];
  const cache = { put: async (req: { url: string }) => void stored.push(new URL(req.url).pathname), match: async () => undefined, add: async () => {}, addAll: async () => {} };
  const sandbox = {
    self: { location: { origin: "https://easalpha.com" }, addEventListener: (type: string, fn: Listener) => { listeners[type] = fn; }, skipWaiting: () => {}, clients: { claim: async () => {} }, registration: {} },
    caches: { open: async () => cache, match: async () => undefined, keys: async () => ["easalpha-shell-v3", "easalpha-shell-v4"], delete: async (k: string) => { deleted.push(k); return true; } },
    fetch: async (req: { url: string }) => network(req.url),
    Response, URL, console,
  };
  vm.runInNewContext(readFileSync(path.resolve(__dirname, "../../public/sw.js"), "utf8"), sandbox);
  return { listeners, stored, deleted };
}

async function get(w: ReturnType<typeof loadWorker>, pathname: string, mode = "no-cors") {
  let answer: Promise<Response> | undefined;
  w.listeners.fetch({ request: { method: "GET", url: `https://easalpha.com${pathname}`, mode }, respondWith: (p: Promise<Response>) => { answer = p; } });
  const res = await answer!;
  await new Promise((r) => setTimeout(r, 0)); // the copy is put after the answer goes back
  return res;
}

describe("the service worker cache", () => {
  it("never stores a failed answer for a build file, and hands the failure to the page", async () => {
    const w = loadWorker((url) => new Response("missing", { status: url.includes("gone") ? 404 : 502 }));
    expect((await get(w, "/_next/static/chunks/app/pos/shift/page-gone.js")).status).toBe(404);
    expect((await get(w, "/_next/static/chunks/8165-new.js")).status).toBe(502);
    expect(w.stored).toEqual([]);
  });

  it("stores a good one, as before", async () => {
    const w = loadWorker(() => new Response("ok", { status: 200 }));
    await get(w, "/_next/static/chunks/8165-new.js");
    await get(w, "/pos/orders", "navigate");
    expect(w.stored).toEqual(["/_next/static/chunks/8165-new.js", "/pos/orders"]);
  });

  it("does not keep an error page for a screen opened offline later", async () => {
    const w = loadWorker(() => new Response("Bad gateway", { status: 502 }));
    expect((await get(w, "/pos/shift", "navigate")).status).toBe(502);
    expect(w.stored).toEqual([]);
  });

  it("drops the v3 cache, which may hold a stored failure, when it takes over", async () => {
    const w = loadWorker(() => new Response("ok"));
    let done: Promise<unknown> | undefined;
    w.listeners.activate({ waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;
    expect(w.deleted).toEqual(["easalpha-shell-v3"]);
  });
});
