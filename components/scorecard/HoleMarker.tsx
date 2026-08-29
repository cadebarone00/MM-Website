import type { ReactNode } from "react";
import { holeMarker, type HoleMarker as HoleMarkerType } from "@/lib/data";

const SHAPE: Record<HoleMarkerType, { outline: "circle" | "square" | "none"; rings: number }> = {
  eagle: { outline: "circle", rings: 2 },
  birdie: { outline: "circle", rings: 1 },
  par: { outline: "none", rings: 0 },
  bogey: { outline: "square", rings: 1 },
  "double-or-worse": { outline: "square", rings: 2 },
};

export const MARKER_LABELS: Record<HoleMarkerType, string> = {
  eagle: "Eagle",
  birdie: "Birdie",
  par: "Par",
  bogey: "Bogey",
  "double-or-worse": "Double Bogey+",
};

export function HoleMarkerShape({ marker, size = 34, children }: { marker: HoleMarkerType; size?: number; children?: ReactNode }) {
  const cfg = SHAPE[marker];
  const borderWidth = Math.max(1.5, Math.round(size * 0.05 * 10) / 10);
  const inset = Math.max(3, Math.round(size * 0.1));
  const shapeClass = cfg.outline === "circle" ? "rounded-full" : "rounded-none";

  return (
    <span className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      {cfg.outline !== "none" && (
        <>
          <span className={["absolute inset-0 border-maroon-700", shapeClass].join(" ")} style={{ borderWidth }} />
          {cfg.rings === 2 && <span className={["absolute border-maroon-700", shapeClass].join(" ")} style={{ borderWidth, inset }} />}
        </>
      )}
      <span className="relative z-10 font-score font-bold text-sm text-maroon-700 tabular-nums leading-none">{children}</span>
    </span>
  );
}

export function HoleMarkerForDiff({ diff, size, children }: { diff: number; size?: number; children?: ReactNode }) {
  return (
    <HoleMarkerShape marker={holeMarker(diff)} size={size}>
      {children}
    </HoleMarkerShape>
  );
}
