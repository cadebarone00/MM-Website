"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/**
 * Shown in place of Wagers content for a signed-out visitor — both the
 * full /wagers page gate and the bet slip's signed-out state. Points at
 * /login (accounts-foundation's real sign-in page, live since that
 * project shipped) rather than /portal.
 * Uses a Button + router.push rather than wrapping Button in a Link:
 * Button renders a <button>, and nesting a <button> inside the <a> a Link
 * renders is invalid HTML.
 */
export function SignInGate() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-[420px] px-4 py-12 text-center">
      <h2 className="m-0 font-serif text-2xl font-bold text-ink-900">Sign in to place a wager</h2>
      <p className="mt-2 font-sans text-sm text-ink-500">Wagers use your own account — your balance and history follow you anywhere you sign in.</p>
      <p className="mt-1 font-sans text-2xs text-ink-400">Play money only — no real currency changes hands here.</p>
      <Button className="mt-5" onClick={() => router.push("/login")}>
        Sign In
      </Button>
    </div>
  );
}
