import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { points, mode } = await request.json();
  const osrmBase = process.env.OSRM_BASE_URL ?? "https://router.project-osrm.org";

  try {
    if (!Array.isArray(points) || points.length === 0) {
      return NextResponse.json({ points: [] }, { status: 400 });
    }

    const coords = points.map((point: { lng: number; lat: number }) => `${point.lng},${point.lat}`).join(";");
    const url = `${osrmBase}/match/v1/${mode === "cycle" ? "bike" : "foot"}/${coords}?geometries=geojson&overview=full&tidy=true`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("OSRM failed");
    }

    const data = await response.json();
    const match = data.matchings?.[0];
    const snappedCoords: number[][] = match?.geometry?.coordinates ?? [];

    const snappedPoints = points.map((point: { lat: number; lng: number }, index: number) => {
      const snapped = snappedCoords[index];
      if (!snapped) {
        return { ...point, snapped: false };
      }
      return {
        ...point,
        snapped: true,
        snappedLng: snapped[0],
        snappedLat: snapped[1]
      };
    });

    return NextResponse.json({ points: snappedPoints });
  } catch (error) {
    const fallback = points.map((point: { lat: number; lng: number }) => ({
      ...point,
      snapped: false
    }));
    return NextResponse.json({ points: fallback, error: (error as Error).message });
  }
}
