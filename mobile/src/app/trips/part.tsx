import { useLocalSearchParams } from "expo-router";
import { ComingInPart } from "~/components/ComingInPart.tsx";

/** A trip screen that comes in a later Golf Trips part (Settings, Flights, imported trips…): says which, never a dead end. */
export default function TripPartScreen() {
  const { title, heading, part, note } = useLocalSearchParams<{ title?: string; heading?: string; part?: string; note?: string }>();
  return <ComingInPart title={title || "Golf trip"} heading={heading || "Your trip"} part={part || "2g"} note={note || "This screen."} />;
}
