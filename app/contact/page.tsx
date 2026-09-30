import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ContactForm } from "@/components/maroon/ContactForm";
import { X } from "lucide-react";

export const metadata: Metadata = { title: "Contact Us | The Maroon" };

export default function ContactPage() {
  return <main className="relative grid min-h-[calc(100svh-80px)] bg-white lg:grid-cols-[minmax(360px,34%)_1fr]">
    <section aria-labelledby="contact-title" className="px-6 py-14 sm:px-12 lg:px-10 lg:py-16 xl:px-16">
      <h1 id="contact-title" className="font-title text-4xl font-normal uppercase tracking-wide text-maroon-900 sm:text-5xl">Get in touch</h1>
      <ContactForm />
    </section>
    <section aria-labelledby="contact-details" className="relative min-h-[480px] overflow-hidden bg-maroon-900 px-6 py-14 text-white sm:px-12 lg:px-16 lg:py-16">
      <Image src="/schedule/mission-hills.webp" alt="" fill priority sizes="(min-width: 1024px) 66vw, 100vw" className="object-cover" />
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative max-w-lg">
        <h2 id="contact-details" className="font-title text-2xl font-normal uppercase tracking-wide sm:text-3xl">Contact details</h2>
        <div className="mt-12 space-y-5 font-condensed text-sm uppercase leading-relaxed">
          <p className="text-lg font-semibold">The Maroon</p>
          <div className="space-y-1"><p>Cade Barone</p><a href="mailto:cadebarone00@gmail.com" className="block break-all hover:underline">cadebarone00@gmail.com</a><a href="tel:+12106652779" className="block hover:underline">210.665.2779</a></div>
          <p className="max-w-xs normal-case text-white/80">Questions about The Maroon, planning your tournament, or working with us? We look forward to hearing from you.</p>
        </div>
        <a href="https://www.instagram.com/themaroonmasters/" target="_blank" rel="noopener noreferrer" aria-label="The Maroon on Instagram" className="mt-10 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-maroon-900 transition-colors hover:bg-cream-100"><span className="font-sans text-sm font-bold">IG</span></a>
      </div>
    </section>
    <Link href="/" aria-label="Close contact page and return to Main Page" className="absolute right-4 top-4 z-10 rounded-full bg-maroon-900/90 p-2 text-white hover:bg-maroon-700 sm:right-6 sm:top-6"><X size={26} strokeWidth={1.5} /></Link>
  </main>;
}
