import { GOLF_TRIP_MOCK_DRAFT, GOLF_MATCH_PREVIEW_SINGLES } from "@/lib/platform/golfTripPreviewFixture";
import type { SimulatorTripData } from "./golfTripSimulatorData";

/** Fictional development fixture; no saved team or real tournament roster. */
export const MAROON_U_PREVIEW: SimulatorTripData = {
  preview: { ...GOLF_TRIP_MOCK_DRAFT, tripName: "Maroon U Active", destination: "Maroon U Practice Campus", round1Course: "Canyon Ridge" },
  previewMatch: { ...GOLF_MATCH_PREVIEW_SINGLES, sides: [
    { ...GOLF_MATCH_PREVIEW_SINGLES.sides[0], name: "Maroon U Mustangs" },
    { ...GOLF_MATCH_PREVIEW_SINGLES.sides[1], name: "Maroon U Gold" },
  ] },
};
