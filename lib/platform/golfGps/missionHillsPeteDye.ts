import type { GpsCourse, GpsHole } from "./types";

/**
 * Mission Hills Country Club (Rancho Mirage, CA) — Pete Dye Challenge Course. Course data © OpenStreetMap contributors,
 * available under the ODbL (openstreetmap.org/copyright); the UI must credit OpenStreetMap wherever it's shown.
 *
 * OpenStreetMap only maps hole 6 of this course so far ("Dye 6", hole line way 1379409310). Points were derived on
 * 2026-10-05 from these OSM shapes (course relation 4082113, operator "Mission Hills Country Club"):
 *   tee   — centroid of the back tee box, way 1379409303 (the other tee boxes play 163 / 153 / 126 yd)
 *   green — centroid of way 1379409308; front and back are where the back-tee → centre line enters and leaves its outline
 *   bunker — centroid of way 1379409307, radius from its area
 * Holes OSM hasn't mapped need another source (organizer-placed pins or a golf-data provider) — never traced from
 * Google imagery.
 */
export const PETE_DYE_HOLE_6: GpsHole = {
  number: 6,
  par: 3,
  tee: { lat: 33.808419, lng: -116.433661 }, // 186 yd to the centre of the green
  green: {
    front: { lat: 33.807407, lng: -116.432443 }, // 174 yd
    center: { lat: 33.807337, lng: -116.432359 }, // 186 yd
    back: { lat: 33.807248, lng: -116.432251 }, // 202 yd
  },
  hazards: [
    { id: "short-bunker", kind: "bunker", label: "Bunker", center: { lat: 33.807719, lng: -116.432827 }, radiusYards: 11 },
  ],
};

export const MISSION_HILLS_PETE_DYE: GpsCourse = {
  name: "Mission Hills Country Club — Pete Dye Challenge Course",
  note: "Hole data © OpenStreetMap contributors. Only hole 6 is mapped so far.",
  holes: [PETE_DYE_HOLE_6],
};
