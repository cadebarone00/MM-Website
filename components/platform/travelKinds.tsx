import { BedDouble, CalendarDays, Car, Flag, Plane, UtensilsCrossed } from "lucide-react";
import type { ItineraryKind } from "@/lib/platform/golfTripItinerary";

/** Picture colors for each kind of trip item (same gradients as the Golf Trip Home tiles). */
export const TRAVEL_KIND_ART: Record<ItineraryKind, string> = {
  flight: "linear-gradient(135deg,#8a2433,#4a0f19)",
  lodging: "linear-gradient(135deg,#6b7fa8,#2f3e5f)",
  teeTime: "linear-gradient(135deg,#3f8a55,#1c4a2b)",
  ride: "linear-gradient(135deg,#7a7a7a,#3a3a3a)",
  dining: "linear-gradient(135deg,#9a8a6a,#5a4d33)",
  other: "linear-gradient(135deg,#5c8f9e,#2c5361)",
};

/** The icon for a kind of trip item (plane, bed, flag, car, fork & knife, calendar). */
export function TravelKindIcon({ kind, size }: { kind: ItineraryKind; size: number }) {
  const props = { size, strokeWidth: 2, "aria-hidden": true } as const;
  if (kind === "flight") return <Plane {...props} />;
  if (kind === "lodging") return <BedDouble {...props} />;
  if (kind === "teeTime") return <Flag {...props} />;
  if (kind === "ride") return <Car {...props} />;
  if (kind === "dining") return <UtensilsCrossed {...props} />;
  return <CalendarDays {...props} />;
}
