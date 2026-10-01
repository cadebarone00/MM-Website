import type { Metadata } from "next";
import { ConnectAccounts } from "@/components/platform/ConnectAccounts";
import { GolfTripChoiceStep } from "@/components/platform/GolfTripChoiceStep";
import { SetupSheet } from "@/components/platform/SetupSheet";

export const metadata: Metadata = { title: "Create a Golf Trip | The Maroon" };

/**
 * Golf Trip questionnaire, step 8 (Transportation): getting around during the trip. Yes offers to connect a
 * rental car account (not wired up yet); No / Not sure yet will explain how to add it later (built later).
 * Nothing is saved to the database yet.
 */
export default function GolfTripTransportationPage() {
  return <SetupSheet label="Transportation">
    <GolfTripChoiceStep question="Do you know how you're getting around?" name="knowsTransportation"
      nextHref="/golf-trips/new/review" backHref="/golf-trips/new/flights" answers={{
        yes: <ConnectAccounts note="Connect your rental car so it shows up on the trip."
          providers={["Hertz", "Enterprise", "Avis"]} />,
      }} />
  </SetupSheet>;
}
