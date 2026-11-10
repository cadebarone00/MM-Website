"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Cropper, { type Area } from "react-easy-crop";
import { cropToFile, PHOTO_ZOOM_MAX } from "@/lib/profile/photoCrop";
import styles from "./PhotoCropper.module.css";

/**
 * Full-screen "Move and scale" step for a profile photo (owner request 2026-11-02). The photo fills a square; a circle
 * shows what the profile picture will be. Drag to move, pinch (or scroll / trackpad on a computer) to zoom; the photo
 * can never be moved or zoomed so the circle shows empty space. Done returns the framed SQUARE as a JPEG (see
 * lib/profile/photoCrop.ts); Cancel returns nothing.
 */
export function PhotoCropper({ imageUrl, onCancel, onDone }: {
  imageUrl: string;
  onCancel: () => void;
  onDone: (file: File) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function done() {
    if (!area) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await cropToFile(imageUrl, area));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Couldn't crop that photo. Try again.");
      setBusy(false);
    }
  }

  return createPortal(<div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="photo-cropper-title">
    <h2 id="photo-cropper-title" className={styles.title}>Move and scale</h2>
    <div className={styles.square}>
      <Cropper image={imageUrl} crop={crop} zoom={zoom} maxZoom={PHOTO_ZOOM_MAX} aspect={1} cropShape="round" showGrid={false}
        objectFit="cover" zoomSpeed={0.5} onCropChange={setCrop} onZoomChange={setZoom}
        onCropComplete={(_, pixels) => setArea(pixels)}
        classes={{ containerClassName: styles.container, cropAreaClassName: styles.circle }} />
    </div>
    <p className={styles.hint}>Drag to move · Pinch to zoom</p>
    {/* Always rendered so the buttons never move when a message appears. */}
    <p className={styles.error} role="alert">{error}</p>
    <div className={styles.buttons}>
      <button type="button" className={styles.cancel} onClick={onCancel} disabled={busy}>Cancel</button>
      <button type="button" className={styles.done} onClick={() => void done()} disabled={!area || busy}>{busy ? "Saving…" : "Done"}</button>
    </div>
  </div>, document.body);
}
