import type { Metadata } from "next";
import { ConnectAccounts } from "@/components/platform/ConnectAccounts";
import { GolfTripChoiceStep } from "@/components/platform/GolfTripChoiceStep";
import { SetupSheet } from "@/components/platform/SetupSheet";

export const metadata: Metadata = { title: "Create a Golf Trip | The Maroon" };

/**
 * Golf Trip questionnaire, step 6 (Lodging). Yes offers to connect a booking account (not wired up yet);
 * No / Not sure yet will explain how to add it later (built later). Nothing is saved to the database yet.
 */
export default function GolfTripLodgingPage() {
  return <SetupSheet label="Lodging">
    <GolfTripChoiceStep question="Do you know where you're staying?" name="knowsLodging"
      nextHref="/golf-trips/new/flights" backHref="/golf-trips/new/format" answers={{
        yes: <ConnectAccounts note="Connect your reservation so your stay shows up on the trip."
          providers={["Hotel", "Airbnb", "VRBO"]} />,
      }} />
  </SetupSheet>;
}
