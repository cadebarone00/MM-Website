"use client";

import { Suspense, use, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, BedDouble, Bell, CalendarDays, Camera, Car, ChevronRight, ChevronsUpDown, Clock, CloudRain, Flag, MapPin, MessageCircle, Moon, Plane, Plus, Receipt, Settings, Sun, Thermometer, Trophy, User, Users, Wind, X, type LucideIcon } from "lucide-react";
import { golfTripDraftSnapshot, parseGolfTripDraft, type GolfTripDraft, plannedRounds, shortTripDate, tripDates } from "@/lib/platform/golfTripDraft";
import type { GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import type { TripWeather } from "@/lib/platform/weather/types";
import { flightCounts, flightTime, type FlightSummary } from "@/lib/platform/golfTripFlights";

/** The Info tab's Flights card: the viewer's flight summary, and the Flights page it opens (null = not a link). */
export interface TripFlights { summary: FlightSummary; href: string | null }
import { GolfCourseWeather, GolfMatchup, GolfTripLeaderboard, GolfTripMatch } from "./GolfTripMatch";
import styles from "./GolfTripHome.module.css";

const TABS = ["Home", "Golf", "Venue", "Info"] as const;
type Tab = (typeof TABS)[number];
const GOLF_SLIDES = ["Leaderboard", "Match", "Overview"] as const;

const TOURNAMENT_ANSWERS: Record<string, string> = { yes: "Yes, there's a tournament", no: "No tournament, just golf", undecided: "Not sure yet" };

/** The draft only changes on the questionnaire's Next, so there is nothing to listen for here. */
const subscribeNever = () => () => {};

/**
 * Golf Trip Home: trip name, a 4-tab selector, and (on Home) one card per part of the trip. Layout only:
 * cards show the questionnaire answers kept in this tab, or an empty state. Nothing is saved yet.
 * `preview` replaces those answers with fixed ones (the /dev/tournament design preview).
 * `settingsHref` is where the settings wheel goes (this trip's settings page).
 * `backHref` adds a small "← Golf Trips" link on desktop, where the bottom tabs (and their Golf Trips tab) are hidden.
 * `previewMatch` fills the Golf tab's Leaderboard and Match slides with made-up data (/dev/tournament only); without it they are "Coming soon".
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

  const dates = tripDates(draft.startDate, draft.endDate);
  const dateRange = dates.length > 0 ? `${shortTripDate(dates[0])} – ${shortTripDate(dates[dates.length - 1])}` : "";

  return <main className={styles.page}>
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
      {tab === "Home" ? <HomeSections draft={draft} dates={dates} dateRange={dateRange} weather={weather} />
        : tab === "Golf" ? <GolfSlides previewMatch={previewMatch} />
        : tab === "Venue" ? <VenueEvents />
        : tab === "Info" ? <InfoAccount flights={flights} />
        : <Card title={tab}><Empty>Coming soon</Empty></Card>}
    </div>
  </main>;
}

/**
 * Home tab, in the Venue tab's event-list style: each part of the trip is a row (square picture, small label, bold
 * title, detail lines). The tag on the picture says "Set" once the questionnaire filled that part in, "To do" if not.
 */
function HomeSections({ draft, dates, dateRange, weather }: { draft: Record<string, string>; dates: string[]; dateRange: string; weather?: Promise<TripWeather> }) {
  const rounds = plannedRounds(draft);
  const tournament = draft.includesTournament ? TOURNAMENT_ANSWERS[draft.includesTournament] ?? "Not sure yet" : "";

  return <div className={styles.events}>
    <h2 className={styles.eventsHeading}>Your Trip<ChevronRight size={20} strokeWidth={2.25} aria-hidden /></h2>
    <EventRow event={{ host: "Travel", title: draft.destination || "Add your destination and dates", art: ART.travel, icon: Plane,
      badge: draft.destination && dates.length > 0 ? "Set" : "To do",
      lines: [dateRange && { icon: CalendarDays, text: dateRange }, dates.length > 1 && { icon: Moon, text: `${dates.length - 1} nights` }] }} />
    {weather && <Suspense fallback={<EventRow event={{ host: "Weather", title: "Loading forecast…", art: ART.weather, icon: Sun }} />}>
      <WeatherRow place={draft.destination} weather={weather} />
    </Suspense>}
    <EventRow event={{ host: "Stay", title: "Add where you're staying", art: ART.stay, icon: BedDouble, badge: "To do" }} />
    <EventRow event={{ host: "Transportation", title: "Add flights, rental cars or shuttles", art: ART.transport, icon: Car, badge: "To do" }} />

    <h2 className={styles.eventsHeading}>Golf<ChevronRight size={20} strokeWidth={2.25} aria-hidden /></h2>
    {rounds.length > 0
      ? rounds.map((round) => <EventRow key={round.number} event={{ host: `Round ${round.number}`, title: draft[`round${round.number}Course`] || "Course not set",
        art: ART.golf, icon: Flag, badge: draft[`round${round.number}Course`] ? "Set" : "To do",
        lines: [{ icon: CalendarDays, text: round.date ? shortTripDate(round.date) : `Day ${round.dayNumber}` }] }} />)
      : <EventRow event={{ host: "Golf", title: "Add your golf days and courses", art: ART.golf, icon: Flag, badge: "To do" }} />}
    <EventRow event={{ host: "Tournament", title: tournament || "Decide if there's a tournament", art: ART.tournament, icon: Trophy, badge: tournament ? "Set" : "To do" }} />

    <h2 className={styles.eventsHeading}>Travelers<ChevronRight size={20} strokeWidth={2.25} aria-hidden /></h2>
    {draft.yourName && <EventRow event={{ host: "Organizer", title: draft.yourName, art: ART.travelers, icon: User, badge: "Set" }} />}
    <EventRow event={{ host: "Travelers", title: "Invite the rest of your group", art: ART.travelers, icon: Users, badge: "To do" }} />

    <h2 className={styles.eventsHeading}>Itinerary<ChevronRight size={20} strokeWidth={2.25} aria-hidden /></h2>
    {dates.length > 0
      ? dates.map((date, i) => <p key={date} className={styles.eventsDay}>Day {i + 1} <span>/ {shortTripDate(date)}</span></p>)
      : <EventRow event={{ host: "Itinerary", title: "Your day-by-day plan shows here once dates are set", art: ART.itinerary, icon: CalendarDays, badge: "To do" }} />}

    <h2 className={styles.eventsHeading}>Expenses &amp; Photos<ChevronRight size={20} strokeWidth={2.25} aria-hidden /></h2>
    <EventRow event={{ host: "Expenses", title: "Track who paid for what", art: ART.expenses, icon: Receipt, badge: "To do" }} />
    <EventRow event={{ host: "Photos", title: "Share photos from the trip", art: ART.photos, icon: Camera, badge: "To do" }} />
  </div>;
}

/** Home's Weather row once the server's weather promise settles (Suspense shows the loading row until then). Lines with no data are left out. */
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

/**
 * Golf tab, Sleeper-style: round dots + team card (preview only; on Overview the course weather takes its place,
 * in the same spot so the tabs never move), then Leaderboard / Match / Overview tabs in the
 * same words-and-underline style as Home–Info, then side-by-side slides. The slides sit in a scroll-snap strip, so
 * a phone swipe moves between them natively; tapping a tab scrolls to its slide, and scrolling lights up its tab.
 */
function GolfSlides({ previewMatch }: { previewMatch?: GolfMatchPreview }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const goTo = (index: number) => {
    const track = trackRef.current;
    if (track) track.scrollTo({ left: index * track.clientWidth, behavior: "smooth" });
    setActive(index);
  };
  const onScroll = () => {
    const track = trackRef.current;
    if (track && track.clientWidth > 0) setActive(Math.round(track.scrollLeft / track.clientWidth));
  };
  const overview = GOLF_SLIDES[active] === "Overview";

  return <>
    {previewMatch && <div className={styles.golfTop}>
      <div className={overview ? styles.golfTopHidden : ""} inert={overview}>
        <GolfMatchup match={previewMatch} showDots={GOLF_SLIDES[active] !== "Leaderboard"} />
      </div>
      <div className={overview ? "" : styles.golfTopHidden} inert={!overview}><GolfCourseWeather match={previewMatch} /></div>
    </div>}
    <div className={styles.tabs} role="tablist" aria-label="Golf sections">
      {GOLF_SLIDES.map((name, i) => <button key={name} type="button" role="tab" aria-selected={active === i}
        className={`${styles.tab} ${active === i ? styles.tabActive : ""}`} onClick={() => goTo(i)}>{name}</button>)}
    </div>
    <div ref={trackRef} className={styles.slides} onScroll={onScroll}>
      {GOLF_SLIDES.map((name, i) => <div key={name} className={styles.slide} role="tabpanel" aria-label={name} inert={active !== i}>
        {name === "Match" && previewMatch ? <GolfTripMatch match={previewMatch} />
          : name === "Leaderboard" && previewMatch ? <GolfTripLeaderboard match={previewMatch} />
          : name === "Overview" ? <GolfOverview />
          : <Card title={name}><Empty>Coming soon</Empty></Card>}
      </div>)}
    </div>
  </>;
}

/** Golf tab, Overview slide: the day at a glance. Placeholders for now (nothing behind them yet). */
function GolfOverview() {
  return <div className={styles.overview}>
    <Card title="Course Scorecard"><Empty>Today&apos;s course scorecard will show here</Empty></Card>
    <Card title="Travel Plans"><Empty>Today&apos;s rides and travel will show here</Empty></Card>
    <Card title="Reservations"><Empty>Tee times, dinners, and other reservations for the rest of today will show here</Empty></Card>
  </div>;
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

/** Venue tab placeholder rows (layout only, nothing behind them yet). `art` stands in for the event's picture. */
const YOUR_EVENTS: InfoEvent[] = [
  { host: "Andrew's Yeung's Tech Events", title: "Extraordinary Founders Dinner (hosted by Andrew Yeung)", lines: [{ icon: Clock, text: "Today, 6:00PM GMT-7" }, { icon: MapPin, text: "Showplace Square" }], art: "linear-gradient(135deg,#d9d9d9,#7a7a7a)", badge: "Waitlisted" },
  { host: "Dogs Only Social Club and Big Dog...", title: "Paws, People & Purpose", lines: [{ icon: Clock, text: "18 Jul, 2:00PM GMT-7" }, { icon: MapPin, text: "GoodPeople" }], art: "linear-gradient(135deg,#f3f1ea,#b9d3c0)", badge: "Going" },
  { host: "Alex Smith", title: "Solar Eclipse Viewing Party", lines: [{ icon: Clock, text: "21 Jul, 1:30PM GMT-7" }, { icon: MapPin, text: "1226 University Dr" }], art: "linear-gradient(135deg,#f5a623,#c0392b)", badge: "Invited" },
];
const PICKED_EVENTS: InfoEvent[] = [
  { host: "Creative Coffee Club", title: "after hours: a happy hour for la's creatives and founders", lines: [{ icon: Clock, text: "5:30PM GMT-7" }, { icon: MapPin, text: "TA Kitchen - West Hollywood" }], art: "linear-gradient(135deg,#3a3a3a,#111)", price: "US$10" },
];

/** Venue tab, event-list style: "Your Events" (with RSVP badges), then "Picked for You" under a Nearby picker and a day line. */
function VenueEvents() {
  return <div className={styles.events}>
    <h2 className={styles.eventsHeading}>Your Events<ChevronRight size={20} strokeWidth={2.25} aria-hidden /></h2>
    {YOUR_EVENTS.map((event) => <EventRow key={event.title} event={event} />)}
    <h2 className={styles.eventsHeading}>Picked for You<ChevronRight size={20} strokeWidth={2.25} aria-hidden /></h2>
    <button type="button" className={styles.eventsPicker}>Nearby<ChevronsUpDown size={14} strokeWidth={2} aria-hidden /></button>
    <p className={styles.eventsDay}>Tomorrow <span>/ Wednesday</span></p>
    {PICKED_EVENTS.map((event) => <EventRow key={event.title} event={event} />)}
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
 * Info tab, banking-app style (layout only, made-up numbers): a dark green top with the balance, a swipeable row of
 * account cards, a promo card with dots, then "Financial tools". It runs edge to edge and down to the bottom of the screen.
 */
function InfoAccount({ flights }: { flights?: TripFlights }) {
  return <div className={styles.account}>
    <div className={styles.accountTop}>
      <div className={styles.accountBar}>
        <button type="button" className={styles.accountBell} aria-label="Notifications"><Bell size={20} strokeWidth={1.75} aria-hidden /></button>
        <button type="button" className={styles.accountPill}>Get $150</button>
      </div>
      <p className={styles.accountLabel}>Available</p>
      <p className={styles.accountBalance}>$533.23<ChevronRight size={22} strokeWidth={2} aria-hidden /></p>
      <p className={styles.accountLink}>$20.00 overdraft coverage<ChevronRight size={14} strokeWidth={2.5} aria-hidden /></p>
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
