import { UserRound } from "lucide-react";
import { HTMLAttributes } from "react";
import type { Team } from "@/lib/data/types";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

interface AvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, "className"> {
  src?: string | null;
  name?: string;
  size?: AvatarSize;
  team?: Team | null;
  className?: string;
}

export const AVATAR_SIZES: Record<AvatarSize, number> = { xs: 24, sm: 32, md: 44, lg: 60, xl: 88 };

/**
 * A person's avatar (owner rule 2026-11-19): the app's one avatar, ProfileAvatar — their photo once they add one,
 * otherwise their initials in a thin gold ring. No team-color rings. With no name (signed-out button) it shows the
 * same gold ring with a person icon, since that circle isn't anyone yet.
 */
// `team` is still accepted (old callers pass it) but no longer drawn; it is pulled out so it never reaches the DOM.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Avatar({ src = null, name = "", size = "md", team: _team = null, className = "", ...rest }: AvatarProps) {
  const px = AVATAR_SIZES[size];
  return (
    <span title={name || undefined} className={["inline-flex shrink-0", className].join(" ")} style={{ width: px, height: px }} {...rest}>
      {name || src ? <ProfileAvatar name={name} photoUrl={src} /> : (
        <span className="grid h-full w-full place-items-center rounded-full border border-[rgba(220,196,149,.5)] bg-[rgba(220,196,149,.12)] text-[var(--lm-ink-dcc495)]">
          <UserRound size={px * 0.48} strokeWidth={1.7} aria-hidden="true" />
        </span>
      )}
    </span>
  );
}
