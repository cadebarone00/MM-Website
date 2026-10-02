"use client";

import { Suspense, use, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, BedDouble, Bell, CalendarDays, Camera, Car, ChevronRight, Clock, CloudRain, ExternalLink, FileText, Flag, LockKeyhole, MapPin, MessageCircle, Plane, Plus, Settings, Share2, ShieldCheck, ShoppingBag, Sun, Thermometer, Trash2, Trophy, User, Users, Wind, X, type LucideIcon } from "lucide-react";
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
  const [open, setOpen] = useState<HomeSection>("Golf");
  const rounds = plannedRounds(draft);
  const tournament = draft.includesTournament ? TOURNAMENT_ANSWERS[draft.includesTournament] ?? "Not sure yet" : "";
  const nights = dates.length > 1 ? `${dates.length - 1} nights` : "";

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
      summary: nextImportantEvent ? "Round coming up" : "Golf plan",
      rows: <>
        {heading("Rounds")}
        {nextImportantEvent ? <EventRow event={{ ...nextImportantEvent, lines: [{ icon: CalendarDays, text: `${nextImportantEvent.title}` }] }} /> : <EventRow event={{ host: "Golf", title: "Round 1 · Course TBD", art: ART.golf, icon: Flag, badge: "To do", lines: [{ icon: CalendarDays, text: "Add the tee time and course" }] }} />}
        {heading("Tournament")}
        <EventRow event={{ host: "Tournament", title: tournament || "Friendly side game", art: ART.tournament, icon: Trophy, badge: tournament ? "Set" : "To do", lines: tournament ? [{ icon: CalendarDays, text: tournament }] : [{ icon: Trophy, text: "Add the event info or side match" }] }} />
      </>,
    },
    "The Trip": {
      summary: draft.destination ? "Travel plan" : "Trip info",
      rows: <>
        {heading("Flights")}
        {draft.destination
          ? <EventRow event={{ host: "Flights", title: "AA1234 · RDU → DFW", art: ART.travel, icon: Plane,
            badge: "Set",
            lines: [{ icon: CalendarDays, text: dateRange || "Trip dates TBD" }, { icon: Clock, text: "Apr 22, 6:10 AM" }, { icon: MapPin, text: nights ? `${nights} in town` : "2 getting there · 1 heading home" }] }} />
          : <EventRow event={{ host: "Flights", title: "Flight details", art: ART.travel, icon: Plane, badge: "To do", lines: [{ icon: Clock, text: "Add the flight and arrival time" }] }} />}
        {weather && <Suspense fallback={<EventRow event={{ host: "Weather", title: "Loading forecast…", art: ART.weather, icon: Sun }} />}>
          <WeatherRow place={draft.destination} weather={weather} />
        </Suspense>}
        <EventRow event={{ host: "Dinner", title: "Dinner reservation · 8:00 PM", art: ART.photos, icon: Camera, badge: "Set", lines: [{ icon: Clock, text: "Confirm the group reservation" }] }} />
      </>,
    },
    Travelers: {
      summary: draft.yourName ? "Group arrivals" : "Travelers",
      rows: <>
        {heading("Travelers")}
        {draft.yourName
          ? <EventRow event={{ host: "Organizer", title: draft.yourName, art: ART.travelers, icon: User, badge: "Set", lines: [{ icon: Users, text: "Arrival window and who is driving" }] }} />
          : <EventRow event={{ host: "Travelers", title: "Add the group", art: ART.travelers, icon: Users, badge: "To do" }} />}
        <EventRow event={{ host: "Arrivals", title: "Who is arriving when", art: ART.travelers, icon: Users, badge: "Set", lines: [{ icon: MapPin, text: "Confirm ride share and pickup plans" }] }} />
      </>,
    },
    Logistics: {
      summary: "Stay + rides",
      rows: <>
        {heading("Lodging")}
        <EventRow event={{ host: "Lodging", title: "The Shorebreak Villas · 3 nights", art: ART.stay, icon: BedDouble, badge: "Set", lines: [{ icon: CalendarDays, text: "Check-in at 3:00 PM" }] }} />
        {heading("Transportation")}
        <EventRow event={{ host: "Transportation", title: "Airport shuttle · 10:15 AM", art: ART.transport, icon: Car, badge: "Set", lines: [{ icon: Clock, text: "Pickup at Terminal B" }] }} />
      </>,
    },
  };

  return <div className={styles.sheets}>
    {HOME_SECTIONS.map((name) => open === name
      ? <section key={name} className={styles.sheetOpen} aria-label={name}>
        <h3 className={styles.sheetTitle}>{name}</h3>
        <div className={`${styles.events} ${styles.sheetRows}`}>{sections[name].rows}</div>
      </section>
      : <button key={name} type="button" className={styles.sheetClosed} aria-expanded={false} onClick={() => setOpen(name)}>
        <span className={styles.sheetName}>{name}</span><span className={styles.sheetSummary}>{sections[name].summary}</span>
      </button>)}
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

