import { HTMLAttributes } from "react";
import { AVATAR_SIZES, type AvatarSize } from "@/components/ui/Avatar";

interface TigerAvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, "className"> {
  size?: AvatarSize;
  className?: string;
}

export function TigerAvatar({ size = "md", className = "", ...rest }: TigerAvatarProps) {
  const px = AVATAR_SIZES[size];

  return (
    <span
      title="Tiger"
      className={[
        "inline-flex items-center justify-center rounded-full shrink-0 border border-gold-400 text-gold-400 font-condensed font-bold",
        className,
      ].join(" ")}
      style={{ width: px, height: px, fontSize: px * 0.5 }}
      {...rest}
    >
      T
    </span>
  );
}
