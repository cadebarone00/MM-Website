import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DeleteAccountView } from "@/components/settings/SettingsSubpages";
import { loadDeleteAccount } from "@/lib/profile/profileScreensData";

export const metadata: Metadata = { title: "Delete account | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Settings → Account → Delete account. Anyone signed in can start it themselves (finished profile or not). */

export default async function DeleteAccountPage() {
  const data = await loadDeleteAccount();
  if (data.status === "signed-out") redirect("/login");
  return <DeleteAccountView preview={data.preview} />;
}
