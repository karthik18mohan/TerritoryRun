"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/app/lib/supabaseClient";

export type Territory = {
  id: string;
  owner_user_id: string;
  city_id: string;
  geom_geojson: Record<string, unknown> | string | null;
  area_m2: number | null;
  updated_at: string;
  owner_username?: string | null;
};

type TerritoryRow = {
  id: string;
  owner_user_id: string;
  city_id: string;
  geom_geojson: Record<string, unknown> | string | null;
  area_m2: number | null;
  updated_at: string;
};

export const useRealtimeTerritories = (
  cityId?: string,
  setStatusMessage?: (message: string) => void
) => {
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cityId) return undefined;
    const supabase = supabaseBrowser();
    let active = true;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("v_territories")
        .select(
          "id, owner_user_id, city_id, area_m2, updated_at, geom_geojson"
        )
        .eq("city_id", cityId);
      if (!active) return;
      if (error) {
        console.error(error);
        setStatusMessage?.(`Territories load failed: ${error.message}`);
        setLoading(false);
        return;
      }
      const mappedTerritories: Territory[] =
        data?.map((row: TerritoryRow): Territory => {
          const geom_geojson =
            typeof row.geom_geojson === "string"
              ? JSON.parse(row.geom_geojson)
              : row.geom_geojson;
          return {
            id: row.id,
            owner_user_id: row.owner_user_id,
            city_id: row.city_id,
            geom_geojson,
            area_m2: row.area_m2,
            updated_at: row.updated_at,
            owner_username: null
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
