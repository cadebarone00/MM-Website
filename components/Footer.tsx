import Image from "next/image";
import Link from "next/link";
import { ChevronUp } from "lucide-react";
import type { NextTournamentOverride } from "@/lib/data/types";

// Pages that don't exist yet point at "#" until they're built.
const footerLinks = [
  [
    { label: "About The Maroon", href: "/the-maroon" },
    { label: "About the Course", href: "/the-maroon/courses" },
    { label: "Attendance Info", href: "/schedule" },
  ],
  [
    { label: "Sponsorship Information", href: "/sponsorship" },
    { label: "Shop", href: "/merchandise" },
    { label: "Search", href: "#" },
  ],
  [
    { label: "Feedback", href: "#" },
    { label: "Privacy Statement", href: "#" },
    { label: "Terms Of Use", href: "#" },
  ],
  [{ label: "Community Impact", href: "#" }],
];

export function Footer({ nextTournamentOverride }: { nextTournamentOverride: NextTournamentOverride }) {
  return (
    <footer className="hidden lg:block">
      <div className="bg-white">
        <div className="max-w-(--container-mm-lg) mx-auto px-7 py-24">
          <p className="font-sans text-sm font-semibold uppercase text-gold-600">Stay up to date on the latest news</p>
          <h2 className="mt-4 font-serif text-4xl font-semibold text-maroon-700">Sign Up For The Maroon Masters Newsletter</h2>
          <Link
            href="/signup"
            className="mt-10 inline-flex h-12 w-86 items-center justify-center rounded-full border border-maroon-700 font-sans text-sm text-maroon-700 transition-colors hover:bg-maroon-700 hover:text-white"
          >
            Sign Up
          </Link>
        </div>
      </div>

      <div className="bg-maroon-700 text-white">
        <div className="max-w-(--container-mm-lg) mx-auto px-7 pb-12">
          <div
            aria-hidden
            className="h-4 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.35)_0_1px,transparent_1px_4px)]"
          />

          <div className="border-b border-white/30 py-11">
            <Image src="/assets/wordmark-light.svg" alt="The Maroon Masters" width={520} height={92} className="h-14 w-auto" />
          </div>

          <nav aria-label="Footer" className="grid grid-cols-4 gap-x-8 pt-14">
            {footerLinks.map((column, index) => (
              <ul key={index} className="space-y-3">
                {column.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="font-sans text-lg text-maroon-100 hover:text-white hover:underline">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
          </nav>

          <div className="mt-14 flex items-center justify-between">
            <span className="font-sans text-sm text-maroon-100">
              © {new Date().getFullYear()} The Maroon Masters · Next up {nextTournamentOverride.dateLabel}
            </span>
            <a
              href="#"
              className="flex h-16 w-16 flex-col items-center justify-center rounded-full bg-maroon-900 text-white hover:bg-maroon-800"
            >
              <ChevronUp size={26} strokeWidth={1.5} />
              <span className="font-sans text-[8px] font-semibold uppercase">Back to top</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
