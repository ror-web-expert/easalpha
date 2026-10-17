import { ImageResponse } from "next/og";
import { getStorefront } from "@/components/store/storefront-server";
import { DEFAULT_THEME, iconLetter, storeLogo, storeName, storeTheme } from "@/components/store/store-app";
import { readableOn } from "@/components/admin/marketing-helpers";

const SIZES = [180, 192, 512];

/** The restaurant's logo as a PNG, at most 1.5 MB and only PNG or JPEG (what the image renderer reads); else null. */
async function logoDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000), next: { revalidate: 3600 } });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!res.ok || !/^image\/(png|jpeg)$/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > 1_500_000) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** GET /store/<slug>/app-icon/<180|192|512>[?maskable=1]: the home-screen icon. The logo on white, or the first letter
 *  of the name on the restaurant's colour; the maskable variant keeps the logo inside the safe circle Android crops to. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; size: string }> }) {
  const { slug, size } = await params;
  const n = SIZES.includes(Number(size)) ? Number(size) : 192;
  const maskable = new URL(req.url).searchParams.has("maskable");
  const data = await getStorefront(slug);
  const theme = data ? storeTheme(data) : DEFAULT_THEME;
  const name = data ? storeName(data) : slug;
  const logo = await logoDataUrl(data ? storeLogo(data) : null);
  const inner = Math.round(n * (maskable ? 0.56 : 0.84));
  return new ImageResponse(
    (
      <div style={{ width: n, height: n, display: "flex", alignItems: "center", justifyContent: "center", background: logo && !maskable ? "#ffffff" : theme }}>
        {logo ? (
          <div style={{ width: maskable ? Math.round(n * 0.62) : inner, height: maskable ? Math.round(n * 0.62) : inner, display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", borderRadius: maskable ? Math.round(n * 0.14) : 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} width={inner} height={inner} alt="" style={{ objectFit: "contain", width: maskable ? Math.round(n * 0.5) : inner, height: maskable ? Math.round(n * 0.5) : inner }} />
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: Math.round(n * (maskable ? 0.4 : 0.5)), fontWeight: 800, color: readableOn(theme), lineHeight: 1 }}>{iconLetter(name, slug)}</div>
        )}
      </div>
    ),
    { width: n, height: n, headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } },
  );
}
