"use client";

import type { ReactNode } from "react";
import { useAccountSession } from "@/lib/useAccountSession";
import { accountKey } from "@/lib/wagers/wallet";
import { SignInGate } from "@/components/wagers/SignInGate";
import { WagersModeProvider } from "@/components/wagers/WagersModeContext";
import { WagersEntrySplash } from "@/components/wagers/WagersEntrySplash";
import { WagersNavBar } from "@/components/wagers/WagersNavBar";

export default function WagersLayout({ children }: { children: ReactNode }) {
  const session = useAccountSession();

  if (accountKey(session) == null) {
    return (
      <div className="mx-auto max-w-[900px] px-4 pb-16 pt-8 sm:px-7">
        <SignInGate />
      </div>
    );
  }

  return (
    <WagersModeProvider>
      <WagersEntrySplash>
        <WagersNavBar />
        <div className="mx-auto max-w-[900px] pb-16">{children}</div>
      </WagersEntrySplash>
    </WagersModeProvider>
  );
}
