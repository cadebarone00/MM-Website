"use client";
import { ProfileForm } from "@/components/profile/ProfileForm";
import type { EditProfileData } from "@/lib/profile/profileScreensData";
import { useAppData } from "@/components/app/useAppData";
import { AppStatus } from "@/components/app/AppStatus";

/** App → Profile → Edit profile. */
export default function AppEditProfile() {
  const [state, reload] = useAppData<EditProfileData>("/api/app/profile?view=edit");
  if (state.status !== "ok") return <AppStatus state={state} onRetry={reload} />;
  if (state.data.status !== "ok") return <AppStatus state={{ status: "error", error: "Finish setting up your profile first.", code: 409 }} onRetry={reload} />;
  return <ProfileForm mode="edit" initial={state.data.form} />;
}
