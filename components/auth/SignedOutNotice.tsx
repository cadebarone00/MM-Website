import Link from "next/link";

/** Shown (dev only, see lib/dev/signInWall.ts) where a page needs an account, instead of redirecting to sign in. */
export function SignedOutNotice({ what }: { what: string }) {
  return <section className="mx-auto max-w-md px-6 py-16 text-center">
    <p className="font-sans text-base text-ink-700">You&apos;re not signed in, so there&apos;s no {what} to show.</p>
    <Link href="/login" className="mt-4 inline-block font-title text-sm font-semibold uppercase tracking-widest text-maroon-700 underline underline-offset-4">Log in</Link>
  </section>;
}
