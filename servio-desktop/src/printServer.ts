// LAN print server the order-taker tablets print through.
//   GET  /health   -> { ok, version }
//   GET  /printers -> PrinterInfo[]
//   POST /print    -> PrintJob -> { ok } | { ok:false, error }
import http from "node:http";
import { lanIPv4 } from "./lanIp";
import { listPrinters, print } from "./printers";
import type { PrintJob, PrintServerStatus } from "./types";

let server: http.Server | null = null;
let currentPort = 0;
let lastError = "";

function cors(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "600");
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

export function createPrintServer(version: string): http.Server {
  return http.createServer(async (req, res) => {
    cors(res);
    const url = (req.url ?? "/").split("?")[0];
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    try {
      if (req.method === "GET" && url === "/health") return json(res, 200, { ok: true, version });
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

export function startPrintServer(port: number, version: string): Promise<PrintServerStatus> {
  return new Promise((resolve) => {
    const s = createPrintServer(version);
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

export async function restartPrintServer(port: number, version: string): Promise<PrintServerStatus> {
  await stopPrintServer();
  return startPrintServer(port, version);
}

export function printServerStatus(): PrintServerStatus & { error?: string } {
  const status: PrintServerStatus & { error?: string } = { host: lanIPv4(), port: currentPort, running: server !== null };
  if (lastError) status.error = lastError;
  return status;
}
