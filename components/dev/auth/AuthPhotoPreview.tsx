"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MaroonMark } from "@/components/brand/MaroonMark";
import { PhotoCropper } from "@/components/profile/PhotoCropper";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { AndroidPicker, IosLibrary, IosSourceMenu } from "./NativePhotoPickerMock";
import frame from "./AuthNamePreview.module.css";
import { signUpProgress } from "@/lib/dev/authScreens";
import styles from "./AuthPhotoPreview.module.css";

/** A real, non-square sample photo for the simulator's "Move and scale" and "Photo chosen" states. */
const SAMPLE_PHOTO = "/players/cade-barone/avatar.png";
export type PhotoStage = "empty" | "crop" | "chosen" | "ios-menu" | "ios-library" | "android-picker";
type NativeMock = "ios-menu" | "ios-library" | "android-picker" | null;

/** DEV ONLY: Authentication screen "Profile photo" (optional). Pick -> Move and scale (square, circle guide) -> the round
 *  result. The cropped image is only previewed, never uploaded; the size line shows what WOULD be uploaded. The simulator's
 *  conditionals (lib/dev/simulatorRoutes.ts) open it at No photo yet / Move and scale / Photo chosen, or with a look-alike
 *  of the phone's own picker (iPhone menu, iPhone library, Android picker: NativePhotoPickerMock.tsx). In those phone
 *  states, tapping the circle opens the look-alike again instead of this computer's file chooser. */
export function AuthPhotoPreview() {
  const stage = useSimulator()?.state.photoStage ?? "empty";
  return <PhotoStep key={stage} stage={stage} />;
}

function PhotoStep({ stage }: { stage: PhotoStage }) {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(stage === "chosen" ? SAMPLE_PHOTO : null);
  const [picked, setPicked] = useState<string | null>(stage === "crop" ? SAMPLE_PHOTO : null); // the original, while the cropper is open
  const [saved, setSaved] = useState<string | null>(null);
  const phone = stage.startsWith("ios") ? "ios" : stage.startsWith("android") ? "android" : null;
  const [mock, setMock] = useState<NativeMock>(stage === "ios-menu" || stage === "ios-library" || stage === "android-picker" ? stage : null);
  const pickFromMock = (url: string) => { setMock(null); setPicked(url); };
  useEffect(() => () => { if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => { if (picked?.startsWith("blob:")) URL.revokeObjectURL(picked); }, [picked]);

  return <main className={frame.page}>
    <div className={frame.logo}><MaroonMark color="#fbf8f1" /></div>
    <div className={frame.progress} aria-hidden="true"><span style={{ width: signUpProgress("photo") }} /></div>
    <h1 className={`${frame.title} ${styles.title}`}>Add a profile image</h1>
    <p className={styles.subtitle}>Pick a photo so your golf buddies know it&apos;s you.</p>
    <label className={styles.tile}>
      {phone
        ? <button type="button" className={styles.file} aria-label="Choose a photo" onClick={() => setMock(phone === "ios" ? "ios-menu" : "android-picker")} />
        : <input type="file" accept="image/*" className={styles.file}
          onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) setPicked(URL.createObjectURL(file)); }} />}
      {preview
        ? <img src={preview} alt="Your profile photo" className={styles.photo} />
        : <><AddPhotoIcon /><span className={styles.tap}>Tap to choose a photo</span></>}
    </label>
    <p className={styles.subtitle}>{saved ?? " "}</p>
    <button type="button" className={frame.continue} onClick={() => router.push("/dev/auth/settings")}>
      {preview ? "Continue" : "Skip for now"}
    </button>
    {mock === "ios-menu" && <IosSourceMenu onLibrary={() => setMock("ios-library")} onCancel={() => setMock(null)} />}
    {mock === "ios-library" && <IosLibrary onPick={pickFromMock} onCancel={() => setMock(null)} />}
    {mock === "android-picker" && <AndroidPicker onPick={pickFromMock} onCancel={() => setMock(null)} />}
    {picked && <PhotoCropper imageUrl={picked} onCancel={() => setPicked(null)}
      onDone={(file) => { setPreview(URL.createObjectURL(file)); setSaved(`Would upload: ${Math.round(file.size / 1024)} KB JPEG`); setPicked(null); }} />}
  </main>;
}

export function AddPhotoIcon() {
  return <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6M3 16l4.5-4.5a1.5 1.5 0 0 1 2 0L15 17m-2-2 1.5-1.5a1.5 1.5 0 0 1 2 0L19 16M19 3v6m-3-3h6"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
