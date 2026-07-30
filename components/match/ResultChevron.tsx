import type { ReactNode } from "react";
import type { Team } from "@/lib/data/types";

const MAROON_700 = "#500001";
const GOLD_500 = "#b8945a";

const LEFT_POINTS = "0,22 30,0 100,0 100,44 30,44";
const RIGHT_POINTS = "100,22 70,0 0,0 0,44 70,44";

export type ResultChevronSize = "sm" | "md" | "lg";

const TIE_SIZE_CLASSES: Record<ResultChevronSize, string> = {
  sm: "h-[22px] w-[40px] text-2xs",
  md: "h-[34px] w-[58px] text-sm",
  lg: "h-[48px] w-[86px] text-lg",
};

const CHEVRON_SIZE_CLASSES: Record<ResultChevronSize, string> = {
  sm: "h-[22px] w-[44px] text-2xs",
  md: "h-[34px] w-[62px] text-sm",
  lg: "h-[48px] w-[92px] text-lg",
};

export function ResultChevron({
  winner,
  children,
  size = "md",
  className,
}: {
  winner: Team | "tie";
  children: ReactNode;
  size?: ResultChevronSize;
  className?: string;
}) {
  if (winner === "tie") {
    return (
      <span
        className={[
          "inline-flex items-center justify-center border-2 border-ink-900 px-2 font-condensed font-extrabold uppercase tracking-wide text-ink-900",
          TIE_SIZE_CLASSES[size],
          className ?? "",
        ].join(" ")}
      >
        {children}
      </span>
    );
  }

  const isMaroon = winner === "maroon";

  return (
    <span
      className={[
        "relative inline-flex items-center justify-center font-condensed font-extrabold uppercase tracking-wide drop-shadow-md",
        CHEVRON_SIZE_CLASSES[size],
        isMaroon ? "text-white" : "text-maroon-700",
        className ?? "",
      ].join(" ")}
    >
      <svg viewBox="0 0 100 44" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <polygon
          points={isMaroon ? LEFT_POINTS : RIGHT_POINTS}
          fill={isMaroon ? MAROON_700 : "#ffffff"}
          stroke={GOLD_500}
          strokeWidth={3}
        />
      </svg>
      <span className={["relative z-10", isMaroon ? "pl-2 pr-1" : "pl-1 pr-2"].join(" ")}>{children}</span>
    </span>
  );
}
