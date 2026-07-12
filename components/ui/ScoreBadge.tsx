import { HTMLAttributes } from "react";

type Size = "sm" | "md" | "lg";

interface ScoreBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "className"> {
  value?: number;
  chip?: boolean;
  size?: Size;
  className?: string;
}

const sizeClasses: Record<Size, { font: string; pad: string; minW: string }> = {
  sm: { font: "text-sm", pad: "px-[7px] py-[2px]", minW: "min-w-[28px]" },
  md: { font: "text-lg", pad: "px-[10px] py-[3px]", minW: "min-w-[38px]" },
  lg: { font: "text-2xl", pad: "px-3 py-1", minW: "min-w-[52px]" },
};

export function ScoreBadge({ value = 0, chip = false, size = "md", className = "", ...rest }: ScoreBadgeProps) {
  const n = Number(value) || 0;
  const label = n === 0 ? "E" : n > 0 ? `+${n}` : `−${Math.abs(n)}`;
  const color = n < 0 ? "text-score-under" : n > 0 ? "text-score-over" : "text-score-even";
  const tint = n < 0 ? "bg-[rgba(200,16,46,0.10)]" : n > 0 ? "bg-ink-100" : "bg-[rgba(30,77,58,0.10)]";
  const s = sizeClasses[size];

  return (
    <span
      className={[
        "inline-flex items-center justify-center font-score font-bold leading-none tracking-[0.01em] tabular-nums",
        color,
        s.font,
        chip ? `${s.pad} ${s.minW} ${tint} rounded-sm` : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {label}
    </span>
  );
}
