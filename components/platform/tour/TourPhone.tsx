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
    <span className={`${styles.side} ${styles.sideLeft} ${styles.action}`} aria-hidden="true" />
    <span className={`${styles.side} ${styles.sideLeft} ${styles.volumeUp}`} aria-hidden="true" />
    <span className={`${styles.side} ${styles.sideLeft} ${styles.volumeDown}`} aria-hidden="true" />
    <span className={`${styles.side} ${styles.sideRight} ${styles.power}`} aria-hidden="true" />
    <span className={`${styles.side} ${styles.sideRight} ${styles.cameraControl}`} aria-hidden="true" />
    <div ref={frameRef} className={styles.screen} aria-hidden="true" inert>
      <div className={styles.canvas} style={{ width: SCREEN.width, height: SCREEN.height, transform: `scale(${scale})` }}>
        <GolfTripHome preview={GOLF_TRIP_MOCK_DRAFT} previewMatch={GOLF_MATCH_PREVIEW} settingsHref="#" navigation={page.navigation} />
        <div className={styles.statusBar}>
          <span>9:41</span>
          <span className={styles.icons}>
            <svg width="18" height="12" viewBox="0 0 18 12" fill="#fbf8f1"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
            <svg width="16" height="12" viewBox="0 0 16 12" fill="#fbf8f1"><path d="M8 2.2c2.4 0 4.6.9 6.2 2.5l1.3-1.3A10.6 10.6 0 0 0 8 .3 10.6 10.6 0 0 0 .5 3.4l1.3 1.3A8.7 8.7 0 0 1 8 2.2Zm0 3.7c1.4 0 2.7.5 3.6 1.4l1.3-1.3A7 7 0 0 0 8 4a7 7 0 0 0-4.9 2l1.3 1.3c.9-.9 2.2-1.4 3.6-1.4Zm0 3.7c.5 0 .9.2 1.2.5L8 11.7 6.8 10.1c.3-.3.7-.5 1.2-.5Z" /></svg>
            <span className={styles.battery} />
          </span>
        </div>
        <span className={styles.island} />
      </div>
      {page.callout && <>
        <span className={styles.ring} style={{ left: `${page.callout.box[0]}%`, top: `${page.callout.box[1]}%`, width: `${page.callout.box[2]}%`, height: `${page.callout.box[3]}%` }} />
        <span className={styles.note} style={{ top: `calc(${page.callout.box[1] + page.callout.box[3]}% + 8px)` }}>{page.callout.text}</span>
      </>}
    </div>
    {children}
  </div>;
}
