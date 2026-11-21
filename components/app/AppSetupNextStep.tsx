"use client";
import { useEffect, useState } from "react";
import { SetupNextStep } from "@/components/platform/SetupNextStep";
import { GolfTripStart } from "@/components/platform/tour/GolfTripStart";
import { setupTypeFromParam } from "@/lib/platform/setupTypes";
import { appSupabase } from "@/lib/app/appAuth";

/** App → Create → a type: Golf Trip goes straight on (Learn the first time, then the first question) once the phone's
 *  login is known; other types show the shared coming-soon screen. */
export function AppSetupNextStep({ param }: { param: string }) {
  const type = setupTypeFromParam(param);
  const [profileId, setProfileId] = useState<string | null>(null);
  useEffect(() => {
    if (type?.key !== "golf-trip") return;
    void appSupabase().auth.getUser().then(({ data }) => setProfileId(data.user?.id ?? "guest"), () => setProfileId("guest"));
  }, [type?.key]);
  if (!type) return null;
  return type.key === "golf-trip" ? <GolfTripStart profileId={profileId} /> : <SetupNextStep type={type} />;
}
