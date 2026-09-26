"use client";

import { useEffect, useState } from "react";
import { formatViewerLocalTeeTime } from "@/lib/live/viewerLocalTime";

/**
 * Renders an absolute instant in the viewer's own local time, but only
 * after this component has actually mounted in a real browser. A
 * "use client" component is still prerendered on the SERVER for its
 * initial HTML in the App Router — calling formatViewerLocalTeeTime
 * directly during that server render would format in the SERVER's
 * timezone, not the visitor's, and then mismatch during hydration. This
 * component renders nothing until mount, then fills in the real value.
 */
export function ViewerLocalTime({ date }: { date: Date }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the browser's own timezone IS the external system being synchronized here; a render-time read would run on the server too, which is the whole bug this component exists to prevent.
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return <>{formatViewerLocalTeeTime(date)}</>;
}
