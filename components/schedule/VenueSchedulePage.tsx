"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { pastTournaments } from "@/lib/data";
import { CourseScorecardTable } from "./CourseScorecardTable";
import type { VenueCourse, VenueSchedule, VenueSession } from "@/lib/data/types";

function PastVenuesDropdown() {
  const years = [...pastTournaments].sort((a, b) => b.year - a.year);

  return (
    <div className="group relative z-30 inline-block">
      <button
        type="button"
        className="inline-flex min-h-[48px] items-center gap-2 rounded-sm border border-ink-300 bg-white px-5 font-condensed text-sm font-bold uppercase tracking-wide text-maroon-700 shadow-sm transition-colors hover:border-maroon-400 hover:bg-maroon-50"
      >
        Check Out Past Venues
        <ChevronDown size={16} />
      </button>
      <div className="invisible absolute right-0 top-full w-[180px] pt-2 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        <div className="overflow-hidden rounded-md border border-ink-100 bg-white shadow-lg">
          {years.map((t) => (
            <Link
              key={t.year}
              href={`/schedule/${t.slug}`}
              className="block border-b border-ink-100 px-4 py-3 text-left font-condensed text-xs font-semibold uppercase tracking-wide text-ink-700 transition-colors last:border-b-0 hover:bg-cream-50"
            >
              {t.year}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function SessionBox({ session, courseName }: { session: VenueSession; courseName: string | null }) {
  return (
    <div className="rounded-md border border-ink-200 bg-white px-3 py-4 text-center">
      <div className="font-condensed text-[10px] font-semibold uppercase tracking-wide text-maroon-600">Session {session.session}</div>
      <div className="mt-2 font-sans text-sm font-bold text-ink-900">{session.format ?? "TBD"}</div>
      <div className="mt-1 font-sans text-xs text-ink-500">{courseName ?? "Course TBD"}</div>
    </div>
  );
}

function PhotoSlot({ src, alt }: { src: string | null; alt: string }) {
  return (
    <div className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-md bg-ink-100">
      {src ? (
        <Image src={src} alt={alt} fill sizes="88px" className="object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center font-condensed text-[11px] uppercase tracking-wide text-ink-300">Photo</div>
      )}
    </div>
  );
}

function CourseBox({ course, expanded, onToggle, venueName }: { course: VenueCourse; expanded: boolean; onToggle: () => void; venueName?: string }) {
  const photos = [course.photos[0] ?? null, course.photos[1] ?? null, course.photos[2] ?? null];

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full rounded-lg border border-gold-400 bg-cream-50 p-5 text-left shadow-md transition-shadow hover:shadow-lg sm:p-6"
      >
        {/* Top row: course name + chevron */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {venueName && <div className="font-condensed text-[11px] font-semibold uppercase tracking-eyebrow text-gold-700">{venueName}</div>}
            <h3 className="m-0 font-sans text-xl font-extrabold text-ink-900 sm:text-2xl">{course.name}</h3>
          </div>
          <ChevronDown size={22} className={["mt-1 shrink-0 text-ink-400 transition-transform", expanded ? "rotate-180" : ""].join(" ")} />
        </div>
        {/* Bottom row: par/yards + photos */}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex shrink-0 gap-6">
            <div className="text-center">
              <div className="font-condensed text-2xl font-bold text-ink-900 sm:text-3xl">{course.par ?? "–"}</div>
              <div className="font-condensed text-[10px] uppercase tracking-wide text-ink-400">Par</div>
            </div>
            <div className="text-center">
              <div className="font-condensed text-2xl font-bold text-ink-900 sm:text-3xl">{course.yards ?? "–"}</div>
              <div className="font-condensed text-[10px] uppercase tracking-wide text-ink-400">Yards</div>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {photos.map((src, i) => (
              <PhotoSlot key={i} src={src} alt={i === 0 ? course.name : `${course.name} photo ${i + 1}`} />
            ))}
          </div>
        </div>
      </button>
      {expanded && (
        <div className="mt-3">
          <CourseScorecardTable course={course} />
        </div>
      )}
    </div>
  );
}

export function VenueSchedulePage({ venue }: { venue: VenueSchedule }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const courseName = (id: string | null) => venue.courses.find((c) => c.id === id)?.name ?? null;

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink-900 pb-4">
        <div>
          <div className="font-condensed text-[11px] font-bold uppercase tracking-eyebrow text-gold-700">Venue</div>
          <h1 className="m-0 font-sans text-3xl font-black text-ink-900">The {venue.year} Schedule & Venues</h1>
        </div>
        <PastVenuesDropdown />
      </div>

      {venue.sessions.length > 0 && (
        <section className="mb-9">
          <div className="mb-3 font-condensed text-[11px] font-semibold uppercase tracking-eyebrow text-maroon-600">Sessions 1–8</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {venue.sessions.map((s) => (
              <SessionBox key={s.session} session={s} courseName={courseName(s.courseId)} />
            ))}
          </div>
        </section>
      )}

      {venue.courses.length > 0 ? (
        <section className="space-y-5">
          {venue.courses.map((course) => (
            <CourseBox
              key={course.id}
              course={course}
              expanded={expandedId === course.id}
              onToggle={() => setExpandedId((id) => (id === course.id ? null : course.id))}
              venueName={venue.venueName}
            />
          ))}
        </section>
      ) : (
        <p className="font-sans text-sm text-ink-400 mt-4">Course details coming soon.</p>
      )}
    </div>
  );
}
