"use client";
import { useEffect } from "react";
import { registerAppWorker } from "@/lib/app-worker";
import "@/lib/install-prompt"; // catch the browser's install prompt as soon as the restaurant's site loads

/** Registers the service worker so the restaurant's site can be installed and reopened with weak signal. */
export function StoreAppSetup() {
  useEffect(() => { registerAppWorker(); }, []);
  return null;
}
