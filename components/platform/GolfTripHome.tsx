"use client";

import { Suspense, use, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, BedDouble, Bell, CalendarDays, Camera, Car, ChevronRight, Clock, CloudRain, Flag, MapPin, MessageCircle, Moon, Plane, Plus, Receipt, Settings, Sun, Thermometer, Trophy, User, Users, Wind, X, type LucideIcon } from "lucide-react";
import { golfTripDraftSnapshot, parseGolfTripDraft, type GolfTripDraft, plannedRounds, shortTripDate, tripDates } from "@/lib/platform/golfTripDraft";
import { normalizeCompetitor, type GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import type { TripWeather } from "@/lib/platform/weather/types";
import { flightCounts, flightTime, type FlightSummary } from "@/lib/platform/golfTripFlights";

/** The Info tab's Flights card: the viewer's flight summary, and the Flights page it opens (null = not a link). */
export interface TripFlights { summary: FlightSummary; href: string | null }
import { GolfCourseWeather, GolfTripLeaderboard } from "./GolfTripMatch";
import { GolfTripScoring } from "./GolfTripScoring";
import { GolfTripCompetitionMatchPreview } from "./GolfTripCompetitionMatchPreview";
import { GolfTripGames } from "./GolfTripGames";
import styles from "./GolfTripHome.module.css";

const TABS = ["Home", "Golf", "Venue", "Info"] as const;
type Tab = (typeof TABS)[number];
const GOLF_SLIDES = ["Overview", "Competition", "Games"] as const;

const TOURNAMENT_ANSWERS: Record<string, string> = { yes: "Yes, there's a tournament", no: "No tournament, just golf", undecided: "Not sure yet" };

/** The draft only changes on the questionnaire's Next, so there is nothing to listen for here. */
const subscribeNever = () => () => {};

/**
 * Golf Trip Home: trip name, a 4-tab selector, and (on Home) one card per part of the trip. Layout only:
 * cards show the questionnaire answers kept in this tab, or an empty state. Nothing is saved yet.
 * `preview` replaces those answers with fixed ones (the /dev/tournament design preview).
 * `settingsHref` is where the settings wheel goes (this trip's settings page).
 * `backHref` adds a small "← Golf Trips" link on desktop, where the bottom tabs (and their Golf Trips tab) are hidden.
 * `previewMatch` fills the Golf tab's Overview leaderboard with made-up data (/dev/tournament only); without it they are "Coming soon".
 * `weather` (saved trips only, still loading on the server) adds a Weather card after Travel that shows a loading line
 * until it settles, so the rest of the page never waits for it; without it there is no Weather card.
 * `flights` fills the Info tab's Flights card with the viewer's own flights; `href` (saved trips) makes it open the Flights page.
 */
export function GolfTripHome({ preview, settingsHref, backHref, previewMatch, weather, flights }:
  { preview?: GolfTripDraft; settingsHref: string; backHref?: string; previewMatch?: GolfMatchPreview; weather?: Promise<TripWeather>; flights?: TripFlights }) {
  const raw = useSyncExternalStore(subscribeNever, golfTripDraftSnapshot, () => "");
  const stored = useMemo(() => parseGolfTripDraft(raw), [raw]);
  const draft = preview ?? stored;
  const [tab, setTab] = useState<Tab>("Home");
  // Local mock scenario selector, available only when the dev preview supplies data.
  const [previewCompetition, setPreviewCompetition] = useState<boolean | null>(null);
  const competitive = (preview ? previewCompetition : null) ?? (draft.includesTournament === "yes");


  const dates = tripDates(draft.startDate, draft.endDate);
  const dateRange = dates.length > 0 ? `${shortTripDate(dates[0])} – ${shortTripDate(dates[dates.length - 1])}` : "";

  // Scoring starts from the preview's featured golfer (the organizer) so the sheet has a round in progress to show.
  const firstCompetitor = previewMatch?.matches[0]?.left ? normalizeCompetitor(previewMatch.matches[0].left) : undefined;
  const you = firstCompetitor?.golfers[0]?.name;
  const yourHoles = previewMatch?.leaderboard.find((row) => row.golfer.name === you)?.holes;

  return <main className={`${styles.page} ${styles.pageWithScoring} ${tab === "Golf" && preview && previewMatch ? styles.pageGolfPreview : ""}`}>
    {backHref && <Link href={backHref} className={styles.desktopBack}><ArrowLeft size={16} strokeWidth={2} aria-hidden />Golf Trips</Link>}
    <header className={styles.header}>
      {/* Look only for now: chat isn't built yet. */}
      <button type="button" className={`${styles.iconButton} ${styles.iconLeft}`} aria-label="Trip chat"><MessageCircle size={24} strokeWidth={1.75} aria-hidden /></button>
      <Link href={settingsHref} className={`${styles.iconButton} ${styles.iconRight}`} aria-label="Trip settings"><Settings size={24} strokeWidth={1.75} aria-hidden /></Link>
      <h1 className={styles.title}>{draft.tripName || "Your Golf Trip"}</h1>
      <div className={styles.tabs} role="tablist" aria-label="Trip sections">
        {TABS.map((name) => <button key={name} type="button" role="tab" aria-selected={tab === name}
          className={`${styles.tab} ${tab === name ? styles.tabActive : ""}`} onClick={() => setTab(name)}>{name}</button>)}
      </div>
    </header>
    <div className={styles.body} role="tabpanel" aria-label={tab}>
      {tab === "Home" ? <InfoAccount destination={draft.destination} flights={flights} />
        : tab === "Golf" ? <>
          {preview && previewMatch && <div className={styles.tabs} role="group" aria-label="Preview trip scenario">
            {[true, false].map((value) => <button key={String(value)} type="button" aria-pressed={competitive === value}
              className={`${styles.tab} ${competitive === value ? styles.tabActive : ""}`} onClick={() => setPreviewCompetition(value)}>
              {value ? "Competitive preview" : "Non-competitive preview"}
            </button>)}
          </div>}
          <GolfSlides key={String(competitive)} previewMatch={previewMatch} competitive={competitive} />
        </>
        : tab === "Venue" ? <HomeSections draft={draft} dates={dates} dateRange={dateRange} weather={weather} />
        : tab === "Info" ? <VenueEvents />
        : <Card title={tab}><Empty>Coming soon</Empty></Card>}
    </div>
    <GolfTripScoring par={previewMatch?.par} initialHoles={yourHoles} />
  </main>;
}

const HOME_SECTIONS = ["Golf", "The Trip", "Travelers", "Logistics"] as const;
type HomeSection = (typeof HOME_SECTIONS)[number];

/**
 * Home tab, search-sheet style: four cream cards, one open at a time. The open one shows a big title, then the Venue
 * tab's event-list rows (headings with a chevron; square picture with a "Set" / "To do" tag, small label, bold title,
 * detail lines); the others are short bars with the section on the left and a one-line summary on the right.
 * Tapping a bar opens it and closes the one that was open.
 */
function HomeSections({ draft, dates, dateRange, weather }: { draft: Record<string, string>; dates: string[]; dateRange: string; weather?: Promise<TripWeather> }) {
  const [openIndex, setOpenIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const rounds = plannedRounds(draft);
  const tournament = draft.includesTournament ? TOURNAMENT_ANSWERS[draft.includesTournament] ?? "Not sure yet" : "";
  const nights = dates.length > 1 ? `${dates.length - 1} nights` : "";

  useEffect(() => {
    if (!isAutoPlaying) return;
    const timer = window.setInterval(() => {
      setOpenIndex((index) => (index + 1) % HOME_SECTIONS.length);
    }, 3600);
    return () => window.clearInterval(timer);
  }, [isAutoPlaying]);

  const goToSection = (nextIndex: number) => {
    setOpenIndex((nextIndex + HOME_SECTIONS.length) % HOME_SECTIONS.length);
  };

  const beginDrag = (startX: number) => {
    setIsAutoPlaying(false);
    setDragStartX(startX);
    setDragOffset(0);
  };

  const moveDrag = (currentX: number) => {
    if (dragStartX === null) return;
    setDragOffset(currentX - dragStartX);
  };

  const endDrag = () => {
    if (dragStartX === null) return;
    if (dragOffset < -60) {
      goToSection(openIndex + 1);
    } else if (dragOffset > 60) {
      goToSection(openIndex - 1);
    }
    setDragStartX(null);
    setDragOffset(0);
    window.setTimeout(() => setIsAutoPlaying(true), 1500);
  };

  const heading = (text: string) => <h4 className={styles.eventsHeading}>{text}<ChevronRight size={20} strokeWidth={2.25} aria-hidden /></h4>;

  const nextImportantEvent = rounds[0] ? {
    host: `Round ${rounds[0].number}`,
    title: `${draft[`round${rounds[0].number}Course`] || "Golf day"} · ${rounds[0].date ? shortTripDate(rounds[0].date) : `Day ${rounds[0].dayNumber}`}`,
    art: ART.golf,
    icon: Flag,
    badge: "Set",
  } : null;

  const sections: Record<HomeSection, { summary: string; rows: ReactNode }> = {
    Golf: {
      summary: nextImportantEvent ? "Next round coming up" : "Plan the next tee time",
      rows: <>
        {heading("Next up")}
        {nextImportantEvent ? <EventRow event={{ ...nextImportantEvent, lines: [{ icon: CalendarDays, text: "Keep your clubs ready and check the weather before you go" }] }} /> : <EventRow event={{ host: "Golf", title: "Book a tee time or a casual local round", art: ART.golf, icon: Flag, badge: "To do", lines: [{ icon: CalendarDays, text: "Local public courses and a quick lunch nearby work well here" }] }} />}
        {heading("Tournament")}
        <EventRow event={{ host: "Tournament", title: tournament || "Look for a weekend match or friendly side game", art: ART.tournament, icon: Trophy, badge: tournament ? "Set" : "To do", lines: tournament ? [{ icon: CalendarDays, text: tournament }] : [{ icon: Trophy, text: "If there is no formal tournament, suggest a low-key competition" }] }} />
      </>,
    },
    "The Trip": {
      summary: draft.destination ? "Pay attention to travel" : "Good spots nearby",
      rows: <>
        {heading("Travel")}
        {draft.destination
          ? <EventRow event={{ host: "Travel", title: dateRange ? `Check in for ${draft.destination} travel` : `Your trip to ${draft.destination}`, art: ART.travel, icon: Plane,
            badge: "Set",
            lines: [dateRange && { icon: CalendarDays, text: dateRange }, nights && { icon: Moon, text: nights }, { icon: Plane, text: "The day before, remind everyone to check in to flights" }] }} />
          : <EventRow event={{ host: "Nearby", title: "Find a fun lunch spot or a quick local activity", art: ART.travel, icon: Plane, badge: "Idea", lines: [{ icon: MapPin, text: "Use this space for nearby restaurants, sightseeing, or the best casual stop" }] }} />}
        {weather && <Suspense fallback={<EventRow event={{ host: "Weather", title: "Loading forecast…", art: ART.weather, icon: Sun }} />}>
          <WeatherRow place={draft.destination} weather={weather} />
        </Suspense>}
        <EventRow event={{ host: "Plan", title: "Dinner or lunch reservation for the evening", art: ART.photos, icon: Camera, badge: "Idea", lines: [{ icon: Clock, text: "If nothing is booked, suggest a good local spot for the group" }] }} />
      </>,
    },
    Travelers: {
      summary: draft.yourName ? "Who is headed out" : "Group plan",
      rows: <>
        {heading("Group")}
        {draft.yourName
          ? <EventRow event={{ host: "Organizer", title: draft.yourName, art: ART.travelers, icon: User, badge: "Set", lines: [{ icon: Users, text: "Make sure the group knows the schedule and who is arriving when" }] }} />
          : <EventRow event={{ host: "Travelers", title: "Add the people joining the trip", art: ART.travelers, icon: Users, badge: "To do" }} />}
        <EventRow event={{ host: "Plan", title: "Who is driving, riding together, or meeting up", art: ART.travelers, icon: Users, badge: "Idea" }} />
      </>,
    },
    Logistics: {
      summary: draft.destination ? "Stay and ride" : "Helpful defaults",
      rows: <>
        {heading("Stay & rides")}
        <EventRow event={{ host: "Lodging", title: "Check in and confirm the room setup", art: ART.stay, icon: BedDouble, badge: "Idea", lines: [{ icon: CalendarDays, text: "This is where hotel check-in, room notes, and arrival timing go" }] }} />
        <EventRow event={{ host: "Transportation", title: draft.destination ? "Airport or shuttle timing" : "Set ride and parking plans", art: ART.transport, icon: Car, badge: "Need", lines: [{ icon: Clock, text: draft.destination ? "The day before, remind the group to check flight and car details" : "If nothing is booked, suggest shuttles, rides, or a simple airport plan" }] }} />
        {heading("More ideas")}
        <EventRow event={{ host: "Local picks", title: "Good places to eat, walk, or grab a drink nearby", art: ART.expenses, icon: Receipt, badge: "Idea" }} />
      </>,
    },
  };

  const translateX = `translateX(calc(${-openIndex * 100}% + ${dragOffset}px))`;

  return <div className={styles.sheets}>
    <div
      className={styles.sheetTrack}
      style={{ transform: translateX }}
      onPointerDown={(event) => beginDrag(event.clientX)}
      onPointerMove={(event) => moveDrag(event.clientX)}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onPointerCancel={endDrag}
      aria-live="polite"
    >
      {HOME_SECTIONS.map((name) => <section key={name} className={styles.sheetOpen} aria-label={name}>
        <h3 className={styles.sheetTitle}>{name}</h3>
        <div className={`${styles.events} ${styles.sheetRows}`}>{sections[name].rows}</div>
      </section>)}
    </div>
    <div className={styles.sheetDots} aria-label="Home cards">
      {HOME_SECTIONS.map((name, index) => <button key={name} type="button" aria-label={`Show ${name}`} aria-pressed={openIndex === index}
        className={`${styles.sheetDot} ${openIndex === index ? styles.sheetDotActive : ""}`} onClick={() => {
          setIsAutoPlaying(false);
          setOpenIndex(index);
          window.setTimeout(() => setIsAutoPlaying(true), 1500);
        }} />)}
    </div>
  </div>;
}

/** The Trip's Weather row once the server's weather promise settles (Suspense shows the loading row until then). Lines with no data are left out. */
function WeatherRow({ place, weather }: { place?: string; weather: Promise<TripWeather> }) {
  const result = use(weather);
  if (result.status !== "ok") return <EventRow event={{ host: "Weather", art: ART.weather, icon: Sun,
    title: result.status === "unavailable" ? "Forecast temporarily unavailable" : "Weather unavailable" }} />;
  const now = result.weather;
  const highLow = [now.high !== null && `High ${now.high}°`, now.low !== null && `Low ${now.low}°`].filter(Boolean).join(" · ");
  const wind = [now.windDirection, now.windSpeed].filter(Boolean).join(" ");
  const title = [now.temperature !== null && `${now.temperature}°${now.temperatureUnit}`, now.condition].filter(Boolean).join(" · ");
  return <EventRow event={{ host: place ? `Weather · ${place}` : "Weather", title: title || "Weather", art: ART.weather, icon: Sun,
    lines: [highLow && { icon: Thermometer, text: highLow }, now.precipitationChance !== null && { icon: CloudRain, text: `Rain ${now.precipitationChance}%` },
      wind && { icon: Wind, text: `Wind ${wind}` }] }} />;
}

/** Golf sections share the existing responsive scroll-snap strip and tab styling. */
function GolfSlides({ previewMatch, competitive }: { previewMatch?: GolfMatchPreview; competitive: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const availableSlides = GOLF_SLIDES.filter((name) => name !== "Competition" || competitive);
  const [active, setActive] = useState(0);
  const gamesActive = availableSlides[active] === "Games";

  useEffect(() => {
    const track = trackRef.current;
    if (!track || gamesActive) return;
    // Keep the chosen panel aligned when the mobile/desktop viewport changes.
    const observer = new ResizeObserver(() => {
      track.scrollTo({ left: active * track.clientWidth, behavior: "instant" });
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, [active, gamesActive]);

  const goTo = (index: number) => {
    setActive(index);
    // Keep the interactive Games panel outside the swipe strip.
    if (availableSlides[index] !== "Games") requestAnimationFrame(() => {
      const track = trackRef.current;
      if (track) track.scrollTo({ left: index * track.clientWidth, behavior: "instant" });
    });
  };
  const onScroll = () => {
    const track = trackRef.current;
    if (!gamesActive && track && track.clientWidth > 0) setActive(Math.round(track.scrollLeft / track.clientWidth));
  };

  return <>
    {previewMatch && <div className={styles.golfTop}><GolfCourseWeather match={previewMatch} /></div>}
    <div className={styles.tabs} role="tablist" aria-label="Golf sections">
      {availableSlides.map((name, i) => <button key={name} type="button" role="tab" aria-selected={active === i}
        className={`${styles.tab} ${active === i ? styles.tabActive : ""}`} onClick={() => goTo(i)}>{name}</button>)}
    </div>
    <div ref={trackRef} className={styles.slides} style={gamesActive ? { display: "none" } : undefined} onScroll={onScroll}>
      {availableSlides.filter(name => name !== "Games").map((name, i) => <div key={name} className={styles.slide} role="tabpanel" aria-label={name} inert={active !== i}>
        {name === "Overview"
          ? previewMatch ? <GolfTripLeaderboard match={previewMatch} /> : <Card title="Score Overview"><Empty>Your leaderboard and round scores will show here</Empty></Card>
          : previewMatch ? <GolfTripCompetitionMatchPreview initialMatch={previewMatch} /> : <Card title="Competition"><Empty>Your matchups will show here</Empty></Card>}
      </div>)}
    </div>
    <div role="tabpanel" aria-label="Games" hidden={!gamesActive}>
      {previewMatch ? <GolfTripGames /> : <Card title="Games"><Empty>Golf games are coming soon</Empty></Card>}
    </div>
  </>;
}

type EventLine = { icon: LucideIcon; text: string };
/** One row in the event-list style. `art` stands in for a picture (an optional icon sits on it); `lines` skips empty entries. */
type InfoEvent = { host: string; title: string; art: string; icon?: LucideIcon; lines?: (EventLine | false | "" | undefined)[];
  badge?: "Waitlisted" | "Going" | "Invited" | "Set" | "To do"; price?: string };

/** Home tab picture colors, one per part of the trip. */
const ART = {
  travel: "linear-gradient(135deg,#8a2433,#4a0f19)", weather: "linear-gradient(135deg,#f5b544,#d9772b)", stay: "linear-gradient(135deg,#6b7fa8,#2f3e5f)",
  transport: "linear-gradient(135deg,#7a7a7a,#3a3a3a)", golf: "linear-gradient(135deg,#3f8a55,#1c4a2b)", tournament: "linear-gradient(135deg,#dcc495,#a8894e)",
  travelers: "linear-gradient(135deg,#b06a8a,#6a2f4c)", itinerary: "linear-gradient(135deg,#5c8f9e,#2c5361)", expenses: "linear-gradient(135deg,#9a8a6a,#5a4d33)",
  photos: "linear-gradient(135deg,#e07a5f,#a8432c)",
};

/** Info tab trip logistics sections: a single entry under each category. */
const FLIGHT_EVENTS: InfoEvent[] = [
  { host: "Flights", title: "United 452 · Denver to San Diego", lines: [{ icon: Clock, text: "Today, 6:20AM" }, { icon: MapPin, text: "DEN → SAN" }], art: "linear-gradient(135deg,#6a1f2b,#a22d3d)", badge: "Set" },
];
const TRANSPORTATION_EVENTS: InfoEvent[] = [
  { host: "Transportation", title: "Airport shuttle to the resort", lines: [{ icon: Clock, text: "Pickup at 10:15AM" }, { icon: MapPin, text: "Terminal B · 4 seats" }], art: "linear-gradient(135deg,#5a5d6b,#2e3240)", badge: "Set" },
];
const LODGING_EVENTS: InfoEvent[] = [
  { host: "Lodging", title: "The Shorebreak Villas · 3 nights", lines: [{ icon: Clock, text: "Check-in 3:00PM" }, { icon: MapPin, text: "Oceanfront, 2 bedrooms" }], art: "linear-gradient(135deg,#c9b38b,#7d603a)", badge: "Set" },
];

/** Info tab: keep a single section per travel category so the page reads as trip logistics. */
function VenueEvents() {
  return <div className={styles.events}>
    <h2 className={styles.eventsHeading}>Flights<ChevronRight size={20} strokeWidth={2.25} aria-hidden /></h2>
    {FLIGHT_EVENTS.map((event) => <EventRow key={event.title} event={event} />)}
    <h2 className={styles.eventsHeading}>Transportation<ChevronRight size={20} strokeWidth={2.25} aria-hidden /></h2>
    {TRANSPORTATION_EVENTS.map((event) => <EventRow key={event.title} event={event} />)}
    <h2 className={styles.eventsHeading}>Lodging<ChevronRight size={20} strokeWidth={2.25} aria-hidden /></h2>
    {LODGING_EVENTS.map((event) => <EventRow key={event.title} event={event} />)}
  </div>;
}

function EventRow({ event }: { event: InfoEvent }) {
  return <article className={styles.eventRow}>
    <div className={styles.eventArt} style={{ background: event.art }}>
      {event.icon && <event.icon size={30} strokeWidth={1.75} aria-hidden />}
      {event.badge && <span className={`${styles.eventBadge} ${styles[`badge${event.badge.replace(" ", "")}`]}`}>{event.badge}</span>}
    </div>
    <div className={styles.eventInfo}>
      <p className={styles.eventHost}><span className={styles.eventAvatar} aria-hidden /><span>{event.host}</span>
        {event.price && <span className={styles.eventPrice}>{event.price}</span>}</p>
      <h3 className={styles.eventTitle}>{event.title}</h3>
      {event.lines?.map((line) => line && <p key={line.text} className={styles.eventMeta}><line.icon size={14} strokeWidth={2} aria-hidden />{line.text}</p>)}
    </div>
  </article>;
}

/** Info → Flights card (in the first account-card slot): your next flight and how many you've saved; opens the Flights page. */
function FlightsCard({ flights }: { flights?: TripFlights }) {
  const summary = flights?.summary;
  const next = summary?.next;
  const counts = summary ? flightCounts(summary) : "";
  const content = <>
    <p className={styles.accountCardName}><Plane size={14} strokeWidth={2} aria-hidden /> Flights</p>
    <p className={styles.accountCardAmount}>{next ? `${next.flightNumber} · ${next.departureAirport} → ${next.arrivalAirport}` : counts ? "No upcoming flights" : "Add your flights"}</p>
    {next && <p className={styles.accountCardNote}>{flightTime(next.departureLocal)}</p>}
    {counts && <p className={styles.accountCardNote}>{counts}</p>}
  </>;
  return flights?.href
    ? <Link href={flights.href} className={`${styles.accountCard} ${styles.accountCardLink}`} aria-label={`Flights: ${next ? `next ${next.flightNumber}` : counts || "add your flights"}`}>{content}</Link>
    : <div className={styles.accountCard}>{content}</div>;
}

/**
 * Info tab, banking-app style (layout only, made-up numbers): a maroon top saying "Your trip to {destination}", a swipeable
 * row of account cards, a promo card with dots, then "Financial tools". It runs edge to edge and down to the bottom of the screen.
 */
function InfoAccount({ destination, flights }: { destination: string; flights?: TripFlights }) {
  return <div className={styles.account}>
    <div className={styles.accountTop}>
      <div className={styles.accountBar}>
        <button type="button" className={styles.accountBell} aria-label="Notifications"><Bell size={20} strokeWidth={1.75} aria-hidden /></button>
        <button type="button" className={styles.accountPill}>Get $150</button>
      </div>
      <p className={styles.accountLabel}>{destination ? `Your trip to ${destination}` : "Your trip"}</p>
    </div>
    <div className={styles.accountCards}>
      <FlightsCard flights={flights} />
      <div className={styles.accountCard} aria-hidden />
    </div>
    <div className={styles.accountPromos}>
      <div className={styles.accountPromo}>
        <button type="button" className={styles.accountPromoClose} aria-label="Dismiss"><X size={12} strokeWidth={2.5} aria-hidden /></button>
        <div className={styles.accountPromoText}>
          <p className={styles.accountPromoTitle}>Welcome to Chime+! Enjoy 3.00% APY, fee-free overdraft, and more</p>
          <p className={styles.accountPromoLink}>See your benefits<ChevronRight size={14} strokeWidth={2.5} aria-hidden /></p>
        </div>
        <span className={styles.accountPromoIcon} aria-hidden><Plus size={26} strokeWidth={4} /></span>
      </div>
      <div className={`${styles.accountPromo} ${styles.accountPromoNext}`} aria-hidden />
    </div>
    <div className={styles.accountDots} aria-hidden><span className={styles.accountDotActive} /><span /><span /><span /></div>
    <p className={styles.accountHeading}>Financial tools</p>
    <div className={styles.accountTools}>
      <div className={styles.accountTool}>Direct Deposit</div>
      <div className={styles.accountTool}>Rewards</div>
    </div>
  </div>;
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.card} aria-label={title}>
    <h2 className={styles.cardTitle}>{title}</h2>
    {children}
  </section>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}
