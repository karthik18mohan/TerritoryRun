import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const buildPolygonWkt = (coordinates: number[][]) => {
  if (coordinates.length < 3) return null;
  const closed = [...coordinates, coordinates[0]];
  const path = closed.map((coord) => coord.join(" ")).join(",");
  return `MULTIPOLYGON(((${path})))`;
};

export async function POST(request: Request) {
  const body = await request.json();
  const { cityId, sessionId, polygon } = body;
  const wkt = buildPolygonWkt(polygon);

  if (!wkt) {
    return NextResponse.json({ message: "Not enough points to claim." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const authHeader = request.headers.get("authorization") ?? "";
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {}
    },
    auth: {
      persistSession: false
    }
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("claim_territory", {
    p_user_id: userData.user.id,
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
