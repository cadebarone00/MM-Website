"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { SPONSORS } from "@/lib/data/sponsors";

const SHOW_MS = 15_000;
const FADE_MS = 500;

/**
 * "Presented By:" + one sponsor logo, fading to the next sponsor every 15
 * seconds. With a single sponsor it just stays put.
 */
export function SponsorRotator({ variant }: { variant: "desktop" | "mobile" }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (SPONSORS.length < 2) return;
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setInterval(() => {
      setVisible(false);
      fadeTimer = setTimeout(() => {
        setIndex((i) => (i + 1) % SPONSORS.length);
        setVisible(true);
      }, FADE_MS);
    }, SHOW_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(fadeTimer);
    };
  }, []);

  const sponsor = SPONSORS[index];
  if (!sponsor) return null;

  const logo = (
    <Image
      src={sponsor.logoSrc}
      alt={sponsor.name}
      width={sponsor.logoWidth}
      height={sponsor.logoHeight}
      className={[
        "w-auto transition-opacity ease-in-out",
        variant === "desktop" ? "h-7" : "h-5",
        visible ? "opacity-100" : "opacity-0",
      ].join(" ")}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    />
  );

  if (variant === "mobile") {
    return (
      <div className="flex min-w-0 flex-col items-start leading-none">
        <span className="font-condensed text-[7px] font-semibold uppercase tracking-wide text-maroon-700">Presented By:</span>
        {logo}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="whitespace-nowrap font-condensed text-[11px] font-semibold uppercase tracking-eyebrow text-white/70">Presented By:</span>
      {/* White tile so the logo's white background reads as intentional on the maroon bar. */}
      <div className="rounded-md bg-white px-2 py-1">{logo}</div>
    </div>
  );
}
