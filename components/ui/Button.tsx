import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "gold" | "inverse" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  className?: string;
}

const sizeClasses: Record<Size, string> = {
  sm: "px-[14px] py-[7px] text-xs gap-[6px] min-h-[34px]",
  md: "px-5 py-[10px] text-sm gap-2 min-h-[42px]",
  lg: "px-7 py-[14px] text-md gap-[10px] min-h-[52px]",
};

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-maroon-700 text-cream-50 border border-maroon-700 hover:bg-maroon-600 hover:border-maroon-600 active:bg-maroon-800 active:scale-[0.98]",
  secondary:
    "bg-white text-maroon-700 border border-ink-300 hover:bg-maroon-50 hover:border-maroon-400 active:scale-[0.98]",
  ghost:
    "bg-transparent text-maroon-700 border border-transparent hover:bg-maroon-50 active:scale-[0.98]",
  gold:
    "bg-gradient-trophy text-maroon-900 border border-gold-600 hover:brightness-[1.05] active:brightness-[0.97] active:scale-[0.98]",
  inverse:
    "bg-cream-50 text-maroon-800 border border-cream-50 hover:bg-white active:scale-[0.98]",
  danger:
    "bg-score-under text-white border border-score-under hover:brightness-[1.06] active:scale-[0.98]",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  iconLeft = null,
  iconRight = null,
  fullWidth = false,
  disabled = false,
  type = "button",
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center font-condensed font-semibold tracking-wide uppercase leading-none rounded-sm whitespace-nowrap cursor-pointer",
        "transition-[background,transform,box-shadow] duration-200",
        "focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(168,82,88,0.45)]",
        sizeClasses[size],
        variantClasses[variant],
        fullWidth ? "w-full" : "w-auto",
        disabled ? "opacity-45 cursor-not-allowed" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {iconLeft}
      {children}
      {iconRight}
    </button>
  );
}
