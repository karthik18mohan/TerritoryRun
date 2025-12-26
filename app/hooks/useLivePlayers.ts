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
  last_point: string | null | { last_point: string | null }[];
  last_trail: string | null | { last_trail: string | null }[];
};

export const useLivePlayers = (cityId?: string, enabled?: boolean) => {
  const [players, setPlayers] = useState<LivePlayer[]>([]);

  useEffect(() => {
    if (!cityId || !enabled) return undefined;
    const supabase = supabaseBrowser();
    let active = true;

    const load = async () => {
      const { data } = await supabase
        .from("live_players")
        .select(
          "user_id, city_id, username, is_live, last_ts, last_point:st_asgeojson(last_point), last_trail:st_asgeojson(last_trail)"
        )
        .eq("city_id", cityId)
        .eq("is_live", true);
      if (!active) return;
      const mapped = (data ?? []).map((row: LivePlayerRow): LivePlayer => {
        const last_point = Array.isArray(row.last_point)
          ? row.last_point[0]?.last_point ?? null
          : row.last_point ?? null;
        const last_trail = Array.isArray(row.last_trail)
          ? row.last_trail[0]?.last_trail ?? null
          : row.last_trail ?? null;
        return {
          user_id: row.user_id,
          city_id: row.city_id,
          username: row.username,
          is_live: row.is_live,
          last_ts: row.last_ts,
          last_point,
          last_trail
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
