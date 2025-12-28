import { NextResponse } from "next/server";

const CACHE_CONTROL =
  "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";

const buildUpstreamUrl = (provider: string, z: number, x: number, y: number) => {
  if (provider === "osm") {
    return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  }
  if (provider === "esri") {
    return `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  }
  return null;
};

export async function GET(
  _request: Request,
  { params }: { params: { provider: string; tile: string[] } }
) {
  const { provider, tile } = params;
  if (!tile || tile.length < 3) {
    return NextResponse.json({ error: "Invalid tile" }, { status: 404 });
  }

  const [zRaw, xRaw, yWithExt] = tile;
  const yRaw = yWithExt?.split(".")[0];
  const z = Number.parseInt(zRaw, 10);
  const x = Number.parseInt(xRaw, 10);
  const y = Number.parseInt(yRaw ?? "", 10);

  if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) {
    return NextResponse.json({ error: "Invalid tile" }, { status: 404 });
  }

  const upstream = buildUpstreamUrl(provider, z, x, y);
  if (!upstream) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 404 });
  }

  try {
    const response = await fetch(upstream);
    if (!response.ok || !response.body) {
      return NextResponse.json({ error: "Upstream tile failed" }, { status: 502 });
    }
    const contentType = response.headers.get("content-type") ?? "image/png";
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": CACHE_CONTROL
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Tile fetch failed" },
      { status: 502 }
    );
  }
}
