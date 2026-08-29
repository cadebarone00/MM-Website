import Image from "next/image";
import type { ReactNode } from "react";

/**
 * Full-screen background used by both loading screens: the plain "site is
 * loading" splash (fans / signed-out visitors) and the post-login fork
 * screen (`/account/choose`), which passes `raised` + `children` to add the
 * Portal/Website links below the title.
 *
 * Purely presentational — it doesn't decide when to show or hide itself;
 * callers own that.
 */
export function LoadingScreen({
  raised = false,
  children,
}: {
  raised?: boolean;
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
      <div
        className={`relative flex h-full flex-col items-center gap-6 px-6 text-center ${
          raised ? "justify-start pt-[18vh] sm:pt-[20vh]" : "justify-center"
        }`}
      >
        <h1 className="font-serif text-4xl font-bold uppercase tracking-eyebrow text-cream-50 drop-shadow-lg sm:text-5xl">
          The Maroon Masters
        </h1>
        {children}
      </div>
    </div>
  );
}
