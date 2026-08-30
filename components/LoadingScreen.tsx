import Image from "next/image";
import type { ReactNode } from "react";

/**
 * Full-screen background used by every full-takeover screen: the plain
 * "site is loading" splash (fans / signed-out visitors), the post-login
 * fork screen (`/account/choose`), and the Scoring status screen
 * (`/portal/scoring`). `heading` is the big title line (was hardcoded
 * "The Maroon Masters" — now each caller supplies its own so this shell can
 * be reused for different titles). `topSlot` is a separate, optional small
 * line pinned near the top of the screen (e.g. a "Welcome, {name}"
 * greeting), independent of the centered/raised heading block below it.
 *
 * Purely presentational — it doesn't decide when to show or hide itself;
 * callers own that.
 */
export function LoadingScreen({
  heading,
  raised = false,
  topSlot,
  children,
}: {
  heading: ReactNode;
  raised?: boolean;
  topSlot?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[200] overflow-hidden">
      <Image
        src="/loading/mobile.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover lg:hidden"
      />
      <Image
        src="/loading/desktop.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="hidden object-cover lg:block"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-maroon-900/70 via-maroon-900/30 to-maroon-900/70" />

      {topSlot && (
        <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+2rem)] px-6 text-center font-sans text-sm font-medium text-cream-50/90">
          {topSlot}
        </div>
      )}

      <div
        className={`relative flex h-full flex-col items-center gap-6 px-6 text-center ${
          raised
            ? "justify-start pt-[22vh] lg:pt-[18vh]"
            : "justify-center -translate-y-[3vh] lg:translate-y-0"
        }`}
      >
        <h1 className="font-serif text-4xl font-bold uppercase tracking-eyebrow text-cream-50 drop-shadow-lg sm:text-5xl">
          {heading}
        </h1>
        {children}
      </div>
    </div>
  );
}
