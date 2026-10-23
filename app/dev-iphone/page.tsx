import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { iphonePreviewEnabled } from "@/lib/dev/iphonePreview";
import { simulatorPages } from "@/lib/dev/simulatorRoutes";
import { IphonePreview } from "@/components/dev/IphonePreview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Maroon iPhone development", robots: { index: false, follow: false } };

export default async function IphonePreviewPage() {
  if (!iphonePreviewEnabled()) notFound();
  // Only audited fixture components, never the registry's live-account/auth/public routes.
  const pages = simulatorPages().filter(page => page.path === "/dev/tournament" || page.path === "/dev/profile");
  return <IphonePreview pages={pages} />;
}
