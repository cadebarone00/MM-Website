"use client";

import { useId } from "react";
import { HANDWRITING_SECTIONS, INTRO_OUTLINE, STANDALONE_OUTLINE } from "./geometry";

type Props = {
  variant?: "standalone" | "icon" | "intro";
  progress?: number;
  color?: string;
  className?: string;
};

/** The approved silhouette is unchanged. Independent stroke pieces keep crossings in handwriting order. */
export function MaroonMark({ variant = "standalone", progress = 1, color = "currentColor", className }: Props) {
  const id = useId().replace(/:/g, "");
  const amount = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 1;
  const viewBox = variant === "intro" ? "0 0 393 852" : variant === "icon" ? "0 0 320 320" : "60 -20 290 240";
  const transform = variant === "intro" ? "translate(-.5 341.5)" : variant === "icon" ? "translate(-135.513 -99.5) scale(1.5012723 1.5)" : undefined;
  return (
    <svg viewBox={viewBox} className={className} role="img" aria-label="The Maroon" style={{ display: "block", width: "100%", height: "100%" }}>
      <g transform={transform} fill={color}>
        {variant === "standalone" ? <path d={STANDALONE_OUTLINE} /> : amount >= 1 ? <path d={INTRO_OUTLINE} /> : (
          <>
            <defs>
              {HANDWRITING_SECTIONS.map((section, index) => {
                const local = Math.min(1, Math.max(0, (amount - section.start) / (section.end - section.start)));
                return <mask key={index} id={`${id}-${index}`} maskUnits="userSpaceOnUse" x="-30" y="-30" width="480" height="290">
                  <path d={section.guide} fill="none" stroke="white" strokeWidth="42" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1 1" strokeDashoffset={1 - local} opacity={local > 0 ? 1 : 0} />
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
