import Image from "next/image";
import { UserRound } from "lucide-react";
import { HTMLAttributes } from "react";
import type { Team } from "@/lib/data/types";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

interface AvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, "className"> {
  src?: string | null;
  name?: string;
  size?: AvatarSize;
  team?: Team | null;
  className?: string;
}

export const AVATAR_SIZES: Record<AvatarSize, number> = { xs: 24, sm: 32, md: 44, lg: 60, xl: 88 };

export function Avatar({ src = null, name = "", size = "md", team = null, className = "", ...rest }: AvatarProps) {
  const px = AVATAR_SIZES[size];

  const ring =
    team === "maroon"
      ? "shadow-[0_0_0_4px_#500001,0_0_0_6px_#b8945a]"
      : team === "white"
        ? "shadow-[0_0_0_4px_#ffffff,0_0_0_6px_#b8945a]"
        : "";

  return (
    <span
      title={name || undefined}
      className={[
        "inline-flex items-center justify-center rounded-full overflow-hidden shrink-0 bg-maroon-50 text-maroon-700 font-condensed font-bold tracking-[0.02em]",
        ring,
        className,
      ].join(" ")}
      style={{ width: px, height: px, fontSize: px * 0.4 }}
      {...rest}
    >
      {src ? (
        <Image src={src} alt={name} width={px} height={px} className="w-full h-full object-cover block" />
      ) : (
        <UserRound size={px * 0.48} strokeWidth={1.7} aria-hidden="true" />
      )}
    </span>
  );
}
