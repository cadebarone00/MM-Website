"use client";
import { SetupNextStep } from "@/components/platform/SetupNextStep";
import { setupTypeFromParam } from "@/lib/platform/setupTypes";
import { useAppProfileId } from "@/lib/app/useAppProfileId";

/** App → Create → a type: the shared screen, with the profile id from the phone's login. */
export function AppSetupNextStep({ param }: { param: string }) {
  const profileId = useAppProfileId();
  const type = setupTypeFromParam(param);
  return type ? <SetupNextStep type={type} profileId={profileId} /> : null;
}
