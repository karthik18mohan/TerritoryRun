"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/app/lib/supabaseClient";

export type Territory = {
  id: string;
  owner_user_id: string;
  city_id: string;
  geom_simplified: string | null;
  area_m2: number | null;
  updated_at: string;
  owner_username?: string | null;
};

export const useRealtimeTerritories = (cityId?: string) => {
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cityId) return undefined;
    const supabase = supabaseBrowser();
    let active = true;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("territories")
        .select(
          "id, owner_user_id, city_id, area_m2, updated_at, geom_simplified:st_asgeojson(geom_simplified), profiles(username)"
        )
        .eq("city_id", cityId);
      if (!active) return;
      if (error) {
        setLoading(false);
        return;
      }
      const mapped =
        data?.map((row) => ({
          ...row,
          owner_username: (row as { profiles?: { username?: string } }).profiles?.username
        })) ?? [];
      setTerritories(mapped as Territory[]);
      setLoading(false);
    };

    load();

    const channel = supabase
      .channel(`territories-${cityId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "territories", filter: `city_id=eq.${cityId}` },
        () => load()
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [cityId]);

  return { territories, loading };
};
