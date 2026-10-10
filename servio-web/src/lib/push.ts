"use client";
import { api, type RequestOptions } from "@/lib/api";
import type { PushApp, PushPublicKey, PushSubscriptionRow, PushTestResult } from "@/lib/types";

// Browser push for the owner (admin), the till (pos), the kitchen screen and the rider phone. The service worker in
// public/sw.js shows the notification and opens the payload url on click, so alerts arrive while the tab is closed.
// Nothing is kept in localStorage except an optional "asked once" flag; the subscription itself lives in the browser's
// push manager and on the API (POST /push/subscriptions).

export type PushState = "unsupported" | "denied" | "prompt" | "subscribed" | "unsubscribed";

/** How a push helper talks to the API. The default picks the token by app; the rider app passes its own riderApi. */
export type PushRequest = <T = unknown>(path: string, opts?: RequestOptions) => Promise<T>;

const ASKED_KEY = "servio.push.asked";
const SW_PATH = "/sw.js";

export function pushSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** VAPID keys come base64url encoded; PushManager.subscribe wants raw bytes. */
export function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Pure: the state shown in the UI from what the browser reports. */
export function derivePushState(supported: boolean, permission: NotificationPermission | "default", hasSubscription: boolean): PushState {
  if (!supported) return "unsupported";
  if (permission === "denied") return "denied";
  if (permission === "default") return "prompt";
  return hasSubscription ? "subscribed" : "unsubscribed";
}

/** Pure: where a notification click should take the user. Relative urls resolve against the app origin; other
 *  origins are refused so a bad payload cannot send staff to a foreign site. */
export function resolveNotificationUrl(url: string | null | undefined, origin: string): string {
  const fallback = origin + "/";
  if (!url) return fallback;
  try {
    const u = new URL(url, origin);
    if (u.origin !== origin) return fallback;
    return u.href;
  } catch {
    return fallback;
  }
}

function defaultRequest(app: PushApp): PushRequest {
  const auth: RequestOptions["auth"] = app === "admin" ? "admin" : app === "pos" ? "pos" : "auto";
  return (path, opts = {}) => api(path, { ...opts, auth: opts.auth ?? auth });
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  const existing = await navigator.serviceWorker.getRegistration(SW_PATH).catch(() => undefined);
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_PATH).catch(() => null);
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration(SW_PATH).catch(() => undefined);
  if (!reg) return null;
  return reg.pushManager.getSubscription().catch(() => null);
}

export async function getPushState(): Promise<PushState> {
  const supported = pushSupported();
  if (!supported) return "unsupported";
  const sub = await currentSubscription();
  return derivePushState(true, Notification.permission, !!sub);
}

export function markAsked() {
  try { localStorage.setItem(ASKED_KEY, "1"); } catch {}
}
export function wasAsked(): boolean {
  try { return localStorage.getItem(ASKED_KEY) === "1"; } catch { return false; }
}

function subscriptionBody(sub: PushSubscription, app: PushApp) {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
    app,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
  };
}

/** Register the worker if needed, ask permission, subscribe with the server's VAPID key and save it on the API. */
export async function enablePush(app: PushApp, request: PushRequest = defaultRequest(app)): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const reg = await registration();
  if (!reg) throw new Error("The service worker could not be installed in this browser");
  markAsked();
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return derivePushState(true, permission, false);
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { public_key } = await request<PushPublicKey>("/push/public_key");
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(public_key) });
  }
  await request<PushSubscriptionRow>("/push/subscriptions", { method: "POST", body: subscriptionBody(sub, app) });
  return "subscribed";
}

/** Unsubscribe in the browser and forget the endpoint on the API. */
export async function disablePush(app: PushApp, request: PushRequest = defaultRequest(app)): Promise<PushState> {
  const sub = await currentSubscription();
  if (!sub) return getPushState();
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => false);
  await request("/push/subscriptions", { method: "DELETE", body: { endpoint } }).catch(() => undefined);
  return derivePushState(true, Notification.permission, false);
}

export async function sendTestPush(app: PushApp = "admin", request: PushRequest = defaultRequest(app)): Promise<PushTestResult> {
  return request<PushTestResult>("/push/test", { method: "POST", body: {} });
}

export async function listPushDevices(app: PushApp = "admin", request: PushRequest = defaultRequest(app)): Promise<PushSubscriptionRow[]> {
  const r = await request<{ data: PushSubscriptionRow[] }>("/push/subscriptions");
  return r.data;
}

/** Short browser name for the devices list, from a saved user agent. Pure. */
export function browserLabel(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unknown browser";
  const ua = userAgent;
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return os ? `${browser} on ${os}` : browser;
}
