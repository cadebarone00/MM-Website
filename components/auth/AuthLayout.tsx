import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

export function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="grid min-h-[calc(100svh-80px)] bg-white lg:grid-cols-[minmax(400px,42%)_1fr]">
    <section aria-label="Your account" className="flex items-center justify-center px-6 py-12 sm:px-12 sm:py-16">
      <div className="w-full max-w-[360px]">
        <Link href="/" className="mb-10 inline-block font-title text-4xl font-bold tracking-tight text-maroon-900 sm:mb-12">The Maroon</Link>
        {children}
      </div>
    </section>
    <div className="relative min-h-[280px] bg-maroon-900 sm:min-h-[380px] lg:min-h-full">
      <Image src="/schedule/mission-hills.webp" alt="Palm-lined fairways at Mission Hills" fill priority sizes="(min-width: 1024px) 58vw, 100vw" className="object-cover" />
    </div>
  </main>;
}
