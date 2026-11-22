import type { StyleSpecification } from "maplibre-gl";

/**
 * Satellite photos for the GPS map: USGS The National Map, "USGSImageryOnly" (US government aerial photos — free, public
 * domain, US only). Owner choice 2026-11-21 (instead of Google satellite, to keep cost at $0).
 *
 * USGS's ready-made tiles stop at zoom 16 (too blurry for one hole), so each map tile is drawn on demand by the service's
 * `export` endpoint at the exact area MapLibre asks for ({bbox-epsg-3857}). The service allows browser requests (CORS *).
 * Outside the US the photos are blank; the hole shapes and yardages still work.
 */
export const USGS_IMAGERY_TILE_URL = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/export"
  + "?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=jpg&f=image";
/** Credit line shown on the map. */
export const USGS_IMAGERY_ATTRIBUTION = "Imagery: USGS The National Map";

/** A MapLibre map style that is just the USGS photos over a dark background. */
export function usgsSatelliteStyle(background = "#2a0a12"): StyleSpecification {
  return {
    version: 8,
    sources: {
      usgs: { type: "raster", tiles: [USGS_IMAGERY_TILE_URL], tileSize: 512, maxzoom: 19, attribution: USGS_IMAGERY_ATTRIBUTION },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": background } },
      { id: "usgs", type: "raster", source: "usgs" },
    ],
  };
}
