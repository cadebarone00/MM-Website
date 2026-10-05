import { bearingDegrees, distanceYards, moveAlong } from "./distance";
import type { GpsHole, LatLng } from "./types";

/** Where the map camera goes for a hole: facing tee → green, zoomed so the hole fills the clear space. */
export interface HoleCamera {
  center: LatLng;
  /** Compass direction the top of the screen faces (tee → green), degrees. */
  heading: number;
  /** Google Maps zoom (fractional on vector maps). */
  zoom: number;
}

/** Screen space the map can use: the full map size, minus what the yardage card (top) and controls (bottom) cover. */
export interface HoleViewport {
  width: number;
  height: number;
  top: number;
  bottom: number;
  side: number;
}

/** Extra room around the hole, so the tee and the back of the green aren't on the very edge. */
const MARGIN_YARDS = 18;
const METERS_PER_YARD = 0.9144;
/** Google's ground resolution at zoom 0 at the equator, meters per pixel. */
const METERS_PER_PIXEL_ZOOM_0 = 156543.03392;

/**
 * The "hole view": turn the map so the tee is at the bottom and the green at the top, zoom so every part of the hole
 * (tee, green front / center / back, hazards, and any mapped hole line / green outline) fits between the yardage card
 * and the bottom controls, and center it in that clear band (not the middle of the screen, which sits partly under the
 * card).
 */
export function holeCamera(hole: GpsHole, viewport: HoleViewport): HoleCamera {
  const heading = bearingDegrees(hole.tee, hole.green.center);
  const points = [hole.tee, hole.green.front, hole.green.center, hole.green.back, ...hole.hazards.map((hazard) => hazard.center), ...(hole.frame ?? [])];

  // Each point in "hole space": yards up the hole (along) and yards right of the line (across), from the tee.
  const local = points.map((point) => {
    const yards = distanceYards(hole.tee, point);
    const angle = ((bearingDegrees(hole.tee, point) - heading) * Math.PI) / 180;
    return { along: yards * Math.cos(angle), across: yards * Math.sin(angle) };
  });
  const alongMin = Math.min(...local.map((p) => p.along)) - MARGIN_YARDS;
  const alongMax = Math.max(...local.map((p) => p.along)) + MARGIN_YARDS;
  const acrossMin = Math.min(...local.map((p) => p.across)) - MARGIN_YARDS;
  const acrossMax = Math.max(...local.map((p) => p.across)) + MARGIN_YARDS;

  // Zoom: the tighter of "hole length fits the band's height" and "hole width fits the screen's width".
  const bandHeight = Math.max(80, viewport.height - viewport.top - viewport.bottom);
  const bandWidth = Math.max(80, viewport.width - 2 * viewport.side);
  const metersPerPixel = Math.max(((alongMax - alongMin) * METERS_PER_YARD) / bandHeight, ((acrossMax - acrossMin) * METERS_PER_YARD) / bandWidth);
  const groundAtZoom0 = METERS_PER_PIXEL_ZOOM_0 * Math.cos((hole.tee.lat * Math.PI) / 180);
  const zoom = Math.min(20, Math.max(14, Math.log2(groundAtZoom0 / metersPerPixel)));

  // Middle of the hole, then nudged up the hole so it lands in the middle of the clear band, not the screen.
  const middle = moveAlong(moveAlong(hole.tee, heading, (alongMin + alongMax) / 2), heading + 90, (acrossMin + acrossMax) / 2);
  const bandOffsetPixels = (viewport.top - viewport.bottom) / 2;
  const actualMetersPerPixel = groundAtZoom0 / 2 ** zoom;
  const center = moveAlong(middle, heading, (bandOffsetPixels * actualMetersPerPixel) / METERS_PER_YARD);
  return { center, heading, zoom };
}
