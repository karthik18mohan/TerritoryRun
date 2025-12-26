import type { StyleSpecification } from "maplibre-gl";

export type MapStyleOption = "street" | "satellite";

type StyleConfig = {
  name: string;
  style: StyleSpecification | string;
  available: boolean;
};

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
    return {
      name: "Street",
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256
          }
        },
        layers: [
          {
            id: "osm",
            type: "raster",
            source: "osm"
          }
        ]
      },
      available: true
    };
  }

  if (satelliteStyle) {
    return {
      name: "Satellite",
      style: {
        version: 8,
        sources: {
          satellite: {
            type: "raster",
            tiles: [satelliteStyle],
            tileSize: 256
          }
        },
        layers: [
          {
            id: "satellite",
            type: "raster",
            source: "satellite"
          }
        ]
      },
      available: true
    };
  }

  return {
    name: "Satellite",
    style: {
      version: 8,
      sources: {},
      layers: []
    },
    available: false
  };
};
