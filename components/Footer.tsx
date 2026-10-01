import Image from "next/image";
import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { SPONSORS } from "@/lib/data/sponsors";
import { ChevronUp } from "lucide-react";
import type { NextTournamentOverride } from "@/lib/data/types";

// Pages that don't exist yet point at "#" until they're built.
const footerLinks = [
  [
    { label: "About The Maroon", href: "/" },
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

export function Footer({ nextTournamentOverride, showSponsors = false }: { nextTournamentOverride: NextTournamentOverride; showSponsors?: boolean }) {
  return (
    <footer className="relative hidden overflow-hidden lg:block">
      {showSponsors && <>
      <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-[3%] top-6 z-10 w-[29%]">
        <Image src="/assets/footer-maroon-jacket.webp" alt="" fill sizes="29vw" className="object-cover object-top" />
      </div>
      <div className="bg-white">
        <div className="ml-[35%] mr-[10%] flex min-h-60 items-center gap-8 py-12">
          <h2 className="shrink-0 font-serif text-3xl leading-tight text-maroon-700 xl:text-4xl">
            Thank You to<br />our sponsors
          </h2>
          <div className="grid min-w-0 flex-1 grid-cols-2 items-center gap-6 xl:gap-10">
            {SPONSORS.map((sponsor) => (
              <Image key={sponsor.logoSrc} src={sponsor.logoSrc} alt={sponsor.name} width={sponsor.logoWidth} height={sponsor.logoHeight} sizes="18vw" className="h-auto w-full" />
            ))}
          </div>
        </div>
      </div>

      </>}

      <div className="bg-maroon-900 text-white">
        <div className="ml-[35%] mr-[10%] pb-10">
          <div className="border-b border-white/50 py-10">
            <Wordmark className="text-5xl text-cream-50" />
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-6 pt-9 xl:grid-cols-4">
            {footerLinks.map((column, index) => (
              <ul key={index} className="space-y-3">
                {column.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="font-sans text-base text-maroon-100 hover:text-white hover:underline">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
          </nav>

          <div className="mt-10 flex items-center justify-between gap-6">
            <span className="font-sans text-sm text-maroon-100">
              © {new Date().getFullYear()} The Maroon · Next up {nextTournamentOverride.dateLabel}
            </span>
            <a
              href="#"
              className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full bg-maroon-800 text-white hover:bg-maroon-700"
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
