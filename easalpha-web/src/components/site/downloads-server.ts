import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

/** What the desktop workflow (or scripts/publish-downloads.sh) writes next to the installers. */
export interface DownloadsManifest { version: string; built_at?: string; files: { file: string; os: "windows" | "linux" | "mac"; bytes?: number }[] }

/** manifest.json from the site's own /downloads folder (public/downloads, mounted from deploy/downloads on a server), or null. */
export async function readDownloadsManifest(): Promise<DownloadsManifest | null> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "public", "downloads", "manifest.json"), "utf8");
    const m = JSON.parse(raw) as DownloadsManifest;
    return m && typeof m.version === "string" && Array.isArray(m.files) ? m : null;
  } catch {
    return null;
  }
}
