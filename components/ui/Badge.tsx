import { HTMLAttributes, ReactNode } from "react";

type Variant = "neutral" | "maroon" | "solid" | "gold" | "fairway" | "live";
type Size = "sm" | "md" | "lg";

interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "className"> {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  dot?: boolean;
  live?: boolean;
  className?: string;
}

const sizeClasses: Record<Size, string> = {
  sm: "px-[7px] py-[2px] text-[10px] gap-[5px]",
  md: "px-[9px] py-[3px] text-3xs gap-[6px]",
  lg: "px-3 py-[5px] text-2xs gap-[7px]",
};

const variantClasses: Record<Variant, string> = {
  neutral: "bg-ink-100 text-ink-700 border-ink-200",
  maroon: "bg-maroon-50 text-maroon-700 border-maroon-200",
  solid: "bg-maroon-700 text-cream-50 border-maroon-700",
  gold: "bg-gold-200 text-gold-700 border-gold-400",
  fairway: "bg-[#E2EDE7] text-fairway-700 border-fairway-300",
  live: "bg-[rgba(200,16,46,0.12)] text-score-under border-[rgba(200,16,46,0.3)]",
};

export function Badge({
  children,
  variant = "neutral",
  size = "md",
  dot = false,
  live = false,
  className = "",
  ...rest
}: BadgeProps) {
  const showDot = dot || live;
  const v = live ? variantClasses.live : variantClasses[variant];

  return (
    <span
      className={[
        "inline-flex items-center font-condensed font-semibold tracking-wide uppercase leading-snug rounded-pill border whitespace-nowrap",
        sizeClasses[size],
        v,
        className,
      ].join(" ")}
      {...rest}
    >
      {showDot && (
        <span
          className={[
            "w-[6px] h-[6px] rounded-full bg-current shrink-0",
            live ? "mm-live-dot" : "",
          ].join(" ")}
        />
      )}
      {children}
    </span>
  );
}
