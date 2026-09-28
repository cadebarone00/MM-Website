"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { signOutAccount } from "@/lib/useAccountSession";

/** "Are you sure?" popup shown before every sign-out. Cancel is the default focus so signing out is never one stray tap away. */
export function SignOutConfirmDialog({ onClose }: { onClose: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { cancelRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    try {
      await signOutAccount();
    } catch {
      setSigningOut(false);
      setError("Couldn't sign out. Please try again.");
    }
  }

  // Portaled to the page root so no ancestor's stacking context can put the site header on top of it.
  return createPortal(
    <div onClick={onClose} className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="sign-out-title" onClick={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-md bg-white p-5 text-ink-900 shadow-xl">
        <h2 id="sign-out-title" className="font-serif text-xl font-bold">Are you sure?</h2>
        <p className="mt-2 font-sans text-sm text-ink-600">Any unsaved data will not be stored.</p>
        {error && <p role="alert" className="mt-3 font-sans text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex gap-3">
          <button ref={cancelRef} type="button" onClick={onClose} className="flex-1 rounded-pill border border-ink-300 px-4 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-ink-900 hover:bg-cream-50">
            Cancel
          </button>
          <button type="button" onClick={() => void handleSignOut()} disabled={signingOut} className="flex-1 rounded-pill bg-red-600 px-4 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-white hover:bg-red-700 disabled:opacity-60">
            {signingOut ? "Signing Out…" : "Sign Out"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
