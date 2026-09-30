import type { ReactNode } from "react";
import Image from "next/image";

export function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="grid min-h-0 flex-1 overflow-hidden bg-maroon-900 text-white lg:min-h-[calc(100svh-80px)] lg:grid-cols-[42%_1fr]">
    <section aria-label="Your account" className="flex min-h-0 items-start justify-center overflow-y-auto px-4 py-5 lg:justify-end lg:px-10 lg:py-12">
      <div className="my-auto w-full max-w-[336px] shrink-0 rounded-none border border-gold-400 p-6">
        {children}
      </div>
    </section>
    <div className="relative hidden bg-maroon-900 lg:block">
      <Image src="/schedule/mission-hills.webp" alt="Palm-lined fairways at Mission Hills" fill priority sizes="58vw" className="object-cover" />
    </div>
  </main>;
}
