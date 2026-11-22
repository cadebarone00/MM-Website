/**
 * MapLibre (free, open-source map library) for the GPS maps, loaded only in the browser and only when a map opens.
 *
 * MapLibre draws shapes in a background worker that it normally finds next to its own file — but the app's bundler moves
 * MapLibre's code, so it can't. The worker is served from public/ instead (a copy of
 * node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs). When upgrading maplibre-gl, copy the new worker there under the
 * new version number and update MAPLIBRE_VERSION (loadMapLibre.test.ts fails until both match package.json).
 */
export const MAPLIBRE_VERSION = "6.16.0";
export const MAPLIBRE_WORKER_URL = `/vendor/maplibre/maplibre-gl-worker-${MAPLIBRE_VERSION}.mjs`;

let loading: Promise<typeof import("maplibre-gl")> | null = null;

export function loadMapLibre(): Promise<typeof import("maplibre-gl")> {
  loading ??= import("maplibre-gl").then((maplibre) => {
    maplibre.setWorkerUrl(new URL(MAPLIBRE_WORKER_URL, window.location.href).href);
    return maplibre;
  }).catch((error: unknown) => { loading = null; throw error; });
  return loading;
}
