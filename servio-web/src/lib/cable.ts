"use client";
// Minimal Action Cable client: subscribe to one channel and get its messages. Reconnects with backoff.
import { CABLE_URL } from "@/lib/api";

export interface CableSubscription { close: () => void }

export function subscribe(channel: string, token: string, onMessage: (msg: Record<string, unknown>) => void, onStatus?: (s: "open" | "closed") => void, params: Record<string, string> = {}): CableSubscription {
  let ws: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const identifier = JSON.stringify({ channel, ...params });

  const connect = () => {
    if (closed) return;
    try {
      ws = new WebSocket(`${CABLE_URL}?token=${encodeURIComponent(token)}`);
    } catch {
      schedule();
      return;
    }
    ws.onopen = () => {
      attempt = 0;
      ws?.send(JSON.stringify({ command: "subscribe", identifier }));
      onStatus?.("open");
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as { type?: string; identifier?: string; message?: Record<string, unknown> };
        if (data.type === "ping" || data.type === "welcome" || data.type === "confirm_subscription") return;
        if (data.type === "reject_subscription" || data.type === "disconnect") { ws?.close(); return; }
        if (data.message && typeof data.message === "object") onMessage(data.message);
      } catch {}
    };
    ws.onclose = () => { onStatus?.("closed"); schedule(); };
    ws.onerror = () => { ws?.close(); };
  };
  const schedule = () => {
    if (closed) return;
    attempt += 1;
    const wait = Math.min(30000, 1000 * 2 ** Math.min(attempt, 5));
    timer = setTimeout(connect, wait);
  };
  connect();
  return {
    close: () => {
      closed = true;
      if (timer) clearTimeout(timer);
      try { ws?.close(); } catch {}
    },
  };
}
