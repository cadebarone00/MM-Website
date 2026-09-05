"use client";

import { useEffect, useState } from "react";

function isActive(text: string | null, expiresAt: string | null): boolean {
  return Boolean(text && expiresAt && new Date(expiresAt).getTime() > Date.now());
}

/** A single host-triggered "moment" banner over whatever scene is active (spec §18) — never blocks the scene underneath, always self-dismisses. */
export function OverlayLayer({ text, expiresAt }: { text: string | null; expiresAt: string | null }) {
  const [visible, setVisible] = useState(() => isActive(text, expiresAt));

  useEffect(() => {
    // Intentional: syncs local visibility to a prop that can change while
    // mounted (a new announcement replacing/clearing the old one), same
    // pattern/justification as components/portal/ScoringPanel.tsx's own
    // fetch-on-mount effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(isActive(text, expiresAt));
    if (!text || !expiresAt) return;
    const msLeft = new Date(expiresAt).getTime() - Date.now();
    if (msLeft <= 0) return;
    const id = setTimeout(() => setVisible(false), msLeft);
    return () => clearTimeout(id);
  }, [text, expiresAt]);

  if (!visible || !text) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-6 pb-8 sm:pb-12">
      <div className="max-w-3xl border-t border-[color:var(--color-gold-400)]/40 bg-[color:var(--color-maroon-900)]/90 px-6 py-3 text-center font-serif text-xl font-semibold text-[color:var(--color-cream-50)] shadow-xl backdrop-blur-sm sm:text-2xl">
        {text}
      </div>
    </div>
  );
}
