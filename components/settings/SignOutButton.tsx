"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { SignOutConfirmDialog } from "@/components/SignOutConfirmDialog";

/** Settings → Sign Out: opens the same "Are you sure?" popup as the account menu, which signs out THIS device and goes
 *  home (other devices stay signed in; Settings → Account → Devices signs them out). */
export function SignOutButton() {
  const [confirming, setConfirming] = useState(false);
  return <>
    <button type="button" onClick={() => setConfirming(true)}
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-pill border border-red-600 px-4 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-red-700 hover:bg-red-50">
      <LogOut size={18} aria-hidden="true" />Sign Out
    </button>
    {confirming && <SignOutConfirmDialog onClose={() => setConfirming(false)} />}
  </>;
}
