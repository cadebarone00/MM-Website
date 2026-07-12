import type { ReactNode } from "react";
import type { Team } from "@/lib/data/types";

const MAROON_700 = "#500001";
const GOLD_500 = "#b8945a";

const LEFT_POINTS = "0,22 30,0 100,0 100,44 30,44";
const RIGHT_POINTS = "100,22 70,0 0,0 0,44 70,44";

export function ResultChevron({
  winner,
  children,
  className,
}: {
  winner: Team | "tie";
  children: ReactNode;
  className?: string;
}) {
  if (winner === "tie") {
    return (
      <span
        className={[
          "inline-flex h-[34px] w-[58px] items-center justify-center border-2 border-ink-900 px-2 font-condensed text-sm font-extrabold uppercase tracking-wide text-ink-900",
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
        "relative inline-flex h-[34px] w-[62px] items-center justify-center font-condensed text-sm font-extrabold uppercase tracking-wide drop-shadow-md",
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
