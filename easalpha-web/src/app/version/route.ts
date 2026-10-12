import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

/** GET /version: the id of the build this server is running. The browser polls it to learn that a deploy happened. */
export async function GET() {
  let build = "dev";
  try {
    build = (await fs.readFile(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8")).trim();
  } catch {
    // next dev has no BUILD_ID; "dev" never changes, so no reload prompts while developing
  }
  return Response.json({ build }, { headers: { "cache-control": "no-store" } });
}
