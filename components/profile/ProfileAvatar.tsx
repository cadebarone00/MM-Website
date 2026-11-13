import { initialsFor } from "@/lib/profile/myProfile";
import styles from "./ProfileAvatar.module.css";

/**
 * The app's avatar going forward (owner rule 2026-11-13): the photo when there is one, otherwise the initials of
 * `name` in the Golf tab pull-down board's style. `size` is the circle's width in px; the initials scale with it.
 * `photo={false}` always shows the initials (Edit profile shows both circles side by side).
 */
export function ProfileAvatar({ name, photoUrl, size = 36, photo = true, className = "" }: { name: string; photoUrl?: string | null; size?: number; photo?: boolean; className?: string }) {
  const showPhoto = photo && photoUrl;
  return <span className={`${styles.avatar} ${className}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.39) }} aria-hidden="true">
    {/* eslint-disable-next-line @next/next/no-img-element -- a stored photo URL (or a dev data: URL), shown as-is */}
    {showPhoto ? <img src={photoUrl} alt="" /> : initialsFor(name)}
  </span>;
}
