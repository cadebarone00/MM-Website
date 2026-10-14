"use client";

import { useId } from "react";
import { HANDWRITING_SECTIONS, INTRO_OUTLINE, STANDALONE_OUTLINE, OUTLINE_WEIGHT } from "./geometry";

type Props = {
  variant?: "standalone" | "icon" | "intro";
  progress?: number;
  /** 0–1 sweep position; omitted means the clean white/maroon mark. */
  shimmer?: number;
  color?: string;
  className?: string;
};

/** Approved silhouette with a subtle weight increase. The loop has its own narrow reveal. */
export function MaroonMark({ variant = "standalone", progress = 1, shimmer, color = "currentColor", className }: Props) {
  const id = useId().replace(/:/g, "");
  const amount = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 1;
  const viewBox = variant === "intro" ? "0 0 393 852" : variant === "icon" ? "0 0 320 320" : "60 -20 290 240";
  const transform = variant === "intro" ? "translate(-.5 341.5)" : variant === "icon" ? "translate(-135.513 -99.5) scale(1.5012723 1.5)" : undefined;
  const gold = shimmer !== undefined && Number.isFinite(shimmer) && shimmer > 0 && shimmer < 1;
  const sweep = -100 + 650 * (shimmer ?? 0);
  const gradient = `url(#${id}-gold)`;
  const shape = (path: string, key: number, mask?: string) => <g key={key} mask={mask}>
    <path d={path} fill={color} stroke={color} />
    {gold && <path d={path} fill={gradient} stroke={gradient} />}
  </g>;
  return (
    <svg viewBox={viewBox} className={className} role="img" aria-label="The Maroon" style={{ display: "block", width: "100%", height: "100%" }}>
      <defs>
        {gold && <linearGradient id={`${id}-gold`} gradientUnits="userSpaceOnUse" x1={sweep - 60} y1="0" x2={sweep + 60} y2="0">
          <stop offset="0" stopColor="#C7A45D" stopOpacity="0" />
          <stop offset=".35" stopColor="#C7A45D" stopOpacity=".75" />
          <stop offset=".5" stopColor="#FFE6A3" />
          <stop offset=".65" stopColor="#C7A45D" stopOpacity=".75" />
          <stop offset="1" stopColor="#C7A45D" stopOpacity="0" />
        </linearGradient>}
        {variant !== "standalone" && amount < 1 && HANDWRITING_SECTIONS.map((section, index) => {
          const local = Math.min(1, Math.max(0, (amount - section.start) / (section.end - section.start)));
          return <mask key={index} id={`${id}-${index}`} maskUnits="userSpaceOnUse" x="-30" y="-30" width="480" height="290">
            <path d={section.guide} fill="none" stroke="white" strokeWidth={section.width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${section.length} ${section.length}`} strokeDashoffset={section.length * (1 - local)} opacity={local > 0 ? 1 : 0} />
          </mask>;
        })}
      </defs>
      <g transform={transform} strokeWidth={OUTLINE_WEIGHT} strokeLinejoin="round">
        {variant === "standalone" ? shape(STANDALONE_OUTLINE, 0) : amount >= 1 ? shape(INTRO_OUTLINE, 0) : HANDWRITING_SECTIONS.map((section, index) => shape(section.outline, index, `url(#${id}-${index})`))}
      </g>
    </svg>
  );
}
