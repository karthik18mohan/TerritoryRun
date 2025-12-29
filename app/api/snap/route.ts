import { NextResponse } from "next/server";

type TrackPoint = {
  lat: number;
  lng: number;
  ts: string;
  accuracy?: number | null;
  speed?: number | null;
  snapped?: boolean;
  snappedLat?: number;
  snappedLng?: number;
};

const uniqueProfiles = (profiles: Array<string | undefined>) =>
  profiles.filter((value, index, self) => value && self.indexOf(value) === index) as string[];

const buildProfileOrder = (mode: string | undefined) => {
  const walkProfileEnv = process.env.OSRM_PROFILE_WALK;
  const cycleProfileEnv = process.env.OSRM_PROFILE_CYCLE;
  if (mode === "cycle") {
    return uniqueProfiles([cycleProfileEnv, "cycling", "bike", "driving"]);
  }
  return uniqueProfiles([walkProfileEnv, "walking", "foot", "driving"]);
};

export async function POST(request: Request) {
  const { points, mode } = await request.json();
  const osrmBase = process.env.OSRM_BASE_URL ?? "https://router.project-osrm.org";

  if (!Array.isArray(points) || points.length === 0) {
    return NextResponse.json({ points: [] }, { status: 400 });
  }

  const coords = points
    .map((point: { lng: number; lat: number }) => `${point.lng},${point.lat}`)
    .join(";");
  const profiles = buildProfileOrder(mode);
  let lastError = "OSRM failed";

  for (const profile of profiles) {
    try {
      const url = `${osrmBase}/match/v1/${profile}/${coords}?geometries=geojson&overview=full&tidy=true`;
      const response = await fetch(url);
      if (!response.ok) {
        lastError = `OSRM ${profile} failed`;
        continue;
      }
      const data = await response.json();
      const tracepoints = (data.tracepoints ?? []) as Array<
        | { location?: [number, number] }
        | null
        | undefined
      >;
      if (!tracepoints.length) {
        lastError = `OSRM ${profile} returned no tracepoints`;
        continue;
      }

      const snappedPoints = (points as TrackPoint[]).map((point, index) => {
        const trace = tracepoints[index];
        if (trace?.location) {
          return {
            ...point,
            snapped: true,
            snappedLng: trace.location[0],
            snappedLat: trace.location[1]
          };
        }
        return {
          ...point,
          snapped: false
        };
      });

      return NextResponse.json({ points: snappedPoints });
    } catch {
      lastError = `OSRM ${profile} failed`;
    }
  }

  const fallback = (points as TrackPoint[]).map((point) => ({
    ...point,
    snapped: false
  }));

  return NextResponse.json({ points: fallback, error: lastError });
}
