"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Navigation metadata only. No auth, player data, or mutation capability crosses the frame. */
export function WebsiteFrameBridge() {
  const pathname = usePathname();
  useEffect(() => {
    if (window.parent !== window) window.parent.postMessage({ type: "mm-website-location", path: pathname }, window.location.origin);
  }, [pathname]);
  return null;
}
