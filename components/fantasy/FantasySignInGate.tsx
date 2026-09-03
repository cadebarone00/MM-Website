"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/**
 * Shown in place of Fantasy content for a signed-out visitor. Same shape as
 * Wagers' SignInGate (components/wagers/SignInGate.tsx) — a Button +
 * router.push rather than wrapping Button in a Link, since Button renders a
 * <button> and nesting one inside the <a> a Link renders is invalid HTML.
 */
export function FantasySignInGate() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-[420px] px-4 py-12 text-center">
      <h2 className="m-0 font-serif text-2xl font-bold text-ink-900">Sign in to play Fantasy</h2>
      <p className="mt-2 font-sans text-sm text-ink-500">Your fantasy team saves to your account, so it's already picked next time you sign in.</p>
      <Button className="mt-5" onClick={() => router.push("/login")}>
        Sign In
      </Button>
    </div>
  );
}
