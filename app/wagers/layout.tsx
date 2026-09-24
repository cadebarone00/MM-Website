"use client";

import type { ReactNode } from "react";
import { WagersModeProvider } from "@/components/wagers/WagersModeContext";
import { WagersEntrySplash } from "@/components/wagers/WagersEntrySplash";
import { WagersNavBar } from "@/components/wagers/WagersNavBar";

export default function WagersLayout({ children }: { children: ReactNode }) {
  return (
    <WagersModeProvider>
      <WagersEntrySplash>
        <WagersNavBar />
        <div className="mx-auto max-w-[900px] pb-16">{children}</div>
      </WagersEntrySplash>
    </WagersModeProvider>
  );
}
