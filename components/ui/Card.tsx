import { HTMLAttributes, ReactNode } from "react";

type Variant = "default" | "flat" | "prestige" | "sunken" | "feature";
type Padding = "none" | "sm" | "md" | "lg";

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  children: ReactNode;
  variant?: Variant;
  interactive?: boolean;
  padding?: Padding;
  className?: string;
}

const paddingClasses: Record<Padding, string> = {
  none: "p-0",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

const variantClasses: Record<Variant, string> = {
  default: "bg-white border border-ink-100 text-ink-900 shadow-sm",
  flat: "bg-white border border-ink-200 text-ink-900 shadow-none",
  prestige: "bg-white border border-gold-400 text-ink-900 shadow-sm",
  sunken: "bg-cream-100 border border-ink-100 text-ink-900 shadow-none",
  feature: "bg-gradient-maroon border border-maroon-600 text-cream-50 shadow-md",
};

export function Card({
  children,
  variant = "default",
  interactive = false,
  padding = "md",
  className = "",
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        "rounded-lg transition-[box-shadow,border-color,transform] duration-200",
        interactive
          ? "cursor-pointer hover:shadow-lg hover:border-gold-400 hover:-translate-y-0.5"
          : "cursor-default",
        paddingClasses[padding],
        variantClasses[variant],
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
