import type { Metadata } from "next";
import { ConnectAccounts } from "@/components/platform/ConnectAccounts";
import { GolfTripChoiceStep } from "@/components/platform/GolfTripChoiceStep";
import { SetupSheet } from "@/components/platform/SetupSheet";

export const metadata: Metadata = { title: "Create a Golf Trip | The Maroon" };

/**
 * Golf Trip questionnaire, step 7 (Flights). Yes offers to connect an airline account (not wired up yet);
 * No / Not sure yet will explain how to add it later (built later). Nothing is saved to the database yet.
 */
export default function GolfTripFlightsPage() {
  return <SetupSheet label="Flights">
    <GolfTripChoiceStep question="Do you know your flight info?" name="knowsFlights"
      nextHref="/golf-trips/new/transportation" backHref="/golf-trips/new/lodging" answers={{
        yes: <ConnectAccounts note="Connect your airline so your flights show up on the trip."
          providers={["American Airlines", "Delta", "Southwest", "United"]} />,
      }} />
  </SetupSheet>;
}
