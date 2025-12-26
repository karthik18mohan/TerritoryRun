import { NextResponse } from "next/server";
import { supabaseServer } from "@/app/lib/supabaseClient";

const buildPolygonWkt = (coordinates: number[][]) => {
  if (coordinates.length < 3) return null;
  const closed = [...coordinates, coordinates[0]];
  const path = closed.map((coord) => coord.join(" ")).join(",");
  return `MULTIPOLYGON(((${path})))`;
};

export async function POST(request: Request) {
  const body = await request.json();
  const { userId, cityId, sessionId, polygon } = body;
  const wkt = buildPolygonWkt(polygon);

  if (!wkt) {
    return NextResponse.json({ message: "Not enough points to claim." }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase.rpc("claim_territory", {
    p_user_id: userId,
    p_city_id: cityId,
    p_session_id: sessionId,
    p_polygon: `SRID=4326;${wkt}`
  });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({
    message: "Territory claimed!",
    data
  });
}
