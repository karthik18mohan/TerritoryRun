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

type TerritoryRow = {
  id: string;
  owner_user_id: string;
  city_id: string;
  geom_simplified: string | null | { geom_simplified: string | null }[];
  area_m2: number | null;
  updated_at: string;
  profiles?: { username?: string | null }[] | null;
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
          "id, owner_user_id, city_id, area_m2, updated_at, geom_simplified:st_asgeojson(geom_simplified), profiles!territories_owner_user_id_fkey(username)"
        )
        .eq("city_id", cityId);
      if (!active) return;
      if (error) {
        setLoading(false);
        return;
      }
      const mappedTerritories: Territory[] =
        data?.map((row: TerritoryRow): Territory => {
          const geom_simplified = Array.isArray(row.geom_simplified)
            ? row.geom_simplified[0]?.geom_simplified ?? null
            : row.geom_simplified ?? null;
          return {
            id: row.id,
            owner_user_id: row.owner_user_id,
            city_id: row.city_id,
            geom_simplified,
            area_m2: row.area_m2,
            updated_at: row.updated_at,
            owner_username: row.profiles?.[0]?.username ?? null
          };
        }) ?? [];
      setTerritories(mappedTerritories);
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
