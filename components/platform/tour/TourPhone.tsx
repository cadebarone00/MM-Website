"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { GolfTripHome } from "../GolfTripHome";
import { GOLF_MATCH_PREVIEW, GOLF_TRIP_MOCK_DRAFT } from "@/lib/platform/golfTripPreviewFixture";
import type { TourPage } from "@/lib/platform/tripTour";
import styles from "./TourPhone.module.css";

/** The real screen size the trip home is drawn at, then shrunk to fit the inner phone. */
const SCREEN = { width: 393, height: 852 };

/**
 * A phone drawn inside the screen, showing the real Golf Trip home with sample data (not the viewer's trip). It can't
 * be tapped. `page.callout` adds a gold outline (box = left, top, width, height in % of the screen) and a note.
 * `fade` lets the bottom of the phone melt into whatever sits under it (the Learn screen's buttons).
 */
export function TourPhone({ page, fade = false, children }: { page: TourPage; fade?: boolean; children?: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const fit = () => setScale(frame.clientWidth / SCREEN.width);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return <div className={`${styles.phone} ${fade ? styles.fade : ""}`}>
    <div ref={frameRef} className={styles.screen} aria-hidden="true" inert>
      <div className={styles.canvas} style={{ width: SCREEN.width, height: SCREEN.height, transform: `scale(${scale})` }}>
        <GolfTripHome preview={GOLF_TRIP_MOCK_DRAFT} previewMatch={GOLF_MATCH_PREVIEW} settingsHref="#" navigation={page.navigation} />
      </div>
      {page.callout && <>
        <span className={styles.ring} style={{ left: `${page.callout.box[0]}%`, top: `${page.callout.box[1]}%`, width: `${page.callout.box[2]}%`, height: `${page.callout.box[3]}%` }} />
        <span className={styles.note} style={{ top: `calc(${page.callout.box[1] + page.callout.box[3]}% + 8px)` }}>{page.callout.text}</span>
      </>}
    </div>
    {children}
  </div>;
}
