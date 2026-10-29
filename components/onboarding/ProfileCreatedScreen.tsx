"use client";

import { useEffect } from "react";
import { AuthProfileCreatedPreview } from "@/components/dev/auth/AuthProfileCreatedPreview";

/** Profile Created (approved design, unchanged). Once it is on screen the one-time marker is used up, so a refresh or a
 *  later visit goes to Play (Phase 7A; lib/account/activationMarker.ts). */
export function ProfileCreatedScreen() {
  useEffect(() => { void fetch("/api/account/activation-seen", { method: "POST" }).catch(() => undefined); }, []);
  return <AuthProfileCreatedPreview />;
}
