"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MaroonMark } from "@/components/brand/MaroonMark";
import frame from "./AuthNamePreview.module.css";
import styles from "./AuthPhotoPreview.module.css";

/** DEV ONLY: Authentication screen "Profile photo" (optional). The picked image is only previewed, never uploaded. */
export function AuthPhotoPreview() {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  return <main className={frame.page}>
    <div className={frame.logo}><MaroonMark color="#fbf8f1" /></div>
    <div className={`${frame.progress} ${styles.progress}`} aria-hidden="true"><span /></div>
    <h1 className={`${frame.title} ${styles.title}`}>Add a profile image</h1>
    <p className={styles.subtitle}>Pick a photo so your golf buddies know it&apos;s you.</p>
    <label className={styles.tile}>
      <input type="file" accept="image/*" className={styles.file}
        onChange={(e) => { const file = e.target.files?.[0]; if (file) setPreview(URL.createObjectURL(file)); }} />
      {preview
        ? <img src={preview} alt="Your profile photo" className={styles.photo} />
        : <><AddPhotoIcon /><span className={styles.tap}>Tap to choose a photo</span></>}
    </label>
    <p className={frame.note}><LockIcon />Only people you play with can see your photo.</p>
    <button type="button" className={frame.continue} onClick={() => router.push("/dev/auth/settings")}>
      {preview ? "Continue" : "Skip for now"}
    </button>
  </main>;
}

function AddPhotoIcon() {
  return <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6M3 16l4.5-4.5a1.5 1.5 0 0 1 2 0L15 17m-2-2 1.5-1.5a1.5 1.5 0 0 1 2 0L19 16M19 3v6m-3-3h6"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

function LockIcon() {
  return <svg className={frame.lock} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z" fill="currentColor" />
  </svg>;
}
