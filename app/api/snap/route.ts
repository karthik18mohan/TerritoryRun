import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { points, mode } = await request.json();
  const osrmBase = process.env.OSRM_BASE_URL ?? "https://router.project-osrm.org";
  const walkProfileEnv = process.env.OSRM_PROFILE_WALK;
  const cycleProfileEnv = process.env.OSRM_PROFILE_CYCLE;

  try {
    if (!Array.isArray(points) || points.length === 0) {
      return NextResponse.json({ points: [] }, { status: 400 });
    }

    const coords = points
      .map((point: { lng: number; lat: number }) => `${point.lng},${point.lat}`)
      .join(";");
    const walkProfiles = [walkProfileEnv, "walking", "foot"].filter(
      (value, index, self) => value && self.indexOf(value) === index
    ) as string[];
    const cycleProfiles = [cycleProfileEnv, "cycling", "bike"].filter(
      (value, index, self) => value && self.indexOf(value) === index
    ) as string[];
    const profiles = mode === "cycle" ? cycleProfiles : walkProfiles;

    let snappedCoords: number[][] | null = null;
    let lastError = "OSRM failed";

    for (const profile of profiles) {
      const url = `${osrmBase}/match/v1/${profile}/${coords}?geometries=geojson&overview=full&tidy=true`;
      const response = await fetch(url);
      if (!response.ok) {
        lastError = `OSRM ${profile} failed`;
        continue;
      }
      const data = await response.json();
      const match = data.matchings?.[0];
      const coordsCandidate: number[][] = match?.geometry?.coordinates ?? [];
      if (coordsCandidate.length > 0) {
        snappedCoords = coordsCandidate;
        break;
      }
      lastError = `OSRM ${profile} returned no match`;
    }

    if (!snappedCoords) {
      throw new Error(lastError);
    }

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
