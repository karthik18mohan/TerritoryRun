"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/app/lib/supabaseClient";

export type LivePlayer = {
  user_id: string;
  city_id: string;
  username: string;
  is_live: boolean;
  last_ts: string;
  last_point: string | null;
  last_trail: string | null;
};

type LivePlayerRow = {
  user_id: string;
  city_id: string;
  username: string;
  is_live: boolean;
  last_ts: string;
  last_point_geojson: string | Record<string, unknown> | null;
  last_trail_geojson: string | Record<string, unknown> | null;
};

const normalizeGeoJson = (value: string | Record<string, unknown> | null) => {
  if (!value) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
};

export const useLivePlayers = (cityId?: string, enabled?: boolean) => {
  const [players, setPlayers] = useState<LivePlayer[]>([]);

  useEffect(() => {
    if (!cityId || !enabled) return undefined;
    const supabase = supabaseBrowser();
    let active = true;

    const load = async () => {
      const { data } = await supabase
        .from("v_live_players_active")
        .select(
          "user_id, city_id, username, is_live, last_ts, last_point_geojson, last_trail_geojson"
        )
        .eq("city_id", cityId)
        .eq("is_live", true);
      if (!active) return;
      const mapped = (data ?? []).map((row: LivePlayerRow): LivePlayer => {
        return {
          user_id: row.user_id,
          city_id: row.city_id,
          username: row.username,
          is_live: row.is_live,
          last_ts: row.last_ts,
          last_point: normalizeGeoJson(row.last_point_geojson),
          last_trail: normalizeGeoJson(row.last_trail_geojson)
        };
      });
      setPlayers(mapped);
    };

    load();

    const channel = supabase
      .channel(`live-${cityId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_players", filter: `city_id=eq.${cityId}` },
        () => load()
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [cityId, enabled]);

  return { players };
};
