"use client";

import { usePathname } from "next/navigation";
import { AppComingSoon } from "@/components/app/AppComingSoon";

/** App → any address the app has no screen for: "Not in the app" (with a link to the website's page where it has one). */
export default function AppNotFound() {
  return <AppComingSoon path={(usePathname() || "/").replace(/(.)\/+$/, "$1")} />;
}
