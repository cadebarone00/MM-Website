import { initialsFor } from "@/lib/profile/myProfile";
import styles from "./ProfileAvatar.module.css";

/**
 * The app's one avatar (owner rule 2026-11-13, every page 2026-11-19): ONE person's photo when they have one, otherwise
 * their initials in the Golf tab pull-down board's style. `size` is the circle's width in px; without it the circle fills
 * its parent (the page's own sized/positioned slot). The initials always scale with the circle.
 * `photo={false}` always shows the initials (Edit profile shows both circles side by side).
 */
export function ProfileAvatar({ name, photoUrl, size, photo = true, className = "", title }: { name: string; photoUrl?: string | null; size?: number; photo?: boolean; className?: string; title?: string }) {
  const showPhoto = photo && photoUrl;
  return <span className={`${styles.avatar} ${size ? "" : styles.fill} ${className}`} style={size ? { width: size, height: size } : undefined} title={title} aria-hidden="true">
    {/* eslint-disable-next-line @next/next/no-img-element -- a stored photo URL (or a dev data: URL), shown as-is */}
    {showPhoto ? <img src={photoUrl} alt="" /> : <span className={styles.initials}>{initialsFor(name)}</span>}
  </span>;
}