type InfoSectionKey = "gettingThere" | "lodging" | "transportation";

type InfoEntry = {
  id: string;
  title: string;
  host: string;
  detail: string;
  art: string;
  badge?: InfoEvent["badge"];
};

const INITIAL_GETTING_THERE: InfoEntry[] = [
  { id: "flight-1", host: "Getting there", title: "United 452 · Denver to San Diego", detail: "Today, 6:20AM · DEN → SAN", art: "linear-gradient(135deg,#6a1f2b,#a22d3d)", badge: "Set" },
  { id: "flight-2", host: "Getting there", title: "Rental car pickup", detail: "Pickup 10:15AM · Airport lot B", art: "linear-gradient(135deg,#5a5d6b,#2e3240)", badge: "Set" },
];

const INITIAL_LODGING: InfoEntry[] = [
  { id: "lodging-1", host: "Lodging", title: "The Shorebreak Villas · 3 nights", detail: "Check-in 3:00PM · Oceanfront, 2 bedrooms", art: "linear-gradient(135deg,#c9b38b,#7d603a)", badge: "Set" },
];

const INITIAL_TRANSPORTATION: InfoEntry[] = [
  { id: "transport-1", host: "Transportation", title: "Airport shuttle to the resort", detail: "Pickup at 10:15AM · Terminal B · 4 seats", art: "linear-gradient(135deg,#5a5d6b,#2e3240)", badge: "Set" },
];

