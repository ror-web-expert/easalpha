import { getStorefront } from "@/components/store/storefront-server";
import { storeManifest } from "@/components/store/store-app";

/** GET /store/<slug>/app-manifest: the restaurant's web app manifest (name, colour, icons, scope /store/<slug>). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getStorefront(slug);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(storeManifest(slug, data)), { headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=600" } });
}
