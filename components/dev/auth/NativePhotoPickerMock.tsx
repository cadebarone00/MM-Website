"use client";

import styles from "./NativePhotoPickerMock.module.css";

/**
 * DEV ONLY: look-alikes of the phone's OWN photo pickers, so the simulator can show the whole Profile photo flow. The real
 * ones are drawn by iOS / Android (owner decision 2026-11-02: keep the native UI where needed or required) and open from
 * the same <input type="file" accept="image/*"> the app uses; nothing here ships.
 */
export const SAMPLE_LIBRARY = ["cade-barone", "cam-latto", "collin-ross", "dalton-spriggs", "drew-weisser", "hugo-moebel", "luke-sherrell", "nate-wojciechowski"]
  .map((slug) => `/players/${slug}/avatar.png`);

/** iPhone: the menu iOS shows when a web / app photo field is tapped. */
export function IosSourceMenu({ onLibrary, onCancel }: { onLibrary: () => void; onCancel: () => void }) {
  return <div className={styles.iosBackdrop} onClick={onCancel}>
    <div className={styles.iosMenu} onClick={(e) => e.stopPropagation()} role="menu" aria-label="iPhone photo source">
      {[["Photo Library", "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5"], ["Take Photo", "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"], ["Choose File", "M4 6h6l2 2h8v11H4z"]].map(([label, icon]) =>
        <button key={label} type="button" role="menuitem" className={styles.iosItem} onClick={onLibrary}>
          <span>{label}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icon} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
        </button>)}
    </div>
  </div>;
}

/** iPhone: Apple's photo picker sheet (Photos / Albums, grid, Cancel). */
export function IosLibrary({ onPick, onCancel }: { onPick: (url: string) => void; onCancel: () => void }) {
  return <div className={styles.iosSheetBackdrop}>
    <section className={styles.iosSheet} aria-label="iPhone photo library">
      <div className={styles.grabber} aria-hidden="true" />
      <header className={styles.iosHeader}>
        <button type="button" className={styles.iosCancel} onClick={onCancel}>Cancel</button>
        <div className={styles.iosSegments} aria-hidden="true"><span className={styles.iosSegmentOn}>Photos</span><span>Albums</span></div>
        <span className={styles.iosHeaderSpacer} />
      </header>
      <div className={styles.iosGrid}>{[...SAMPLE_LIBRARY, ...SAMPLE_LIBRARY].map((url, index) =>
        <button key={index} type="button" className={styles.thumb} onClick={() => onPick(url)} aria-label={`Photo ${index + 1}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- dev mock thumbnail */}
          <img src={url} alt="" />
        </button>)}</div>
    </section>
  </div>;
}

/** Android: Google's system photo picker (bottom sheet, Photos / Albums tabs, grid). */
export function AndroidPicker({ onPick, onCancel }: { onPick: (url: string) => void; onCancel: () => void }) {
  return <div className={styles.androidBackdrop} onClick={onCancel}>
    <section className={styles.androidSheet} onClick={(e) => e.stopPropagation()} aria-label="Android photo picker">
      <div className={styles.androidHandle} aria-hidden="true" />
      <header className={styles.androidHeader}>
        <button type="button" className={styles.androidClose} onClick={onCancel} aria-label="Close">✕</button>
        <span>Select a photo</span>
      </header>
      <div className={styles.androidTabs} aria-hidden="true"><span className={styles.androidTabOn}>Photos</span><span>Albums</span></div>
      <p className={styles.androidDay}>Recent</p>
      <div className={styles.androidGrid}>{[...SAMPLE_LIBRARY, ...SAMPLE_LIBRARY].map((url, index) =>
        <button key={index} type="button" className={styles.thumb} onClick={() => onPick(url)} aria-label={`Photo ${index + 1}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- dev mock thumbnail */}
          <img src={url} alt="" />
        </button>)}</div>
      <p className={styles.androidNote}>Only the photo you select is shared with this app.</p>
    </section>
  </div>;
}
