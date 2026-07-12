import { InputHTMLAttributes, ReactNode } from "react";

type Size = "sm" | "md" | "lg";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "size"> {
  label?: string | null;
  hint?: string | null;
  error?: string | null;
  iconLeft?: ReactNode;
  size?: Size;
  className?: string;
  wrapClassName?: string;
}

const sizeClasses: Record<Size, { pad: string; font: string; minH: string }> = {
  sm: { pad: "px-[10px] py-[7px]", font: "text-sm", minH: "min-h-[34px]" },
  md: { pad: "px-3 py-[10px]", font: "text-md", minH: "min-h-[42px]" },
  lg: { pad: "px-[14px] py-[13px]", font: "text-lg", minH: "min-h-[50px]" },
};

export function Input({
  label = null,
  hint = null,
  error = null,
  iconLeft = null,
  size = "md",
  id,
  className = "",
  wrapClassName = "",
  ...rest
}: InputProps) {
  const inputId = id || (label ? `mm-in-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  const s = sizeClasses[size];
  const invalid = Boolean(error);

  return (
    <div className={["flex flex-col gap-[6px]", wrapClassName].join(" ")}>
      {label && (
        <label htmlFor={inputId} className="font-condensed text-2xs font-semibold tracking-eyebrow uppercase text-ink-500">
          {label}
        </label>
      )}
      <div
        className={[
          "flex items-center gap-2 bg-white border rounded-sm transition-[border-color,box-shadow] duration-200",
          "focus-within:border-maroon-400 focus-within:shadow-[0_0_0_3px_rgba(168,82,88,0.45)]",
          s.minH,
          s.pad,
          invalid ? "border-score-under" : "border-ink-300",
        ].join(" ")}
      >
        {iconLeft && <span className="text-ink-400 inline-flex shrink-0">{iconLeft}</span>}
        <input
          id={inputId}
          aria-invalid={invalid || undefined}
          className={["flex-1 min-w-0 border-none outline-none bg-transparent font-sans text-ink-900", s.font, className].join(" ")}
          {...rest}
        />
      </div>
      {(hint || error) && <span className={["font-sans text-2xs", invalid ? "text-score-under" : "text-ink-400"].join(" ")}>{error || hint}</span>}
    </div>
  );
}
