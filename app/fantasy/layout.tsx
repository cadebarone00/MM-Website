"use client";

import type { ReactNode } from "react";
import { useAccountSession } from "@/lib/useAccountSession";
import { FantasySignInGate } from "@/components/fantasy/FantasySignInGate";

export default function FantasyLayout({ children }: { children: ReactNode }) {
  const session = useAccountSession();

  if (session == null) {
    return (
      <div className="mx-auto max-w-[900px] px-4 pb-16 pt-8 sm:px-7">
        <FantasySignInGate />
      </div>
    );
  }

  // Signed-in: no padded wrapper here — FantasyShell (rendered by the page
  // itself) owns the full-bleed fixed mobile layout and the centered
  // desktop column.
  return <>{children}</>;
}
