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
      setPlayers((data as LivePlayer[]) ?? []);
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
