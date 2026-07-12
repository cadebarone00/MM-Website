import { HTMLAttributes, ReactNode } from "react";

type Size = "sm" | "md" | "lg";
type Align = "center" | "left";

interface StatPillProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  value: ReactNode;
  label: ReactNode;
  sublabel?: ReactNode;
  align?: Align;
  accent?: boolean;
  size?: Size;
  className?: string;
}

const sizeClasses: Record<Size, { value: string; label: string }> = {
  sm: { value: "text-2xl", label: "text-3xs" },
  md: { value: "text-3xl", label: "text-2xs" },
  lg: { value: "text-5xl", label: "text-xs" },
};

export function StatPill({
  value,
  label,
  sublabel = null,
  align = "center",
  accent = false,
  size = "md",
  className = "",
  ...rest
}: StatPillProps) {
  const s = sizeClasses[size];
  return (
    <div
      className={[
        "flex flex-col gap-1",
        align === "center" ? "items-center text-center" : "items-start text-left",
        className,
      ].join(" ")}
      {...rest}
    >
      <span className={["font-condensed font-bold leading-none tabular-nums", s.value, accent ? "text-gold-600" : "text-maroon-700"].join(" ")}>
        {value}
      </span>
      <span className={["font-condensed font-semibold tracking-eyebrow uppercase text-ink-500", s.label].join(" ")}>{label}</span>
      {sublabel && <span className="font-sans text-2xs text-ink-400">{sublabel}</span>}
    </div>
  );
}
