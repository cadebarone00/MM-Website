import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { DevicePreview } from "@/components/platform/play/dev/DevicePreview";
import { isPlayDemoEnabled } from "@/lib/platform/playDemo";

/**
 * DEV ONLY: the /dev/play demo inside a phone-sized preview on desktop.
 * Same gate as the pages (NODE_ENV=development and DEV_PLAY_DEMO=true), so
 * the frame can never wrap anything in production. URLs are unchanged.
 */
export default function PlayDemoLayout({ children }: { children: ReactNode }) {
  if (!isPlayDemoEnabled()) notFound();
  return <DevicePreview>{children}</DevicePreview>;
}
