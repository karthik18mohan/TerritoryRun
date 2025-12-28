import type { StyleSpecification } from "maplibre-gl";

export type MapStyleOption = "street" | "satellite";

type StyleConfig = {
  name: string;
  style: StyleSpecification | string;
  available: boolean;
};

const buildRasterStyle = (tiles: string[]): StyleSpecification => ({
  version: 8,
  sources: {
    raster: {
      type: "raster",
      tiles,
      tileSize: 256
    }
  },
  layers: [
    {
      id: "raster",
      type: "raster",
      source: "raster"
    }
  ]
});

const isStyleUrl = (styleUrl: string) => styleUrl.endsWith(".json");

const withToken = (styleUrl: string, token: string) => {
  if (styleUrl.includes("access_token=")) return styleUrl;
  const joiner = styleUrl.includes("?") ? "&" : "?";
  return `${styleUrl}${joiner}access_token=${token}`;
};

const mapboxStyleToHttps = (styleUrl: string) =>
  styleUrl.startsWith("mapbox://styles/")
    ? styleUrl.replace("mapbox://styles/", "https://api.mapbox.com/styles/v1/")
    : styleUrl;

export const getStyleConfig = (style: MapStyleOption): StyleConfig => {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const streetStyle = process.env.NEXT_PUBLIC_MAP_STYLE_STREET;
  const satelliteStyle = process.env.NEXT_PUBLIC_MAP_STYLE_SATELLITE;
  const defaultStreetRaster = "/api/tiles/osm/{z}/{x}/{y}.png";
  const defaultSatelliteRaster = "/api/tiles/esri/{z}/{x}/{y}.png";

  if (mapboxToken) {
    const street = mapboxStyleToHttps(streetStyle ?? "mapbox://styles/mapbox/streets-v12");
    const satellite = mapboxStyleToHttps(
      satelliteStyle ?? "mapbox://styles/mapbox/satellite-streets-v12"
    );
    if (style === "street") {
      return {
        name: "Street",
        style: withToken(street, mapboxToken),
        available: true
      };
    }
    return {
      name: "Satellite",
      style: withToken(satellite, mapboxToken),
      available: true
    };
  }

  if (style === "street") {
    const fallback = streetStyle ?? defaultStreetRaster;
    return {
      name: "Street",
      style: isStyleUrl(fallback)
        ? fallback
        : buildRasterStyle([fallback]),
      available: true
    };
  }

  const fallbackSatellite = satelliteStyle ?? defaultSatelliteRaster;
  return {
    name: "Satellite",
    style: isStyleUrl(fallbackSatellite)
      ? fallbackSatellite
      : buildRasterStyle([fallbackSatellite]),
    available: true
  };

};
