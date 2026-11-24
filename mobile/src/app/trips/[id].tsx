import { useLocalSearchParams } from "expo-router";
import { ComingInPart } from "~/components/ComingInPart.tsx";

/** The trip page: rebuilt in Golf Trips part 2c (Home tab) onward. */
export default function TripScreen() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  return <ComingInPart title="Golf trip" heading={name || "Your trip"} part="2c" note="The trip page (Home, Golf, Venue, Itinerary)." />;
}
