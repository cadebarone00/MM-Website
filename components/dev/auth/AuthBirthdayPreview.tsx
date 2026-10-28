"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { MaroonMark } from "@/components/brand/MaroonMark";
import { GolfTripDatePicker } from "@/components/platform/GolfTripDatePicker";
import frame from "./AuthNamePreview.module.css";
import { signUpProgress } from "@/lib/dev/authScreens";
import styles from "./AuthBirthdayPreview.module.css";

/** DEV ONLY: Authentication "Birthday" (signup step). Three boxes (Month, Day, a longer Year); tapping any of them opens
 * the app's date picker (with a year dropdown), and the picked date fills all three. The real version saves it to the
 * profile; nothing is saved here. */
export function AuthBirthdayPreview() {
  const router = useRouter();
  const [birthday, setBirthday] = useState(""); // YYYY-MM-DD
  const [open, setOpen] = useState(false);
  const today = new Date().toLocaleDateString("en-CA");
  const [year, month, day] = birthday ? birthday.split("-") : [];

  return <main className={frame.page}>
    <div className={frame.logo}><MaroonMark color="#fbf8f1" /></div>
    <div className={frame.progress} aria-hidden="true"><span style={{ width: signUpProgress("age-check") }} /></div>
    <h1 className={frame.title}>What&apos;s your birthday?</h1>
    <button type="button" className={styles.boxes} aria-haspopup="dialog"
      aria-label={birthday ? `Birthday ${month}/${day}/${year}. Change` : "Pick your birthday"} onClick={() => setOpen(true)}>
      {[["Month", month, "MM"], ["Day", day, "DD"], ["Year", year, "YYYY"]].map(([label, value, placeholder]) =>
        <span key={label} className={styles.column}>
          <span className={styles.label}>{label}</span>
          <strong className={`${styles.box} ${value ? "" : styles.empty}`}>{value ?? placeholder}</strong>
        </span>)}
    </button>
    <p className={styles.note}>We require your date of birth to assist us in complying with privacy laws, as well as manage and personalize your account.</p>
    <button type="button" className={`${frame.continue} ${styles.continue}`} disabled={!birthday} onClick={() => router.push("/dev/auth/photo")}>Continue</button>
    {open && createPortal(<GolfTripDatePicker singleDay pickYear label="Birthday" arrival={birthday} departure={birthday} maxDays={1}
      min="1900-01-01" max={today} openMonth="2000-01" onClose={() => setOpen(false)}
      onSubmit={(date) => { setBirthday(date); setOpen(false); }} />, document.body)}
  </main>;
}
