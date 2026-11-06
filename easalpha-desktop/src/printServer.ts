// LAN print server the order-taker tablets print through.
//   GET  /health   -> { ok, version }
//   GET  /printers -> PrinterInfo[]
//   POST /print    -> PrintJob -> { ok } | { ok:false, error }
// /printers and /print need the install's token (Authorization: Bearer <token>), shown under Printers and entered
// once in Admin, Settings, Print Server. Without it any phone on the shop's Wi-Fi could print or open the drawer.
// Browsers may call it only from the web app's own address (6 Nov 2026 review, R11): webUrl and the
// printServerOrigins list in settings.json (unset: webUrl and https://easalpha.com). A page anywhere else on the web
// gets no CORS answer and a 403, so it cannot reach the drawer through a tablet's browser either.
import crypto from "node:crypto";
import http from "node:http";
import { lanIPv4 } from "./lanIp";
import { listPrinters, print } from "./printers";
import { loadSettings, originOf } from "./settings";
import type { PrintJob, PrintServerStatus, Settings } from "./types";

let server: http.Server | null = null;
let currentPort = 0;
let lastError = "";
let tokenProvider: () => string = () => "";
let queryTokenWarned = false;

export const DEFAULT_ORIGINS = ["https://easalpha.com"];

/** The origins whose pages may call the server: the web app this till opens, plus the settings.json list or, when
 *  there is none, easalpha.com. */
export function allowedOrigins(s: Pick<Settings, "webUrl" | "printServerOrigins">): string[] {
  const listed = s.printServerOrigins ?? [s.webUrl, ...DEFAULT_ORIGINS];
  return [...new Set([s.webUrl, ...listed].map((o) => originOf(o)).filter((o): o is string => !!o))];
}

/** Constant time whatever the input: both sides are hashed to 32 bytes first, so timingSafeEqual always gets
 *  equal-length buffers and neither a near miss nor the token's length shows in the timing. */
export function tokenMatches(given: string, expected: string): boolean {
  const digest = (s: string) => crypto.createHash("sha256").update(s, "utf8").digest();
  return crypto.timingSafeEqual(digest(given), digest(expected));
}

/** CORS for an allowed origin, nothing for any other. True when the request may go on: an allowed origin, or no
 *  Origin at all (curl or a script on the till, where the token alone decides). */
function cors(req: http.IncomingMessage, res: http.ServerResponse, allowed: string[]): boolean {
  res.setHeader("Vary", "Origin");
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  if (!allowed.includes(origin)) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "600");
  return true;
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(data) });
  res.end(data);
}

function readBody(req: http.IncomingMessage, limit = 1_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** The header when there is one; ?token= only without it. The query form is kept for this release so a hand-made
 *  link or script keeps working, but it lands in logs and browser history: the next release drops it. */
function authorized(req: http.IncomingMessage, res: http.ServerResponse, expected: string): boolean {
  if (!expected) return true;
  const header = req.headers.authorization;
  if (header !== undefined) return tokenMatches(String(header).replace(/^Bearer\s+/i, "").trim(), expected);
  const query = new URL(req.url ?? "/", "http://localhost").searchParams.get("token");
  if (query === null) return false;
  res.setHeader("Deprecation", "true");
  if (!queryTokenWarned) {
    queryTokenWarned = true;
    console.warn("[print server] a token in the address (?token=) still works in this release only; send Authorization: Bearer <token> instead");
  }
  return tokenMatches(query, expected);
}

export function createPrintServer(version: string, token: () => string = () => "", origins: () => string[] = () => allowedOrigins(loadSettings())): http.Server {
  return http.createServer(async (req, res) => {
    const originOk = cors(req, res, origins());
    const url = (req.url ?? "/").split("?")[0];
    if (req.method === "OPTIONS") {
      res.writeHead(originOk ? 204 : 403);
      res.end();
      return;
    }
    try {
      if (!originOk) return json(res, 403, { ok: false, error: "This web address may not use the print server. Open the web app from the address set on the till, or add this one to printServerOrigins in settings.json." });
      if (req.method === "GET" && url === "/health") return json(res, 200, { ok: true, version, token_required: !!token() });
      if (!authorized(req, res, token())) return json(res, 401, { ok: false, error: "Print server token missing or wrong. It is shown on the till under Printers; enter it in Admin, Settings, Print Server." });
      if (req.method === "GET" && url === "/printers") return json(res, 200, listPrinters());
      if (req.method === "POST" && url === "/print") {
        let job: PrintJob;
        try {
          job = JSON.parse(await readBody(req));
        } catch {
          return json(res, 400, { ok: false, error: "Body must be a JSON PrintJob" });
        }
        const result = await print(job);
        return json(res, result.ok ? 200 : 422, result);
      }
      return json(res, 404, { ok: false, error: "Not found" });
    } catch (e) {
      return json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
}

export function startPrintServer(port: number, version: string, token?: () => string): Promise<PrintServerStatus> {
  if (token) tokenProvider = token;
  return new Promise((resolve) => {
    const s = createPrintServer(version, tokenProvider);
    s.once("error", (e: NodeJS.ErrnoException) => {
      lastError = e.code === "EADDRINUSE" ? `Port ${port} is already in use` : e.message;
      server = null;
      currentPort = port;
      resolve(printServerStatus());
    });
    s.listen(port, "0.0.0.0", () => {
      server = s;
      currentPort = port;
      lastError = "";
      resolve(printServerStatus());
    });
  });
}

export function stopPrintServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) return resolve();
    const s = server;
    server = null;
    s.close(() => resolve());
  });
}

export async function restartPrintServer(port: number, version: string, token?: () => string): Promise<PrintServerStatus> {
  await stopPrintServer();
  return startPrintServer(port, version, token);
}

export function printServerStatus(): PrintServerStatus & { error?: string } {
  const status: PrintServerStatus & { error?: string } = { host: lanIPv4(), port: currentPort, running: server !== null, token: tokenProvider() || undefined };
  if (lastError) status.error = lastError;
  return status;
}
