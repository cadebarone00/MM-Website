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

  return <div className="mx-auto max-w-[900px] px-4 pb-16 pt-4 sm:px-7">{children}</div>;
}
