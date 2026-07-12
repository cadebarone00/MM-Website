import { HTMLAttributes } from "react";
import type { Team } from "@/lib/data/types";

type Variant = "solid" | "soft" | "dot";
type Size = "sm" | "md" | "lg";

interface TeamBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "className"> {
  team?: Team;
  label?: string | null;
  variant?: Variant;
  size?: Size;
  className?: string;
}

const sizeClasses: Record<Size, { font: string; pad: string; swatch: string }> = {
  sm: { font: "text-3xs", pad: "px-2 py-[3px]", swatch: "w-2 h-2" },
  md: { font: "text-2xs", pad: "px-[10px] py-1", swatch: "w-[10px] h-[10px]" },
  lg: { font: "text-sm", pad: "px-[14px] py-[6px]", swatch: "w-3 h-3" },
};

export function TeamBadge({ team = "maroon", label = null, variant = "solid", size = "md", className = "", ...rest }: TeamBadgeProps) {
  const isMaroon = team === "maroon";
  const name = label || (isMaroon ? "Team Maroon" : "Team White");
  const s = sizeClasses[size];

  const skinClasses =
    variant === "dot"
      ? "bg-transparent text-ink-900 border-transparent"
      : variant === "soft"
        ? isMaroon
          ? "bg-maroon-50 text-maroon-700 border-maroon-200"
          : "bg-cream-100 text-ink-800 border-cream-300"
        : isMaroon
          ? "bg-maroon-700 text-cream-50 border-maroon-700"
          : "bg-white text-maroon-700 border-maroon-700";

  return (
    <span
      className={[
        "inline-flex items-center font-condensed font-semibold tracking-wide uppercase leading-snug rounded-sm border whitespace-nowrap",
        variant === "dot" ? "gap-[7px] p-0" : `gap-[6px] ${s.pad}`,
        s.font,
        skinClasses,
        className,
      ].join(" ")}
      {...rest}
    >
      {variant === "dot" && (
        <span
          className={[
            "rounded-xs shrink-0 border-[1.5px]",
            s.swatch,
            isMaroon ? "bg-maroon-700 border-maroon-700" : "bg-cream-200 border-maroon-400",
          ].join(" ")}
        />
      )}
      {name}
    </span>
  );
}
