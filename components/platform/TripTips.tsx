"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { coachStops } from "@/lib/platform/coachMarks";
import { TIPS_SEEN_KEY, hasSeen, markSeen } from "@/lib/platform/tripTour";
import { CoachMarks } from "./CoachMarks";

/** The trip home's first-visit coach marks: once per account (Settings → Show tips again brings them back). */
export function TripTips({ profileId, isOrganizer }: { profileId: string; isOrganizer: boolean }) {
  const [show, setShow] = useState(false);
  // Wait a moment so the screen has settled before measuring where the buttons are.
  useEffect(() => {
    if (hasSeen(TIPS_SEEN_KEY, profileId)) return;
    const timer = setTimeout(() => setShow(true), 600);
    return () => clearTimeout(timer);
  }, [profileId]);
  const stops = useMemo(() => coachStops(isOrganizer), [isOrganizer]);
  const done = useCallback(() => { markSeen(TIPS_SEEN_KEY, profileId); setShow(false); }, [profileId]);
  if (!show) return null;
  return <CoachMarks stops={stops} onDone={done} />;
}
