"use client";

import maplibregl, { GeoJSONSource, LngLatLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { getStyleConfig, MapStyleOption } from "@/app/lib/mapStyles";
import type { Territory } from "@/app/hooks/useRealtimeTerritories";
import type { LivePlayer } from "@/app/hooks/useLivePlayers";
import type { TrackPoint } from "@/app/hooks/useGeolocationTracking";
import type { Feature, FeatureCollection, Geometry } from "geojson";

const parseGeoJson = (raw?: string | null) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const pointsToLineString = (points: TrackPoint[]) => ({
  type: "Feature",
  geometry: {
    type: "LineString",
    coordinates: points.map((point) => [point.lng, point.lat])
  },
  properties: {}
});

const pointsToStartFeature = (points: TrackPoint[]) => ({
  type: "Feature",
  geometry: points.length
    ? {
        type: "Point",
        coordinates: [points[0].lng, points[0].lat]
      }
    : null,
  properties: {}
});

export type MapViewProps = {
  center: [number, number];
  zoom: number;
  styleOption: MapStyleOption;
  territories: Territory[];
  livePlayers: LivePlayer[];
  trailPoints: TrackPoint[];
  showLive: boolean;
};

export const MapView = ({
  center,
  zoom,
  styleOption,
  territories,
  livePlayers,
  trailPoints,
  showLive
}: MapViewProps) => {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  const styleConfig = useMemo(() => getStyleConfig(styleOption), [styleOption]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      setStyleReady(false);
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleConfig.style as maplibregl.StyleSpecification,
      center: center as LngLatLike,
      zoom
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));

    map.on("load", () => {
      setStyleReady(true);
      map.addSource("territories", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] }
      });
      map.addLayer({
        id: "territory-fill",
        type: "fill",
        source: "territories",
        paint: {
          "fill-color": ["coalesce", ["get", "color"], "#34d399"],
          "fill-opacity": 0.35
        }
      });
      map.addLayer({
        id: "territory-outline",
        type: "line",
        source: "territories",
        paint: {
          "line-color": ["coalesce", ["get", "color"], "#34d399"],
          "line-width": 2
        }
      });

      map.addSource("trail", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] }
      });
      map.addLayer({
        id: "trail-line",
        type: "line",
        source: "trail",
        paint: {
          "line-color": "#60a5fa",
          "line-width": 4
        }
      });
      map.addLayer({
        id: "trail-start",
        type: "circle",
        source: "trail",
        paint: {
          "circle-radius": 6,
          "circle-color": "#f97316",
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 2
        },
        filter: ["==", ["get", "type"], "start"]
      });

      map.addSource("live", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] }
      });
      map.addLayer({
        id: "live-points",
        type: "circle",
        source: "live",
        paint: {
          "circle-radius": 5,
          "circle-color": "#a855f7"
        }
      });
    });

    mapRef.current = map;
  }, [center, styleConfig.style, zoom]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!styleReady) return;

    const map = mapRef.current;
    const territoriesSource = map.getSource("territories") as GeoJSONSource;
    const features = territories
      .map((territory) => {
        const geom = parseGeoJson(territory.geom_simplified);
        if (!geom) return null;
        return {
          type: "Feature",
          geometry: geom,
          properties: {
            id: territory.id,
            color: "#34d399",
            owner: territory.owner_username ?? "Runner"
          }
        };
      })
      .filter(Boolean);

    const fc: FeatureCollection = {
      type: "FeatureCollection",
      features: features as Feature<Geometry>[]
    };
    territoriesSource?.setData(fc);
  }, [styleReady, territories]);

  useEffect(() => {
    if (!mapRef.current || !styleReady) return;
    const map = mapRef.current;
    const trailSource = map.getSource("trail") as GeoJSONSource;

    const line = trailPoints.length ? pointsToLineString(trailPoints) : null;
    const start = trailPoints.length ? pointsToStartFeature(trailPoints) : null;

    const features = [
      line ? { ...line, properties: { type: "trail" } } : null,
      start && start.geometry
        ? { ...start, properties: { type: "start" } }
        : null
    ].filter(Boolean);

    trailSource?.setData({
      type: "FeatureCollection",
      features: features as Feature<Geometry>[]
    });
  }, [styleReady, trailPoints]);

  useEffect(() => {
    if (!mapRef.current || !styleReady) return;
    const map = mapRef.current;
    const liveSource = map.getSource("live") as GeoJSONSource;
    const features = showLive
      ? livePlayers
          .map((player) => {
            const geom = parseGeoJson(player.last_point);
            if (!geom) return null;
            return {
              type: "Feature",
              geometry: geom,
              properties: {
                username: player.username
              }
            };
          })
          .filter(Boolean)
      : [];

    liveSource?.setData({
      type: "FeatureCollection",
      features: features as Feature<Geometry>[]
    });
  }, [livePlayers, showLive, styleReady]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-3xl border border-white/10 shadow-neon">
      {!styleConfig.available && (
        <div className="absolute left-4 top-4 z-10 rounded-full bg-red-500/80 px-4 py-2 text-xs text-white">
          Satellite unavailable
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};
