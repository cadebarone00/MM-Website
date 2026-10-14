"use client";

import { useId } from "react";
import { HANDWRITING_SECTIONS, INTRO_OUTLINE, STANDALONE_OUTLINE, OUTLINE_WEIGHT } from "./geometry";

type Props = {
  variant?: "standalone" | "icon" | "intro";
  progress?: number;
  color?: string;
  className?: string;
};

/** Approved silhouette with a subtle weight increase. The loop has its own narrow reveal. */
export function MaroonMark({ variant = "standalone", progress = 1, color = "currentColor", className }: Props) {
  const id = useId().replace(/:/g, "");
  const amount = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 1;
  const viewBox = variant === "intro" ? "0 0 393 852" : variant === "icon" ? "0 0 320 320" : "60 -20 290 240";
  const transform = variant === "intro" ? "translate(-.5 341.5)" : variant === "icon" ? "translate(-135.513 -99.5) scale(1.5012723 1.5)" : undefined;
  return (
    <svg viewBox={viewBox} className={className} role="img" aria-label="The Maroon" style={{ display: "block", width: "100%", height: "100%" }}>
      <g transform={transform} fill={color} stroke={color} strokeWidth={OUTLINE_WEIGHT} strokeLinejoin="round">
        {variant === "standalone" ? <path d={STANDALONE_OUTLINE} /> : amount >= 1 ? <path d={INTRO_OUTLINE} /> : (
          <>
            <defs>
              {HANDWRITING_SECTIONS.map((section, index) => {
                const local = Math.min(1, Math.max(0, (amount - section.start) / (section.end - section.start)));
                return <mask key={index} id={`${id}-${index}`} maskUnits="userSpaceOnUse" x="-30" y="-30" width="480" height="290">
                  <path d={section.guide} fill="none" stroke="white" strokeWidth={section.width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${section.length} ${section.length}`} strokeDashoffset={section.length * (1 - local)} opacity={local > 0 ? 1 : 0} />
                </mask>;
              })}
            </defs>
            {HANDWRITING_SECTIONS.map((section, index) => <path key={index} d={section.outline} mask={`url(#${id}-${index})`} />)}
          </>
        )}
      </g>
    </svg>
  );
}
