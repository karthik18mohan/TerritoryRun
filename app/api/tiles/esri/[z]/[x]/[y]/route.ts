import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: { z: string; x: string; y: string } }
) {
  const { z, x, y } = params;
  const upstream = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

  try {
    const response = await fetch(upstream);
    if (!response.ok) {
      return new NextResponse(null, { status: 404 });
    }
    const bytes = await response.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800"
      }
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