/** Info tab: trip logistics with add/remove controls and a delete-confirm flow. */
function VenueEvents() {
  const [gettingThere, setGettingThere] = useState(INITIAL_GETTING_THERE);
  const [lodging, setLodging] = useState(INITIAL_LODGING);
  const [transportation, setTransportation] = useState(INITIAL_TRANSPORTATION);
  const [confirmDelete, setConfirmDelete] = useState<{ section: InfoSectionKey; entry: InfoEntry } | null>(null);
  const [toast, setToast] = useState<{ section: InfoSectionKey; entry: InfoEntry; closing: boolean } | null>(null);
  const [sheetSection, setSheetSection] = useState<InfoSectionKey | null>(null);
  const nextEntryIdRef = useRef(0);

  const quickActionRows = [
    { label: "Contact Pura", icon: MessageCircle },
    { label: "Visit online store", icon: ExternalLink },
    { label: "Share", icon: Share2 },
    { label: "Refund policy", icon: ShieldCheck },
    { label: "Shipping policy", icon: ShoppingBag },
    { label: "Privacy policy", icon: LockKeyhole },
    { label: "Terms and conditions", icon: FileText },
    { label: "Report", icon: AlertTriangle },
  ] as const;

  const addQuickEntry = (option: string) => {
    if (!sheetSection) return;
    const next: InfoEntry = {
      id: `new-${sheetSection}-${nextEntryIdRef.current++}`,
      host: sheetSection === "gettingThere" ? "Getting there" : sheetSection === "lodging" ? "Lodging" : "Transportation",
      title: option,
      detail: sheetSection === "gettingThere" ? "Added for this trip" : sheetSection === "lodging" ? "Stay details" : "Pickup details",
      art: sheetSection === "gettingThere" ? "linear-gradient(135deg,#6a1f2b,#a22d3d)" : sheetSection === "lodging" ? "linear-gradient(135deg,#c9b38b,#7d603a)" : "linear-gradient(135deg,#5a5d6b,#2e3240)",
      badge: "Set",
    };

    if (sheetSection === "gettingThere") setGettingThere(current => [...current, next]);
    else if (sheetSection === "lodging") setLodging(current => [...current, next]);
    else setTransportation(current => [...current, next]);

    setSheetSection(null);
  };

  const openAddSheet = (section: InfoSectionKey) => {
    setSheetSection(section);
  };

  const removeEntry = (section: InfoSectionKey, entry: InfoEntry) => {
    setConfirmDelete(null);
    if (section === "gettingThere") setGettingThere(current => current.filter(item => item.id !== entry.id));
    else if (section === "lodging") setLodging(current => current.filter(item => item.id !== entry.id));
    else setTransportation(current => current.filter(item => item.id !== entry.id));

    setToast({ section, entry, closing: false });

    setTimeout(() => {
      setToast((current) => current ? { ...current, closing: true } : current);
    }, 4800);

    setTimeout(() => {
      setToast((current) => current && current.entry.id === entry.id ? null : current);
    }, 6000);

    const restore = () => {
      if (section === "gettingThere") setGettingThere(current => [entry, ...current.filter(item => item.id !== entry.id)]);
      else if (section === "lodging") setLodging(current => [entry, ...current.filter(item => item.id !== entry.id)]);
      else setTransportation(current => [entry, ...current.filter(item => item.id !== entry.id)]);
      setToast(null);
    };

    (globalThis as typeof globalThis & { __maroonUndo?: () => void }).__maroonUndo = restore;
  };

  useEffect(() => () => {
    (globalThis as typeof globalThis & { __maroonUndo?: () => void }).__maroonUndo = undefined;
  }, []);

  const renderSection = (key: InfoSectionKey, title: string, entries: InfoEntry[], onAdd: () => void) => <section key={key} className={styles.infoSection}>
    <div className={styles.infoHeaderRow}>
      <h2 className={styles.eventsHeading}>{title}</h2>
      <button type="button" className={styles.deleteSectionButton} aria-label={`Delete ${title}`} onClick={() => {
        if (entries[0]) setConfirmDelete({ section: key, entry: entries[0] });
      }}>
        <Trash2 size={16} strokeWidth={2} aria-hidden />
      </button>
    </div>
    {entries.map((entry) => <article key={entry.id} className={styles.infoEntry}>
      <button type="button" className={styles.entryDelete} aria-label={`Delete ${entry.title}`} onClick={() => setConfirmDelete({ section: key, entry })}>
        <Trash2 size={14} strokeWidth={2} aria-hidden />
      </button>
      <div className={styles.eventArt} style={{ background: entry.art }} aria-hidden />
      <div className={styles.eventInfo}>
        <p className={styles.eventHost}><span className={styles.eventAvatar} aria-hidden />{entry.host}</p>
        <h3 className={styles.eventTitle}>{entry.title}</h3>
        <p className={styles.eventMeta}><Clock size={14} strokeWidth={2} aria-hidden />{entry.detail}</p>
      </div>
    </article>)}
    <button type="button" className={styles.addItemButton} onClick={onAdd}><Plus size={16} strokeWidth={2.5} aria-hidden />Add</button>
  </section>;

  return <div className={styles.events}>
    {renderSection("gettingThere", "Getting there", gettingThere, () => openAddSheet("gettingThere"))}
    {renderSection("lodging", "Lodging", lodging, () => openAddSheet("lodging"))}
    {renderSection("transportation", "Transportation", transportation, () => openAddSheet("transportation"))}

    {sheetSection && <div className={styles.addSheetOverlay} role="dialog" aria-modal="true" aria-label="Add trip item">
      <div className={styles.addSheet}>
        <button type="button" className={styles.sheetClose} aria-label="Close add sheet" onClick={() => setSheetSection(null)}><X size={18} strokeWidth={2.25} aria-hidden /></button>
        <div className={styles.sheetActionList}>
          {quickActionRows.map(({ label, icon: Icon }) => <button key={label} type="button" className={styles.sheetActionRow} onClick={() => addQuickEntry(label)}>
            <span className={styles.sheetActionIcon}><Icon size={18} strokeWidth={2} aria-hidden /></span>
            <span className={styles.sheetActionText}>{label}</span>
          </button>)}
        </div>
      </div>
    </div>}

    {confirmDelete && <div className={styles.deleteOverlay} role="dialog" aria-modal="true" aria-label="Delete item confirmation">
      <div className={styles.deleteDialog}>
        <p className={styles.deletePrompt}>Are you sure?</p>
        <button type="button" className={styles.cancelButton} onClick={() => setConfirmDelete(null)}>Cancel</button>
        <button type="button" className={styles.deleteButton} onClick={() => {
          removeEntry(confirmDelete.section, confirmDelete.entry);
          setConfirmDelete(null);
        }}>Delete</button>
      </div>
    </div>}

    {toast && <div className={`${styles.toast} ${toast.closing ? styles.toastClosing : ""}`} role="status" aria-live="polite">
      <div>
        <strong>Item deleted</strong>
        <span>{toast.entry.title}</span>
      </div>
      <button type="button" className={styles.toastUndo} onClick={() => {
        const fn = (globalThis as typeof globalThis & { __maroonUndo?: () => void }).__maroonUndo;
        if (fn) fn();
        setToast(null);
      }}>Undo</button>
    </div>}
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
