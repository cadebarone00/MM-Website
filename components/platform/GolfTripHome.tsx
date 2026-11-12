"use client";

import { Suspense, use, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { GolfTripHeader } from "./GolfTripHeader";
import { TripTapInInvite } from "./TripTapInInvite";
import { homeRosterFull } from "@/lib/platform/tapIn";
import { TripHomeRoster } from "./TripHomeRoster";
import { homeTeamRoster } from "@/lib/platform/homeRoster";
import type { MatchDraftPlayer } from "@/lib/platform/matchDraft";
import { draftSimFixture } from "@/lib/dev/draftSim";
import { TripHomeInvite } from "./TripHomeInvite";
import { TripHomeCompetition } from "./TripHomeCompetition";
import { homeCompetitionSummary, teamGroups, yourTeam } from "@/lib/platform/homeCompetition";
import { useDevSetup } from "@/lib/dev/tripSetupStore";
import { readJustCreatedAll, useJustCreatedVersion } from "@/lib/dev/justCreatedStore";
import { useSavedTripSetup } from "./SavedTripSetupProvider";
import { BoardSlideBody, TripBigBoard, type BoardSlide } from "./TripBigBoard";
import { bigBoardScore, upcomingSlides } from "@/lib/platform/bigBoard";
import { GolfDayBoard } from "./GolfDayBoard";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowLeft, BedDouble, CalendarDays, Camera, Car, ChevronLeft, ChevronRight, Clock, Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Droplets, ExternalLink, FileText, Flag, LockKeyhole, MapPin, MessageCircle, Plane, Plus, Share2, ShieldCheck, ShoppingBag, Sun, Thermometer, Trash2, Trophy, User, Users, Wind, X, type LucideIcon } from "lucide-react";
import { golfTripDraftSnapshot, parseGolfTripDraft, type GolfTripDraft, plannedRounds, shortTripDate, tripDates } from "@/lib/platform/golfTripDraft";
import { normalizeCompetitor, type GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import { ITINERARY_KIND_LABEL, itineraryByDay, itineraryCategory, itineraryDay, itineraryLongDate, itineraryTime, itineraryWeekday, localNow, withGolfRounds, type ItineraryItem, type ItineraryKind } from "@/lib/platform/golfTripItinerary";
import { addMyItem, goingOnly, inviteToItem, itineraryFor, removeMyItem, respondToInvite, updateMyItem, type TripTravel } from "@/lib/platform/tripTravel";
import { GolfTripAddPlace, GolfTripAddTravel, type MyTravelChange } from "./GolfTripMyTravel";
import { TravelKindIcon } from "./travelKinds";
import type { TripWeather } from "@/lib/platform/weather/types";
import { flightCounts, flightTime, type FlightSummary } from "@/lib/platform/golfTripFlights";

/** The Info tab's Flights card: the viewer's flight summary, and the Flights page it opens (null = not a link). */
export interface TripFlights { summary: FlightSummary; href: string | null }
import { GolfTeeSheet, GolfTournamentSummary, GolfTripLeaderboard } from "./GolfTripMatch";
import { standingsFormat as describeStandingsFormat } from "@/lib/platform/historicalTripStandings";
import { competitionMatchOffset } from "@/lib/platform/competitionMatchNumber";
import { useSwipe } from "./useSwipe";
import { GolfTripScoring } from "./GolfTripScoring";
import { GolfTripStats, type ScoreChangeLine, type TripStatsView } from "./GolfTripStats";
import type { ScoreEdit } from "@/lib/platform/playerRounds";
import type { SheetCard } from "@/lib/platform/liveCards";
import { GolfTripCompetitionMatchPreview } from "./GolfTripCompetitionMatchPreview";
import { GolfTripActionSheet } from "./GolfTripActionSheet";
import { GolfTripGames, type SavedGamesContext } from "./GolfTripGames";
import type { GameId } from "@/lib/platform/roundGames";
import { GolfTripChat } from "./GolfTripChat";
import { GolfTripVenue } from "./GolfTripVenue";
import { VenuePlaces } from "./VenuePlaces";
import { RatePlacesPrompt } from "./RatePlacesPrompt";
import { placesToRate, RATE_WITHIN_DAYS } from "@/lib/platform/venuePlaces";
import { ItineraryDetailSheet } from "./ItineraryDetailSheet";
import { shortPlace } from "@/lib/platform/placeLabel";
import { MomSection } from "./MomSection";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { SAMPLE_DATE_RANGE, SAMPLE_DESTINATION, SAMPLE_HIGHLIGHTS, SAMPLE_LEADER_SCORE, SAMPLE_SPLIT_SCORE, SAMPLE_TEAM_SCORE, SAMPLE_WEATHER, daysAfter, forcedStage, sampleNextRound, samplePlayers, sampleUpcoming } from "@/lib/dev/homeSections";
import type { MomRound } from "@/lib/platform/momNotifications";
import { TripMomentum, TripDraftWidget } from "./TripMomentum";
import type { MomentumEvent } from "@/lib/platform/tripPush";
import type { TeamDraft } from "@/lib/platform/teamDraft";
import { useTripMomentum, type TripAlertScope } from "./useTripMomentum";
import { getPlayerDisplayName } from "@/lib/data/players";
import styles from "./GolfTripHome.module.css";
import { GolfTripPredict } from "./GolfTripPredict";
import { tripSetupFromPreview } from "@/lib/platform/predictFromPreview";
import { usePredictSettings } from "@/lib/platform/predictSetting";

import { GOLF_TRIP_TABS as TABS, golfSections, type CompetitionStructure, type GolfTripNavigation } from "@/lib/platform/golfTripNavigation";
import { useGolfTripCompetitionPreview } from "./GolfTripCompetitionPreviewProvider";
import { usePlayerStats } from "@/lib/platform/playerStatsSetting";
import { setRoundRsvp, useRoundRsvps } from "@/lib/platform/roundRsvp";
import { useInAppScoring } from "@/lib/platform/inAppScoringSetting";
import { teamColor } from "@/lib/platform/teamColors";
import { TripTips } from "./TripTips";
type Tab = (typeof TABS)[number];

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
 * `now` (dev simulator only) is the trip clock, "YYYY-MM-DDTHH:mm:ss": Home's countdown, Live / Upcoming, Mom notes and the
 * Itinerary's opening day follow it (and keep ticking from it). Without it they use the device's clock.
 * `competitionKey` (dev) says which trip data this is, so the Golf tab follows that trip's Individual / Team picks in Settings.
 * `roundLive` shows the Scoring sheet: only while a round is being played (or finished but not yet submitted). Before the
 * first round, between rounds and after the trip there is nothing to score. Saved trips have no round data yet, so no sheet.
 * `navigation` optionally requests a shared tab/section; in-app navigation remains local between requests.
 * `onNavigationChange` optionally observes the actual tab/section; the dev wrapper supplies it only when embedded.
 */
export function GolfTripHome({ preview, settingsHref, backHref, previewMatch, weather, flights, travel: travelSeed, navigation, onNavigationChange, now: tripNow, competitionKey, savedCompetitionType, savedTeamColors, savedTeamDraft, organizer, onTravelChange, roundLive = false, opponentCardMatches, scoringPrefill, onScoringSubmit, submittedCard, scoringOwner, tripStats, scoreChanges, attesteeName, scoringEdits, onScoringCardChange, attestedStrokes, onAttestChange, scoringPlayerName, savedScoringCard, attesteeStrokes, scoresVerified, syncStatus, conflicts, onResolveConflict, resetScoringCard, corrections, onRequestCorrection, onDecideCorrection, correctionOpen, alertScope, signedInName, savedGames, organizerGames, spectator = false, tips, placesTripId, tapInCode }:
  { preview?: GolfTripDraft; settingsHref: string; backHref?: string; previewMatch?: GolfMatchPreview; weather?: Promise<TripWeather>; flights?: TripFlights;
    /** Everyone's travel (My Info, the Itinerary and the Home "what's next" cards). Only the dev mock trip has it for now. */
    travel?: TripTravel; navigation?: GolfTripNavigation; onNavigationChange?: (navigation: GolfTripNavigation) => void; now?: string; competitionKey?: string;
    /** Each team's color (TEAM_COLORS ids, Team A first) saved with the trip, until Settings picks them in this session. */
    savedTeamColors?: (string | null)[];
    /** The team draft saved with the trip (Home's Draftboard), until Settings changes it in this session. */
    savedTeamDraft?: TeamDraft;
    /** Dev: whether the signed-in preview account is the organizer (the default account is). */
    organizer?: boolean;
    /** Dev Just created trip: its saved Individual / Team picks (used until Settings is opened this session). */
    savedCompetitionType?: { individual: string | null; team: string | null };
    /** Told about every change to my travel (dev Just created trip saves it). */
    onTravelChange?: (travel: TripTravel) => void;
    roundLive?: boolean;
    alertScope?: TripAlertScope;
    /** The signed-in player's name: who "you" are in Games. */
    signedInName?: string | null;
    /** Saved trip: games are stored on the trip (tripId), you are meId, and your group is these players. */
    savedGames?: SavedGamesContext;
    /** Organizer → Games: round number → games every group plays that round. */
    organizerGames?: Record<string, GameId[]>;
    /** Dev preview only: whether the opponent's own scorecard agrees with mine (there is no second scorer yet). Without it, Save & Submit never shows. */
    opponentCardMatches?: boolean;
    /** Dev preview only: a finished-but-unsubmitted Scoring card (the "End of round" conditionals). */
    scoringPrefill?: ComponentProps<typeof GolfTripScoring>["prefill"];
    /** Player rounds: Submit & Save hands over the card; a round already saved for this player reopens locked. */
    onScoringSubmit?: ComponentProps<typeof GolfTripScoring>["onSubmit"]; submittedCard?: ComponentProps<typeof GolfTripScoring>["submittedCard"];
    /** Whose card this is (dev: the signed-in mock account). A different person gets a fresh Scoring sheet. */
    scoringOwner?: string;
    /** Dev preview (Player & Attest): trip stats and the organizer's own score changes under the Overview leaderboard. */
    tripStats?: TripStatsView; scoreChanges?: ScoreChangeLine[];
    /** Player & Attest data for the Scoring sheet: whose score I keep, a saved round's organizer changes, and the live card. */
    attesteeName?: string; scoringEdits?: ScoreEdit[]; onScoringCardChange?: (card: SheetCard) => void;
    /** The second phone: my attester's entries for me, and my entries for the player I attest. */
    attestedStrokes?: (number | null)[]; onAttestChange?: (strokes: (number | null)[], entered: boolean[]) => void;
    /** A saved trip's scoring: the signed-in golfer's name on the card, and their card in progress to start from. */
    scoringPlayerName?: string; savedScoringCard?: ComponentProps<typeof GolfTripScoring>["savedCard"];
    /** Live sync (saved trips): my attestee's own strokes, and whether my scores are saved and current. */
    attesteeStrokes?: (number | null)[]; scoresVerified?: boolean;
    /** Offline scoring (saved trips): sync status, conflicts to settle, and a card to put back on screen. */
    syncStatus?: ComponentProps<typeof GolfTripScoring>["syncStatus"]; conflicts?: ComponentProps<typeof GolfTripScoring>["conflicts"];
    onResolveConflict?: ComponentProps<typeof GolfTripScoring>["onResolveConflict"]; resetScoringCard?: ComponentProps<typeof GolfTripScoring>["resetCard"];
    /** Corrections (saved trips, Step 6). */
    corrections?: ComponentProps<typeof GolfTripScoring>["corrections"]; onRequestCorrection?: ComponentProps<typeof GolfTripScoring>["onRequestCorrection"];
    onDecideCorrection?: ComponentProps<typeof GolfTripScoring>["onDecideCorrection"]; correctionOpen?: ComponentProps<typeof GolfTripScoring>["correctionOpen"];
    /** Watch code (read only, no sign-in): the trip name and the Golf tab only — no other tabs, chat, notifications,
     *  settings, Games, Predict or scoring. */
    spectator?: boolean;
    /** Trip Builder: first-visit coach marks for this viewer (saved trips); shown once per account. */
    tips?: { profileId: string; isOrganizer: boolean };
    /** A real trip's id: Venue shows its real places (members only; spectators keep the old Venue, samples are dev / tour only). */
    tapInCode?: string | null; placesTripId?: string }) {
  const raw = useSyncExternalStore(subscribeNever, golfTripDraftSnapshot, () => "");
  const stored = useMemo(() => parseGolfTripDraft(raw), [raw]);
  const draft = preview ?? stored;
  const [selection, setSelection] = useState<{ navigation?: GolfTripNavigation; tab: Tab; golfNavigation?: GolfTripNavigation }>({ navigation, tab: navigation?.tab ?? "Home" });
  // A new external navigation request selects a tab; ordinary renders keep in-app navigation.
  if (selection.navigation !== navigation) setSelection({ navigation, tab: navigation?.tab ?? selection.tab });
  const tab = spectator ? "Golf" : selection.navigation === navigation ? selection.tab : navigation?.tab ?? selection.tab;
  const setTab = (tab: Tab) => setSelection({ navigation, tab, golfNavigation: tab === "Golf" ? { tab: "Golf", golfSection: structure.team ? "Competition" : "Overview" } : undefined });
  // A Home box or the Venue's Itinerary tile opens the Itinerary tab.
  const openItinerary = () => setTab("Itinerary");
  // Trip travel lives in page state for now (dev mock trip): edits in My Info rebuild the itinerary and Home cards right
  // away, and reset on reload. A different seed (e.g. the simulator switching data) starts fresh.
  const [travelState, setTravelState] = useState({ seed: travelSeed, travel: travelSeed });
  if (travelState.seed !== travelSeed) setTravelState({ seed: travelSeed, travel: travelSeed });
  const travel = travelState.travel;
  // Golf rounds always show on the itinerary: my tee times, and "Tee time TBD" for rounds I'm not on a tee time for yet.
  const tripRounds = plannedRounds(draft).map(round => ({ number: round.number, date: round.date, course: draft[`round${round.number}Course`] || "Course TBD" }));
  const itinerary = travel || tripRounds.length ? withGolfRounds(travel ? itineraryFor(travel) : [], tripRounds) : undefined;
  // Home's boxes, Venue and reminders only get what I'm going on (not invites I haven't accepted, or declined).
  const goingItinerary = itinerary && goingOnly(itinerary);
  // Play / Sit out: saved per trip (the dev data choice) under my name.
  const rsvpKey = competitionKey ?? "default";
  const myName = travel?.members.find(member => member.id === travel.meId)?.name || draft.yourName || "You";
  // Organizer-only controls (Team Draft's Edit): a saved trip says so; the dev preview by its signed-in account, else my role.
  const isOrganizer = alertScope?.isOrganizer ?? organizer ?? travel?.members.find(member => member.id === travel.meId)?.role === "organizer";
  // Venue → Add to itinerary: the place being added (the plan form is open) and what to call once it's saved.
  const [addingPlace, setAddingPlace] = useState<{ placeId: string; name: string; address?: string; done: () => void } | null>(null);
  const changeMyTravel = (change: MyTravelChange) => setTravelState((current) => {
    if (!current.travel) return current;
    const next = change.type === "add" ? addMyItem(current.travel, change.item)
      : change.type === "update" ? updateMyItem(current.travel, change.id, change.changes)
      : change.type === "invite" ? inviteToItem(current.travel, change.id, change.memberIds)
      : change.type === "respond" ? respondToInvite(current.travel, change.id, change.answer)
      : removeMyItem(current.travel, change.id);
    onTravelChange?.(next);
    return { ...current, travel: next };
  });
  useEffect(() => {
    if (tab !== "Golf") onNavigationChange?.({ tab });
  }, [tab, onNavigationChange]);
  const competitive = draft.includesTournament === "yes";
  // Which competition the trip has, for the Golf tab's sections: none without a tournament; otherwise the organizer's
  // Individual / Team choices (dev Settings), or, until those are picked, the format (match play = team matches, stroke /
  // Stableford = individual leaderboard; unknown = both).
  const sharedCompetition = useGolfTripCompetitionPreview();
  const sharedType = sharedCompetition?.competitionTypes[competitionKey ?? "default"] ?? savedCompetitionType;
  // Team colors (Settings → Competition → Team Color): the match box and match list draw each team in its color — the
  // "UP" highlight, the win % and its bar. Left = Team A, right = Team B; unpicked teams keep the gold / rose defaults.
  const teamColorIds = sharedCompetition?.teamColors[competitionKey ?? "default"] ?? savedTeamColors ?? [];
  // Momentum's Draftboard (before a team draft): Team Competition's draft settings.
  const teamDraft = competitive ? sharedCompetition?.teamDrafts[competitionKey ?? "default"] ?? savedTeamDraft : undefined;
  const draftRosterNames = [draft.rosterMaroon,draft.rosterWhite].flatMap(list => (list ?? "").split(",")).map(slug => slug.trim()).filter(Boolean).map(getPlayerDisplayName);
  const draftRoster = (draftRosterNames.length ? draftRosterNames.map(name => ({name,handicap:previewMatch?.leaderboard.find(row=>getPlayerDisplayName(row.golfer.name)===name)?.golfer.hcp})) : previewMatch?.leaderboard.map(row=>({name:getPlayerDisplayName(row.golfer.name),handicap:row.golfer.hcp})) ?? travel?.members.map(member=>({name:member.name,handicap:undefined})) ?? []).map(player => {
    const side = previewMatch?.matches.flatMap(match => (["left","right"] as const).flatMap((side,index) => match[side] ? normalizeCompetitor(match[side]!).golfers.map(golfer => ({name:getPlayerDisplayName(golfer.name),team:index===0?"A" as const:"B" as const})) : [])).find(item=>item.name===player.name)?.team;
    const maroonCount = (draft.rosterMaroon ?? "").split(",").filter(slug=>slug.trim()).length;
    return {...player,team:draftRosterNames.length ? (draftRosterNames.indexOf(player.name)<maroonCount?"A" as const:"B" as const) : side};
  });
  const teamColorVars = Object.fromEntries((["left", "right"] as const).flatMap((side, team) => {
    const color = teamColor(teamColorIds[team]);
    return color ? [[`--team-${side}`, color.base], [`--team-${side}-text`, color.text], [`--team-${side}-on-dark`, color.onDark]] : [];
  })) as CSSProperties;
  const scoring = previewMatch?.formatDef?.scoringMethod;
  const structure: CompetitionStructure = !competitive ? { individual: false, team: false }
    : sharedType ? { individual: Boolean(sharedType.individual), team: Boolean(sharedType.team) }
    : scoring === "match_play" ? { individual: false, team: true } : scoring ? { individual: true, team: false } : { individual: true, team: true };
  const [chatOpen, setChatOpen] = useState(false);
  const momentum = useTripMomentum(alertScope);
  const dates = tripDates(draft.startDate, draft.endDate);
  const dateRange = dates.length > 0 ? `${shortTripDate(dates[0])} – ${shortTripDate(dates[dates.length - 1])}` : "";

  // Scoring starts from the preview's featured golfer (the organizer) so the sheet has a round in progress to show.
  const firstCompetitor = previewMatch?.matches[0]?.left ? normalizeCompetitor(previewMatch.matches[0].left) : undefined;
  const you = firstCompetitor?.golfers[0]?.name;
  const yourHoles = previewMatch?.leaderboard.find((row) => row.golfer.name === you)?.holes;

  return <main className={`${styles.page} ${roundLive ? styles.pageWithScoring : ""} ${tab === "Golf" && preview && previewMatch ? styles.pageGolfPreview : ""}`}>
    {backHref && <Link href={backHref} className={styles.desktopBack}><ArrowLeft size={16} strokeWidth={2} aria-hidden />Golf Trips</Link>}
    <header className={styles.header}>
      {!spectator && <GolfTripHeader name={draft.tripName || "Your Golf Trip"} settingsHref={settingsHref} scope={competitionKey ?? "default"} spectator={false} onChat={() => setChatOpen(true)} />}
      {!spectator && <div className={`${styles.tabs} ${styles.tripTabs}`} role="tablist" aria-label="Trip sections">
        {TABS.map((name) => <button key={name} type="button" role="tab" aria-selected={tab === name} data-coach={name === "Golf" ? "golf-tab" : undefined}
          className={`${styles.tab} ${tab === name ? styles.tabActive : ""}`} onClick={event => {
            setTab(name);
            const button = event.currentTarget;
            if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
              button.getAnimations().forEach(animation => animation.cancel());
              button.animate([{ transform: "scale(1)" }, { transform: `scale(${1 + 3 / button.offsetWidth}, ${1 + 3 / button.offsetHeight})` }, { transform: "scale(1)" }], { duration: 220, easing: "ease-out" });
            }
          }}>{name}</button>)}
      </div>}
    </header>
    {/* After-visit ratings ("How was yesterday?"): dev preview only until phase 4 is built (project_specs.md). */}
    {/* After-visit ratings: a real trip asks about my recent plans made from Venue (places phase 4); the dev simulator shows samples. */}
    {placesTripId ? <RatePlacesPrompt tripId={placesTripId} visits={travel ? placesToRate(travel.items
      .filter((item) => item.details.placeId && travel.participants.some((p) => p.itemId === item.id && p.memberId === travel.meId && p.status === "going"))
      .map((item) => ({ placeId: item.details.placeId!, name: item.details.name || "Plan", startsAt: item.startsAt,
        when: `${itineraryWeekday(item.startsAt)} · ${itineraryTime(item.startsAt)}`, visitedOn: item.startsAt.slice(0, 10) })),
      (tripNow ?? new Date().toLocaleString("sv-SE")).slice(0, 10), [], RATE_WITHIN_DAYS) : []} /> : preview && <RatePlacesPrompt />}
    {addingPlace && travel && <GolfTripAddPlace travel={travel} placeId={addingPlace.placeId} name={addingPlace.name} address={addingPlace.address} onChange={changeMyTravel}
      onAdded={addingPlace.done} onClose={() => setAddingPlace(null)} />}
    <div className={`${styles.body} ${tab === "Golf" ? styles.golfBody : ""}`} role="tabpanel" aria-label={tab}>
      {tab === "Home" ? <><InfoAccount tapInCode={tapInCode} tripId={placesTripId} spectator={spectator} match={previewMatch} viewerName={savedGames?.group.find(player => player.profileId === savedGames.meId)?.name ?? signedInName} competitionTypes={structure.individual || structure.team ? { individual: sharedType?.individual ?? (structure.individual ? "Stroke Play" : null), team: sharedType?.team ?? (structure.team ? "2 Teams" : null) } : null} draftScope={competitionKey ?? "default"} teamNames={previewMatch?.sides.map(side=>side.name)} draft={draft} draftPlayers={draftRoster} teamDraft={teamDraft} isOrganizer={isOrganizer} momentumEvents={momentum.events} settingsHref={settingsHref} flights={flights} weather={weather} itinerary={goingItinerary} travel={travel} tripNow={tripNow} onOpenItinerary={openItinerary} players={previewMatch?.leaderboard.map(row => row.golfer)}
        rounds={plannedRounds(draft).map(round => ({ number: round.number, date: round.date, course: draft[`round${round.number}Course`] || "Course TBD", format: draft[`round${round.number}Format`] || (previewMatch && round.number === previewMatch.round ? previewMatch.formatDef?.label : undefined) }))}
        afterRound={previewMatch ? (roundLive || previewMatch.leaderboard.some(row => row.holes.every(strokes => strokes !== null)) ? previewMatch.round : previewMatch.round - 1) : 0}
        liveRound={roundLive && previewMatch ? { id: `round-${previewMatch.round}`, kind: "teeTime", title: `Round ${previewMatch.round} · ${previewMatch.course}`, startsAt: (tripNow ?? "").slice(0, 16) } : undefined} /></>
        : tab === "Golf" ? <>
          <div style={{ display: "contents", ...teamColorVars }}>
            <GolfSlides weather={weather} schedule={preview} now={tripNow} key={`${structure.individual}-${structure.team}`} previewMatch={previewMatch} structure={structure} rsvpKey={rsvpKey} navigation={selection.navigation === navigation ? selection.golfNavigation ?? navigation : navigation} onNavigationChange={onNavigationChange} tripStats={tripStats} scoreChanges={scoreChanges} roundStarted={roundLive} signedInName={signedInName} savedGames={savedGames} organizerGames={organizerGames} spectator={spectator} />
          </div>
        </>
        // Venue → place recommendations: dev preview only until phases 2-3 (project_specs.md); real trips keep the old Venue.
        // Venue → place recommendations (project_specs.md): a real trip's members get its real places; spectators keep
        // the old Venue (places are members-only); the dev simulator and the app tour show samples.
        : tab === "Venue" ? (placesTripId || (preview && !spectator)) ? <VenuePlaces destination={draft.destination ?? ""} tripId={placesTripId}
          center={coordinate(draft.destinationLatitude) !== undefined && coordinate(draft.destinationLongitude) !== undefined ? { latitude: coordinate(draft.destinationLatitude)!, longitude: coordinate(draft.destinationLongitude)! } : undefined}
          onAddToItinerary={placesTripId && travel ? (place, done) => setAddingPlace({ placeId: place.id, name: place.name, address: place.address, done }) : undefined} />
        : <GolfTripVenue draft={draft} settingsHref={settingsHref} today={tripNow?.slice(0, 10)}
          latitude={coordinate(draft.destinationLatitude)} longitude={coordinate(draft.destinationLongitude)}
          players={travel?.members.map(member => member.name) ?? []} items={goingItinerary ?? []} onOpenItinerary={openItinerary} />
        : tab === "Itinerary" ? <>
          {/* "+ Add" (the My Info add pop-ups) sits right under the Itinerary tab; then the day-by-day itinerary. */}
          {travel && <div className={styles.itineraryAddRow}><GolfTripAddTravel travel={travel} onChange={changeMyTravel} className={styles.itineraryAddPill} /></div>}
          <ItineraryList items={itinerary} tripDays={dates} today={tripNow?.slice(0, 10)} now={tripNow?.slice(0, 16)} rsvpKey={rsvpKey} myName={myName} activeRound={roundLive && previewMatch?.leaderboard.some(row => row.holes.some(strokes => strokes === null)) ? previewMatch.round : undefined}
            onRespond={(id, answer) => changeMyTravel({ type: "respond", id, answer })}
            onDelete={id => changeMyTravel({ type: "remove", id: id.split(":")[0] })}
            canDelete={id => Boolean(travel?.items.some(item => item.id === id.split(":")[0] && item.source === "mine" && item.createdBy === travel.meId))}
            whoFor={id => travel ? travel.participants.filter(p => p.itemId === id.split(":")[0] && p.status === "going").map(p => travel.members.find(m => m.id === p.memberId)?.name ?? "").filter(Boolean) : []} />
        </>
        : <Card title={tab}><Empty>Coming soon</Empty></Card>}
    </div>
    {tips && <TripTips profileId={tips.profileId} isOrganizer={tips.isOrganizer} />}
    {roundLive && <GolfTripScoring key={`${scoringOwner ?? "me"}-${scoringPrefill ? `prefilled-${scoringPrefill.otherCardDiff ? "mismatch" : "match"}` : "blank"}`} prefill={scoringPrefill} onSubmit={onScoringSubmit} submittedCard={submittedCard} par={previewMatch?.par} parIsReference={previewMatch?.parIsReference} initialHoles={yourHoles} courseName={previewMatch?.course} playerName={scoringPlayerName ?? (you ? getPlayerDisplayName(you) : draft.yourName || "You")} opponentCardMatches={opponentCardMatches}  attesteeName={attesteeName} edits={scoringEdits} onCardChange={onScoringCardChange} attestedStrokes={attestedStrokes} onAttestChange={onAttestChange} savedCard={savedScoringCard} attesteeStrokes={attesteeStrokes} scoresVerified={scoresVerified} syncStatus={syncStatus} conflicts={conflicts} onResolveConflict={onResolveConflict} resetCard={resetScoringCard} corrections={corrections} onRequestCorrection={onRequestCorrection} onDecideCorrection={onDecideCorrection} correctionOpen={correctionOpen} />}
    <GolfTripChat open={chatOpen} onClose={() => setChatOpen(false)} tripName={draft.tripName || "Your Golf Trip"}
      members={[...new Set(previewMatch?.matches.flatMap(match => [match.left, match.right].flatMap(side => side ? normalizeCompetitor(side).golfers.map(golfer => getPlayerDisplayName(golfer.name)) : [])) ?? [])].filter(name => name !== getPlayerDisplayName(you ?? draft.yourName ?? ""))} />
  </main>;
}

/** A saved coordinate from the trip answers, or undefined when missing or not a number. */
const coordinate = (value: string | undefined) => value && Number.isFinite(Number(value)) ? Number(value) : undefined;

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

  const nextImportantEvent: InfoEvent | null = rounds[0]
    ? {
        host: `Round ${rounds[0].number}`,
        title: `${draft[`round${rounds[0].number}Course`] || "Golf day"} · ${rounds[0].date ? shortTripDate(rounds[0].date) : `Day ${rounds[0].dayNumber}`}`,
        art: ART.golf,
        icon: Flag,
        badge: "Set",
      }
    : null;

  const sections: Record<HomeSection, { summary: string; rows: ReactNode }> = {
    Golf: {
      summary: nextImportantEvent ? "Round coming up" : "Golf plan",
      rows: <>
        {heading("Rounds")}
        {nextImportantEvent ? <EventRow event={{ ...nextImportantEvent, lines: [{ icon: CalendarDays, text: `${nextImportantEvent.title}` }] }} /> : <EventRow event={{ host: "Golf", title: "Round 1 · Course TBD", art: ART.golf, icon: Flag, badge: "To do", lines: [{ icon: CalendarDays, text: "Add the tee time and course" }] }} />}
        {heading("Tournament")}
        {(() => {
          const tournamentBadge: InfoEvent['badge'] = tournament ? "Set" : "To do";
          return <EventRow event={{ host: "Tournament", title: tournament || "Friendly side game", art: ART.tournament, icon: Trophy, badge: tournamentBadge, lines: tournament ? [{ icon: CalendarDays, text: tournament }] : [{ icon: Trophy, text: "Add the event info or side match" }] }} />;
        })()}
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

/** Home's quick weather (right of "Your trip to"): degrees with a condition icon, the condition, low / high, and the chance of rain. */
function QuickWeather({ weather }: { weather: Promise<TripWeather> }) {
  const result = use(weather);
  if (result.status !== "ok") return <div className={styles.quickWeather}><span className={styles.quickCondition}>Weather unavailable</span></div>;
  const now = result.weather;
  const lowHigh = [now.low !== null && `L ${now.low}°`, now.high !== null && `H ${now.high}°`].filter(Boolean).join("  ");
  return <div className={styles.quickWeather} aria-label="Weather now">
    <span className={styles.quickTemp}><ConditionIcon condition={now.condition} />{now.temperature !== null ? `${now.temperature}°` : "—°"}</span>
    {now.condition && <span className={styles.quickCondition}>{now.condition}</span>}
    {lowHigh && <span className={styles.quickDetail}>{lowHigh}</span>}
    {now.precipitationChance !== null && <span className={styles.quickDetail}><Droplets size={13} strokeWidth={2.25} aria-hidden />{now.precipitationChance}%<span className={styles.srOnly}> chance of precipitation</span></span>}
  </div>;
}

/** A weather icon from the forecast's words ("Sunny", "Partly Cloudy", "Chance Rain Showers", …). */
function ConditionIcon({ condition }: { condition: string | null }) {
  const words = (condition ?? "").toLowerCase();
  const props = { size: 22, strokeWidth: 2, "aria-hidden": true } as const;
  if (/thunder|storm/.test(words)) return <CloudLightning {...props} />;
  if (/snow|sleet|flurr|ice/.test(words)) return <CloudSnow {...props} />;
  if (/rain|shower|drizzle/.test(words)) return <CloudRain {...props} />;
  if (/fog|haze|smoke/.test(words)) return <CloudFog {...props} />;
  if (/partly|mostly sunny|mostly clear|few clouds/.test(words)) return <CloudSun {...props} />;
  if (/cloud|overcast/.test(words)) return <Cloud {...props} />;
  return <Sun {...props} />;
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
/** `roundStarted`: the organizer has begun the current round — its matches show THRU instead of tee times. */
function GolfSlides({ weather, previewMatch: sourceMatch, schedule, now, structure, rsvpKey = "default", navigation, onNavigationChange, tripStats, scoreChanges, roundStarted = false, signedInName, savedGames, organizerGames, spectator = false }: { weather?: Promise<TripWeather>; spectator?: boolean; signedInName?: string | null; savedGames?: SavedGamesContext; organizerGames?: Record<string, GameId[]>; previewMatch?: GolfMatchPreview; schedule?: GolfTripDraft; now?: string; structure: CompetitionStructure; rsvpKey?: string; navigation?: GolfTripNavigation; onNavigationChange?: (navigation: GolfTripNavigation) => void; tripStats?: TripStatsView; scoreChanges?: ScoreChangeLine[]; roundStarted?: boolean }) {
  const rounds = useMemo(() => schedule ? plannedRounds(schedule) : [], [schedule]);
  const [chosenRound, setChosenRound] = useState<number | null>(null);
  // Round pills: keep the picked round's pill in view (Round 8 would otherwise start off the edge).
  const roundPillsRef = useRef<HTMLDivElement>(null);
  const pickedRound = chosenRound ?? sourceMatch?.round;
  const selected = rounds.find(round => round.number === chosenRound) ?? rounds.find(round => round.number === sourceMatch?.round);
  const previewMatch = useMemo(() => {
    if (!sourceMatch || !selected || selected.number === sourceMatch.round) return sourceMatch;
    const snapshot = sourceMatch.roundStandings?.find(row => row.round === selected.number);
    return { ...sourceMatch, round: selected.number, roundDate: selected.date,
      course: schedule?.['round' + selected.number + 'Course'] || 'Course TBD',
      format: schedule?.['round' + selected.number + 'Format'] || 'Format not set', formatDef: undefined,
      matches: sourceMatch.matches.filter(pairing => pairing.round === selected.number), leaderboard: snapshot?.leaderboard ?? [], par: snapshot?.par ?? sourceMatch.par,
    };
  }, [sourceMatch, selected, schedule]);
  // Competition is about the round being played: only that round's matches (matches without a round count as current).
  const roundMatch = useMemo(() => previewMatch && { ...previewMatch, matches: previewMatch.matches.filter(pairing => (pairing.round ?? previewMatch.round) === previewMatch.round) }, [previewMatch]);
  const latestRound = sourceMatch?.roundStandings?.at(-1)?.round ?? sourceMatch?.round ?? 1;
  const viewingPast = !!previewMatch && previewMatch.round < latestRound;
  const { label: standingsFormat, sharedBall } = describeStandingsFormat(previewMatch?.format);
  const standingsRound = sourceMatch?.roundStandings?.find(row => row.round === previewMatch?.round)?.standingsRound ?? previewMatch?.round;
  const leaderboardMatch = previewMatch && sharedBall && standingsRound !== undefined && standingsRound !== previewMatch.round
    ? { ...previewMatch, round: standingsRound, format: schedule?.["round" + standingsRound + "Format"] ?? previewMatch.format, formatDef: undefined }
    : previewMatch;
  const matchOffset = sourceMatch && previewMatch ? competitionMatchOffset(sourceMatch, previewMatch.round) : 0;
  const trackRef = useRef<HTMLDivElement>(null);
  // Competitive trips use one Leaderboard pill and an optional Indi / Team selector.
  const playerStats = usePlayerStats();
  // Organizer → Predict on: the prediction market's tab comes last. The app simulator's Predict card (dev only) opens it
  // even while the organizer has it off, so it can be previewed.
  // Spectators (watch code): no Games or Predict.
  const sections = golfSections(structure, playerStats || spectator)
    .filter(section => (!spectator || section.id !== "Games") && !(structure.team && !structure.individual && section.id === "Overview"))
    .map(section => section.id === "Competition" ? { ...section, label: "Leaderboard" } : section);
  // Organizer → Predict off: no Predict button and no Predict sheet.
  const predictOn = usePredictSettings().on;
  const predictSetup = useMemo(() => previewMatch && predictOn && !spectator ? tripSetupFromPreview(previewMatch, structure) : null, [previewMatch, structure, predictOn, spectator]);
  // No competition: the Overview box is the day's round (course, tee times, who's playing — not those sitting out).
  const noComp = !structure.individual && !structure.team;
  // Individual only: the same box, split — the round on the left, the leaderboard's top 5 on the right.
  const individualOnly = structure.individual && !structure.team;
  // Team-only trips open their matchup view directly under Leaderboard.
  const teamOnly = structure.team && !structure.individual;
  const rsvps = useRoundRsvps(rsvpKey);
  const roundRsvps = previewMatch ? rsvps[previewMatch.round] ?? {} : {};
  const sittingOut = new Set(Object.keys(roundRsvps).filter(name => roundRsvps[name] === "out"));
  // No competition: under the box, the day's scores best → worst when players score in the app; nothing when they don't.
  const inAppScoring = useInAppScoring();
  const availableSlides = [...sections.map(section => section.id), ...(predictSetup && !noComp ? ["Predict" as const] : [])];
  const requestedSection = (navigation?.tab === "Golf" ? navigation.golfSection : undefined) ?? (structure.team ? "Competition" : "Overview");
  const requested = Math.max(0, availableSlides.findIndex(section => section === (teamOnly && requestedSection === "Overview" ? "Competition" : requestedSection)));
  const [selection, setSelection] = useState({ navigation, active: requested });
  if (selection.navigation !== navigation) setSelection({ navigation, active: requested });
  const selectedActive = selection.navigation === navigation ? selection.active : requested;
  const predictActive = availableSlides[selectedActive] === "Predict";
  const active = predictActive ? 0 : selectedActive;
  const setActive = (active: number) => setSelection({ navigation, active });
  // Games and Stats sit outside the swipe strip (like Games always has); the strip holds Leaderboard / Matches.
  const offStrip = (id: string | undefined) => id === "Games" || id === "Stats" || id === "Predict";
  const gamesActive = offStrip(availableSlides[active]);
  const statsActive = availableSlides[active] === "Stats";
  const golfSection = predictActive ? "Predict" : availableSlides[active] ?? "Overview";
  useEffect(() => {
    const strip = roundPillsRef.current;
    const pill = strip?.querySelector<HTMLElement>("[aria-selected=true]");
    if (strip && pill) strip.scrollTo({ left: Math.max(0, pill.offsetLeft - strip.offsetLeft - (strip.clientWidth - pill.offsetWidth) / 2), behavior: "smooth" });
  }, [pickedRound, golfSection]);
  useEffect(() => {
    onNavigationChange?.({ tab: "Golf", golfSection });
  }, [golfSection, onNavigationChange]);

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
    if (!offStrip(availableSlides[index])) requestAnimationFrame(() => {
      const track = trackRef.current;
      if (track) track.scrollTo({ left: index * track.clientWidth, behavior: "instant" });
    });
  };
  const onScroll = () => {
    const track = trackRef.current;
    if (!predictActive && !gamesActive && track && track.clientWidth > 0) setActive(Math.round(track.scrollLeft / track.clientWidth));
  };

  // Order: section pills, optional Indi / Team selector, board, course / round line, then section content.

  return <>

    {/* Golf sections: the words themselves evenly spaced (equal gaps between them and at both ends), since their lengths differ. */}
    <GolfDayBoard match={sourceMatch} structure={structure} schedule={schedule} roundRsvps={rsvps} viewerName={savedGames?.group.find(player => player.profileId === savedGames.meId)?.name ?? signedInName} spectator={spectator}
      sittingOut={!!sourceMatch && (rsvps[sourceMatch.round]?.[savedGames?.group.find(player => player.profileId === savedGames.meId)?.name ?? signedInName ?? ""] === "out")} >
    <div className={`${styles.tabs} ${styles.sectionTabs} ${styles.golfBoardTabs}`} role="tablist" aria-label="Golf sections">
      {[...sections, ...(predictSetup && !noComp ? [{ id: "Predict" as const, label: "Predict" }] : [])].filter(({ id }) => !(structure.individual && structure.team && id === "Competition")).map(({ id, label }) => {
        const index = availableSlides.indexOf(id);
        const selected = id === "Predict" ? predictActive : !predictActive && (active === index || (id === "Overview" && structure.individual && structure.team && golfSection === "Competition"));
        return <button key={id} type="button" role="tab" aria-selected={selected}
          className={`${styles.tab} ${selected ? styles.tabActive : ""}`} onClick={() => goTo(selected && id !== "Predict" ? active : index)}>{label}</button>;
      })}
    </div>
    </GolfDayBoard>
    {structure.individual && structure.team && !gamesActive && !predictActive && <div className={`${styles.tabs} ${styles.tripTabs} ${styles.leaderboardKind}`} role="group" aria-label="Leaderboard type">
      <button type="button" className={`${styles.tab} ${golfSection === "Competition" ? styles.tabActive : ""}`} aria-pressed={golfSection === "Competition"} onClick={() => goTo(availableSlides.indexOf("Competition"))}>Team</button>
      <button type="button" className={`${styles.tab} ${golfSection === "Overview" ? styles.tabActive : ""}`} aria-pressed={golfSection === "Overview"} onClick={() => goTo(availableSlides.indexOf("Overview"))}>Indi</button>
    </div>}
    {/* Team leaderboard board (owner, 2026-11-10): back under the Indi / Team selector whenever Team is picked (team-only
        trips: under the Leaderboard pill) — team points, TO WIN, win %, stats and Predict, in the 166px Golf board. */}
    {previewMatch && structure.team && golfSection === "Competition" && !predictActive && <div className={styles.golfTop}>
      <div className={styles.golfTopSize}>
        <GolfTournamentSummary match={previewMatch} tripStats={tripStats} onPredict={predictSetup ? () => goTo(availableSlides.indexOf("Predict")) : undefined} />
      </div>
    </div>}
    {/* The board: a summary for the section — the whole tournament on Overview, the round being played on Competition,
        games (placeholder) on Games. All three share one grid cell so nothing below moves when it switches. */}
    {/* Stats has the space to itself; Predict overlays the leaderboard. */}
    {/* Rounds (owner 2026-11-10): a pill per round number instead of the date / course / round / format header; the
        picked round's course and format sit under the pills. */}
    {previewMatch && golfSection === "Competition" && !predictActive && rounds.length > 0 && <div className={styles.roundPicker}>
      <div ref={roundPillsRef} className={styles.roundPills} role="tablist" aria-label="Rounds">
        {rounds.map(round => <button key={round.number} type="button" role="tab" aria-selected={round.number === previewMatch.round}
          className={`${styles.roundPill} ${round.number === previewMatch.round ? styles.roundPillActive : ""}`} aria-label={`Round ${round.number}`}
          onClick={() => setChosenRound(round.number)}>Round {round.number}</button>)}
      </div>
      <p className={styles.roundPickerInfo}>
        {/* Course on the left, format on the right (owner 2026-11-10). */}
        <span className={styles.roundPickerCourse}>{schedule?.[`round${previewMatch.round}Course`] || previewMatch.course || "Course TBD"}</span>
        <span className={styles.roundPickerFormat}>{schedule?.[`round${previewMatch.round}Format`] || previewMatch.format || "Format not set"}</span>
      </p>
    </div>}
    {!gamesActive && active === 0 && previewMatch && !noComp && !teamOnly && (viewingPast || sharedBall) && <div className={styles.standingsNotice} role="status">
      <div><strong>Standings after Round {standingsRound}</strong>{sharedBall && <p>{standingsFormat} being played in Round {previewMatch.round}</p>}</div>
      {viewingPast && <button type="button" onClick={() => setChosenRound(latestRound)}>View current</button>}
    </div>}
    <div ref={trackRef} className={styles.slides} style={gamesActive ? { display: "none" } : undefined} onScroll={onScroll}>
      {sections.filter(({ id }) => !offStrip(id)).map(({ id: name, label }, i) => <div key={name} className={styles.slide} role="tabpanel" aria-label={structure.individual && structure.team ? (name === "Overview" ? "Indi leaderboard" : "Team leaderboard") : label} inert={active !== i}>
        {name === "Overview"
          ? noComp && !inAppScoring ? null
          : teamOnly && previewMatch ? <GolfTeeSheet match={previewMatch} sittingOut={sittingOut} />
          : previewMatch ? <GolfTripLeaderboard match={leaderboardMatch ?? previewMatch} byToday={noComp} tripStats={tripStats} /> : <Card title="Score Overview"><Empty>Your leaderboard and round scores will show here</Empty></Card>
          : previewMatch && roundMatch ? <GolfTripCompetitionMatchPreview key={previewMatch.round} initialMatch={previewMatch} matchOffset={matchOffset} viewRound={previewMatch.round} roundStarted={roundStarted && previewMatch.round === sourceMatch?.round} draftScope={rsvpKey} /> : <Card title="Competition"><Empty>Your matchups will show here</Empty></Card>}
      </div>)}
    </div>
    <div role="tabpanel" aria-label="Games" hidden={!gamesActive || statsActive || predictActive}>
      {previewMatch ? <GolfTripGames match={previewMatch} rounds={rounds.map(round => round.number)} signedInName={signedInName} saved={savedGames} organizerGames={organizerGames} /> : <Card title="Games"><Empty>Golf games are coming soon</Empty></Card>}
    </div>
    {/* Stats (only while Player Stats is on): the trip's stats from the scorecards players have recorded. */}
    {sections.some(({ id }) => id === "Stats") && <div role="tabpanel" aria-label="Stats" hidden={!statsActive}>
      {tripStats ? <Card title={spectator ? "Round Stats" : "Trip Stats"}><GolfTripStats stats={tripStats} changes={scoreChanges} /></Card> : <Card title="Stats"><Empty>Stats will show here once players record rounds</Empty></Card>}
    </div>}
    {predictSetup && !noComp && predictActive && <PredictSheet onClose={() => goTo(0)}><GolfTripPredict setup={predictSetup} /></PredictSheet>}
  </>;
}

function PredictSheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog.close(); document.body.style.overflow = overflow; };
  }, []);
  return createPortal(<dialog ref={dialogRef} className={styles.predictSheet} aria-label="Predict" onCancel={onClose}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientY < rect.top || event.clientY > rect.bottom || event.clientX < rect.left || event.clientX > rect.right) onClose();
    }}>
    <header className={styles.predictSheetHeader}><span>Predict</span><button type="button" onClick={onClose} aria-label="Close Predict" autoFocus><X size={22} aria-hidden="true" /></button></header>
    {children}
  </dialog>, document.body);
}

type EventLine = { icon: LucideIcon; text: string };
const TRIP_BADGES = ["Set", "Waitlisted", "Going", "Invited", "To do"] as const;
type TripBadge = (typeof TRIP_BADGES)[number];
/** One row in the event-list style. `art` stands in for a picture (an optional icon sits on it); `lines` skips empty entries. */
type InfoEvent = { host: string; title: string; art: string; icon?: LucideIcon; kindIcon?: ItineraryKind; lines?: (EventLine | false | "" | undefined)[];
  badge?: TripBadge; price?: string };

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

    {sheetSection && <GolfTripActionSheet label="Add trip item" onClose={() => setSheetSection(null)}
      actions={[...quickActionRows]} onAction={addQuickEntry} />}

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
      {event.kindIcon && <TravelKindIcon kind={event.kindIcon} size={26} />}
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

/** A Home "what's next" card: what it is, the headline, when, and one more line. Opens Info → Itinerary. */


/**
 * Info → Itinerary: one day at a time. A day selector (< weekday / date >) over a line, then that day's plans in time order.
 * Days run from the trip's first day (plus any earlier day with something on it) to its last; no < on the first, no > on the last.
 * Opens on today when today is one of the days.
 */
function ItineraryList({ items, tripDays, today: tripToday, whoFor, rsvpKey = "default", myName = "You", now: tripNowProp, activeRound, onRespond, onDelete, canDelete }: {
  items?: ItineraryItem[]; tripDays: string[]; today?: string; whoFor?: (itemId: string) => string[];
  /** Play / Sit out on golf rounds: which trip, and who I am. */
  rsvpKey?: string; myName?: string; activeRound?: number;
  /** Trip clock "YYYY-MM-DDTHH:mm" (dev); otherwise the device's time when the list opened. */
  now?: string;
  /** Decline / Accept on something another member invited me to (the travel item's id). */
  onRespond?: (itemId: string, answer: "accept" | "decline") => void;
  onDelete?: (itemId: string) => void;
  canDelete?: (itemId: string) => boolean;
}) {
  const rsvps = useRoundRsvps(rsvpKey);
  // Sit out asks first (it takes me out of any individual competition for that round).
  const [confirmSitOut, setConfirmSitOut] = useState<number | null>(null);
  // Decline (an invite) asks first too.
  const [confirmDecline, setConfirmDecline] = useState<string | null>(null);
  const [deviceNow] = useState(() => localNow(new Date()));
  const nowStamp = tripNowProp ?? deviceNow;
  const days = itineraryByDay(items ?? [], tripDays);
  const [picked, setPicked] = useState<number | null>(null);
  // Tap a plan's box → its detail sheet slides up.
  const [openItem, setOpenItem] = useState<ItineraryItem | null>(null);
  const [todayIso] = useState(() => localNow(new Date()).slice(0, 10));
  // Arrows: the day slides away (50 ms), then the next one slides in from that side (50 ms) — 100 ms in all.
  const [slide, setSlide] = useState<{ to: number; dir: 1 | -1; stage: "out" | "in" } | null>(null);
  if (!days.length) return <Card title="Itinerary"><Empty>Nothing on the itinerary yet</Empty></Card>;
  const today = days.findIndex(({ day }) => day === (tripToday ?? todayIso));
  const index = Math.min(days.length - 1, picked ?? Math.max(0, today));
  const { day, items: dayItems } = days[index];
  const go = (dir: 1 | -1) => {
    if (slide) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPicked(index + dir);
    else setSlide({ to: index + dir, dir, stage: "out" });
  };
  const slideClass = !slide ? "" : slide.stage === "out" ? (slide.dir === 1 ? styles.dayOutLeft : styles.dayOutRight) : (slide.dir === 1 ? styles.dayInRight : styles.dayInLeft);
  const onSlideEnd = () => {
    if (slide?.stage === "out") { setPicked(slide.to); setSlide({ ...slide, stage: "in" }); }
    else setSlide(null);
  };
  return <div className={styles.events}>
    <section className={styles.infoSection} aria-label={`${itineraryWeekday(day)}, ${itineraryLongDate(day)}`}>
      <div className={styles.itineraryDayHeading}>
        {index > 0 ? <button type="button" className={styles.itineraryDayStep} aria-label="Previous day" onClick={() => go(-1)}><ChevronLeft size={22} strokeWidth={2.25} aria-hidden /></button> : <span className={styles.itineraryDayStep} aria-hidden />}
        <h2 className={`${styles.itineraryDayTitle} ${slideClass}`}><span>{itineraryWeekday(day)}</span><small>{itineraryLongDate(day)}</small></h2>
        {index < days.length - 1 ? <button type="button" className={styles.itineraryDayStep} aria-label="Next day" onClick={() => go(1)}><ChevronRight size={22} strokeWidth={2.25} aria-hidden /></button> : <span className={styles.itineraryDayStep} aria-hidden />}
      </div>
      <div className={`${styles.itineraryDayBody} ${slideClass}`} onAnimationEnd={event => { if (event.target === event.currentTarget) onSlideEnd(); }}>
      {dayItems.length === 0 && <p className={styles.itineraryEmptyDay}>Nothing planned for today.</p>}
      {/* Each of your plans that day: its type above, then a raised cream box (like Competition → Format rounds) with the time over a line, the headline and details. Tap for its sheet. */}
      {dayItems.map((item, index) => {
        // Golf rounds: my Play / Sit out. Playing adds "Playing" bottom right; sitting out collapses the box to its top row.
        // Invites work the same way: Accept = "Going", Decline = collapsed (and can still Accept later).
        const round = item.round, invite = item.invite;
        const isLive = round !== undefined && round === activeRound;
        const choice = round !== undefined ? rsvps[round]?.[myName] ?? "in" : invite ? (invite.status === "going" ? "in" : invite.status === "declined" ? "out" : undefined) : undefined;
        // Play / Sit out can change until the round's tee times have started: my tee time, or (no tee time yet) the end of
        // the round's day.
        const locked = round !== undefined && nowStamp >= (item.timeTbd ? `${item.startsAt.slice(0, 10)}T23:59` : item.startsAt.slice(0, 16));
        return <div key={item.id} className={styles.itineraryEntry}>
        {/* The type sits above its box in cream, left-aligned, over a line — once for a run of the same type back to back. */}
        {(index === 0 || itineraryCategory(dayItems[index - 1]) !== itineraryCategory(item)) && <h3 className={styles.itineraryType}>{itineraryCategory(item)}</h3>}
        <div className={styles.itineraryBoxWrap}>
          <button type="button" className={styles.itineraryBox} data-golf={round !== undefined} data-round={round !== undefined || invite !== undefined} data-rsvp={choice} aria-haspopup="dialog" aria-label={`${itineraryCategory(item)}: ${item.title}, ${item.timeTbd ? "tee time to be decided" : itineraryTime(item.startsAt)}${invite ? `, invited by ${invite.from || "a trip member"}${choice === "in" ? ", going" : choice === "out" ? ", declined" : ""}` : choice === "in" ? isLive ? ", live" : ", playing" : choice === "out" ? ", sitting out" : ""}`} onClick={() => setOpenItem(item)}>
            <div className={styles.itineraryBoxTop}>
              <span className={styles.itineraryBoxTime}>{item.timeTbd ? "Tee time TBD" : itineraryTime(item.startsAt)}</span>
            </div>
            {choice !== "out" && <>
              <span className={styles.itineraryBoxTitle}>{item.title}</span>
              {item.detail && <span className={styles.itineraryBoxTime}>{item.detail}</span>}
              {invite && <span className={styles.itineraryInvitedBy}>Invited by {invite.from || "a trip member"}</span>}
            </>}
            {choice === "in" && <span className={styles.itineraryPlaying} data-live={isLive}>{isLive ? "Live" : invite ? "Going" : "Playing"}</span>}
          </button>
          {/* Sit out (red), then Play (green), side by side in the box's top row, level with the tee time; the organizer sees
              the choice when picking tee-time players. */}
          {round !== undefined && <div className={styles.rsvpButtons} role="group" aria-label={`Round ${round}: play or sit out`}>
            <button type="button" className={styles.rsvpSit} aria-pressed={choice === "out"} disabled={locked} onClick={() => { if (choice !== "out") setConfirmSitOut(round); }}>Sit out</button>
            <button type="button" className={styles.rsvpPlay} aria-pressed={choice === "in"} disabled={locked} onClick={() => setRoundRsvp(rsvpKey, round, myName, "in")}>Play</button>
          </div>}
          {/* An invite: Decline (red), then Accept (green), in the same spot. */}
          {invite && <div className={styles.rsvpButtons} role="group" aria-label={`Invite from ${invite.from || "a trip member"}: accept or decline`}>
            <button type="button" className={styles.rsvpSit} aria-pressed={choice === "out"} onClick={() => { if (choice !== "out") setConfirmDecline(invite.itemId); }}>Decline</button>
            <button type="button" className={styles.rsvpPlay} aria-pressed={choice === "in"} onClick={() => onRespond?.(invite.itemId, "accept")}>Accept</button>
          </div>}
        </div>
      </div>;
      })}
      </div>
    </section>
    {openItem && <ItineraryDetailSheet item={openItem} going={whoFor?.(openItem.id) ?? []} onClose={() => setOpenItem(null)} onDelete={canDelete?.(openItem.id) ? () => onDelete?.(openItem.id) : undefined} />}
    {confirmSitOut !== null && <div className={styles.deleteOverlay} role="dialog" aria-modal="true" aria-label="Sit out confirmation">
      <div className={styles.deleteDialog}>
        <p className={styles.deletePrompt}>Sitting out of this round will remove you from any individual competition.</p>
        <button type="button" className={styles.cancelButton} onClick={() => setConfirmSitOut(null)}>Go back</button>
        <button type="button" className={styles.deleteButton} onClick={() => { setRoundRsvp(rsvpKey, confirmSitOut, myName, "out"); setConfirmSitOut(null); }}>Sit Out</button>
      </div>
    </div>}
    {confirmDecline !== null && <div className={styles.deleteOverlay} role="dialog" aria-modal="true" aria-label="Decline confirmation">
      <div className={styles.deleteDialog}>
        <p className={styles.deletePrompt}>Decline this? It stays on your itinerary, and you can still accept later.</p>
        <button type="button" className={styles.cancelButton} onClick={() => setConfirmDecline(null)}>Go back</button>
        <button type="button" className={styles.deleteButton} onClick={() => { onRespond?.(confirmDecline, "decline"); setConfirmDecline(null); }}>Decline</button>
      </div>
    </div>}
  </div>;
}

/** Info → Flights card (in the first account-card slot): your next flight and how many you've saved; opens the Flights page. */
/** The Big Board's slide for a trip with no itinerary: the next flight (or Add your flights), opening Flights. */
function flightsSlide(flights?: TripFlights): BoardSlide {
  const summary = flights?.summary;
  const next = summary?.next;
  const counts = summary ? flightCounts(summary) : "";
  const when = next ? flightTime(next.departureLocal) : counts ? "No upcoming flights" : "Add your flights";
  return { key: "flights", title: next ? `${next.flightNumber} · ${next.departureAirport} → ${next.arrivalAirport}` : "Flights", href: flights?.href ?? undefined,
    ariaLabel: `Flights: ${next ? `next ${next.flightNumber}` : counts || "add your flights"}`,
    body: <BoardSlideBody icon={<Plane size={14} strokeWidth={2} aria-hidden />} kind="Flights" status={next ? "NEXT" : undefined} when={when} detail={counts || undefined} /> };
}

/**
 * Info tab, banking-app style (layout only, made-up numbers): a maroon top saying "Your trip to {destination}", a swipeable
 * row of two cards with a dot for each (the filled dot follows the swipe), then the upcoming trip and planned rounds. It runs edge to edge and down to the bottom of the screen.
 */
function InfoAccount({ tripId, tapInCode, spectator = false, match, viewerName, competitionTypes = null, draftScope, teamNames, draft, draftPlayers, teamDraft, isOrganizer, momentumEvents, settingsHref, flights, weather, itinerary, travel, tripNow, liveRound, rounds, afterRound, onOpenItinerary, players = [] }: {
  /** A real trip's id, for its invite link (left out = a preview with a sample link). */
  tripId?: string; tapInCode?: string | null;
  /** Watch-code spectators: no Invite players. */
  spectator?: boolean;
  /** The trip's scores (the Golf tab's match data), for the Big Board's top half. */
  match?: GolfMatchPreview;
  /** The signed-in player's name, for Competition's Your team / Teammates. */
  viewerName?: string | null;
  /** Settings → Competition's Individual / Team choices (null = no competition), for the Competition section. */
  competitionTypes?: { individual: string | null; team: string | null } | null;
  draftScope: string; teamNames?: string[]; draft: GolfTripDraft; settingsHref: string; draftPlayers: import("./TripDraftRoom").DraftRoomPlayer[];
  /** Momentum: the team draft (its Draftboard) and the round highlights, for this trip. */
  teamDraft?: TeamDraft; momentumEvents: MomentumEvent[];
  /** The organizer gets Edit on Team Draft. */
  isOrganizer: boolean; flights?: TripFlights; weather?: Promise<TripWeather>; itinerary?: ItineraryItem[]; travel?: TripTravel; tripNow?: string;
  /** The golf round being played right now (its Scoring sheet is up): the only thing marked LIVE. */
  liveRound?: ItineraryItem; onOpenItinerary: () => void;
  /** For the Mom section's next-round reminder. */
  rounds?: MomRound[]; afterRound?: number;
  /** Everyone who's joined the trip (the Golf leaderboard's players): name, then @username. */
  players?: GolfMatchPreview["leaderboard"][number]["golfer"][];
}) {
  // Dev simulator only: each Home section can be forced into one of its states (Conditionals, lib/dev/homeSections.ts).
  const simulator = useSimulator();
  const sim = process.env.NODE_ENV === "development" ? simulator?.state : undefined;
  const overview = forcedStage(sim?.homeOverview), momentum = forcedStage(sim?.homeMomentum), upcoming = forcedStage(sim?.homeUpcoming), competition = forcedStage(sim?.homeCompetition), inviteStage = forcedStage(sim?.homeInvite), playerStage = forcedStage(sim?.homePlayers);
  const destination = overview === "no-destination" ? undefined : overview ? draft.destination || SAMPLE_DESTINATION : draft.destination;
  const realDateRange = dateRangeLabel(draft.startDate, draft.endDate);
  const tripDateRange = overview === "no-dates" ? "" : overview ? realDateRange || SAMPLE_DATE_RANGE : realDateRange;
  const shownWeather = overview === "no-destination" ? undefined : overview === "weather-loading" ? WEATHER_NEVER : overview ? weather ?? WEATHER_SAMPLE : weather;
  // Players allotted for in Settings (the trip's number of players); nothing shown after the count when it isn't set.
  const allotted = Number.parseInt(draft.playerCount ?? "", 10) > 0 ? Number.parseInt(draft.playerCount ?? "", 10) : null;
  const rosterPlayers: { name: string; avatarUrl?: string | null; username?: string | null }[] = playerStage === "none" ? [] : playerStage ? samplePlayers(playerStage === "photos") : players;
  // Two boxes with a status top right: LIVE (a golf round in play) or NOW (anything else happening), then NEXT; with nothing
  // happening, NEXT then UPCOMING. "now" is read once, when Home opens (or comes from the dev trip clock).
  const [deviceNow] = useState(() => localNow(new Date()));
  const now = tripNow?.slice(0, 16) ?? deviceNow;
  const shownItinerary = upcoming === "flights" ? undefined : upcoming ? itinerary ?? [] : itinerary;
  const boxes = upcoming === "live" || upcoming === "next" ? sampleUpcoming(upcoming, now) : upcoming === "none" ? [] : itinerary ? upcomingSlides(itinerary, now, liveRound) : [];
  // Big Board bottom half: every upcoming plan (one at a time); with nothing left, one "Nothing else coming up" slide;
  // trips without an itinerary get their Flights as the slide.
  const slides: BoardSlide[] = shownItinerary
    ? boxes.length
      ? boxes.map(({ status, item }) => {
        const live = status === "LIVE";
        const when = live ? "In play now" : `${itineraryDay(item.startsAt)} · ${itineraryTime(item.startsAt)}`;
        const kind = live ? "Golf" : ITINERARY_KIND_LABEL[item.kind];
        return { key: item.id, title: item.title, onOpen: onOpenItinerary, ariaLabel: `${status}: ${kind}: ${item.title}, ${when}${item.detail ? `, ${item.detail}` : ""}. Open the itinerary`,
          body: <BoardSlideBody icon={<TravelKindIcon kind={item.kind} size={14} />} kind={kind} status={status} live={live} when={when} detail={item.detail} /> };
      })
      : [{ key: "nothing", title: "Itinerary", onOpen: onOpenItinerary, ariaLabel: "Nothing else coming up. Open the itinerary",
        body: <BoardSlideBody icon={<CalendarDays size={14} strokeWidth={2} aria-hidden />} kind="Itinerary" when="Nothing else coming up" detail="See the full itinerary" /> }]
    : [flightsSlide(flights)];
  // Big Board top half: the scores once a round is on or done (competition trips), else the Momentum content.
  const realScore = draft.includesTournament === "yes" ? bigBoardScore(match, !!liveRound || (afterRound ?? 0) > 0, !!(competitionTypes?.individual && competitionTypes?.team), spectator ? null : viewerName) : null;
  const score = momentum === "team-scores" ? SAMPLE_TEAM_SCORE : momentum === "split" ? SAMPLE_SPLIT_SCORE : momentum === "leader" ? SAMPLE_LEADER_SCORE : momentum ? null : realScore;
  const highlights = momentum === "highlights" || momentum === "team-scores" || momentum === "split" || momentum === "leader" ? SAMPLE_HIGHLIGHTS : momentum ? [] : momentumEvents;
  const today = now.slice(0, 10);
  const momFallback = momentum === "empty" ? null
    : momentum === "arrival" ? <MomSection arrivalDay={daysAfter(today, 30)} plans={[]} startAt={tripNow} />
    : momentum === "next-round" ? <MomSection arrivalDay={daysAfter(today, -1)} plans={[]} startAt={tripNow} rounds={sampleNextRound(today)} afterRound={0} />
    : <MomSection travel={travel} arrivalDay={draft.startDate} plans={itinerary ?? []} startAt={tripNow} rounds={rounds} afterRound={afterRound} />;
  // Competition section: everything the trip's competition is (type, formats, days, rounds, points), from its real settings.
  // Simulator "Competition, no drafts" on a trip without one shows a sample (2 Teams + Stroke Play) so the card can be designed.
  const summaryTypes = competition === "none" ? null : competitionTypes ?? (competition === "empty" ? { individual: "Stroke Play", team: "2 Teams" } : null);
  const devSetup = useDevSetup(draftScope);
  const savedSetup = useSavedTripSetup();
  const justCreatedVersion = useJustCreatedVersion();
  const setup = savedSetup?.values ?? (draftScope === "empty" ? readJustCreatedAll(justCreatedVersion) : devSetup);
  const baseSummary = summaryTypes ? homeCompetitionSummary({ types: summaryTypes, scoring: match?.roundScoring,
    rounds: plannedRounds(draft).map(round => { const planned = rounds?.find(r => r.number === round.number); return { number: round.number, dayNumber: round.dayNumber, format: planned?.format, course: planned?.course }; }) }) : null;
  // Your team: Settings' teams (submitted, or the organizer's picks); with 2 Teams and none saved yet, the roster's A / B split.
  const rosterNames = draftPlayers.map(player => player.name);
  const savedGroups = teamGroups(setup.submittedTeams as number[][] | undefined, setup.teamPicks as Record<number, number> | undefined);
  const rosterGroups = draftPlayers.some(player => player.team) ? (["A", "B"] as const).map(side => draftPlayers.flatMap((player, index) => player.team === side ? [index] : [])) : null;
  const competitionSummary = baseSummary && { ...baseSummary, yourTeam: yourTeam({ teamFormat: baseSummary.teamFormat, me: viewerName, players: rosterNames,
    groups: savedGroups ?? (baseSummary.teamFormat === "2 Teams" ? rosterGroups : null), teamNames: (setup.teamNames as string[] | undefined) ?? teamNames }) };
  // Draft section: only with a team competition (the simulator's draft previews force it on so the boards can be designed).
  const showDraft = competition !== "none" && (!!competitionTypes?.team || (process.env.NODE_ENV === "development" && (!!sim?.dualDraftMomentum || (!!sim?.draftSim && sim.draftSim !== "off"))));
  const rosterKey = JSON.stringify([draftScope, draftPlayers, rosterPlayers, setup, teamDraft, sim]);
  const [completedTeams, setCompletedTeams] = useState<{ key: string; players: MatchDraftPlayer[] } | null>(null);
  const localTeams = completedTeams?.key === rosterKey ? completedTeams.players : null;
  const simulatedDraft = sim ? draftSimFixture(sim, tripNow ?? deviceNow) : null;
  let teamRosterPlayers = rosterPlayers;
  let assignmentNames = rosterNames;
  let groups = savedGroups ?? rosterGroups;
  if (simulatedDraft && !playerStage) {
    teamRosterPlayers = simulatedDraft.players.map(player => ({ ...player, ...rosterPlayers.find(other => other.name === player.name) }));
    assignmentNames = simulatedDraft.players.map(player => player.name);
    groups = teamGroups(null, Object.fromEntries(simulatedDraft.players.flatMap((player, index) => {
      const team = player.teamIndex ?? (player.team === "A" ? 0 : player.team === "B" ? 1 : undefined);
      return team === undefined ? [] : [[index, team]];
    })));
  } else if (sim?.dualDraftMomentum && (!sim.matchDraftPreview || sim.matchDraftPreview === "off")) groups = null;
  if (localTeams && !playerStage) {
    teamRosterPlayers = localTeams.map(player => ({ ...player, ...rosterPlayers.find(other => other.name === player.name) }));
    assignmentNames = localTeams.map(player => player.name);
    groups = (["A", "B"] as const).map(side => localTeams.flatMap((player, index) => player.team === side ? [index] : []));
  }
  const homeTeams = homeTeamRoster({ teamCompetition: competition !== "none" && !!(summaryTypes?.team || simulatedDraft?.team.teamType) && !playerStage,
    players: teamRosterPlayers, assignmentNames, groups, teamNames: (setup.teamNames as string[] | undefined) ?? teamNames });
  const competitionNote = <p className={styles.homePlayersEmpty}>{competition === "none" || (!competition && draft.includesTournament !== "yes") ? "No competition" : "Team drafts, matches and skins will show here."}</p>;
  return <div className={styles.account}>
    {/* Maroon head: the heading + weather, then the Mom section; the boxes below overlap its bottom edge. */}
    <div className={styles.accountHead}>
    <div className={styles.accountTop}>
      {/* Left 65%: "Your trip to", the destination under it, then the trip's dates in gold (left out if there are none). */}
      <div className={styles.accountTitleBlock}>
        {/* Always two rows: "Your trip to", then "City, ST" (US) or "City, CC" (country code abroad) on one line. */}
        <p className={styles.accountLabel}>{destination ? <>Your trip to<span className={styles.accountDestination} title={destination}>{shortPlace(destination)}</span></> : "Your trip"}</p>
        {tripDateRange && <p className={styles.accountDates}>{tripDateRange}</p>}
      </div>
      {/* Right 35%: quick weather at the destination (only when the trip has a weather lookup). */}
      {shownWeather && <Suspense fallback={<div className={styles.quickWeather} role="status"><span className={styles.quickTemp}>—°</span><span className={styles.quickCondition}>Loading weather…</span></div>}>
        <QuickWeather weather={shownWeather} />
      </Suspense>}
    </div>
    {/* The Big Board: the old Momentum strip and Upcoming boxes in one gold-outlined box. Top: scores (or Momentum);
        bottom: upcoming plans one at a time, swipe or < > for more. */}
    <TripBigBoard score={score} highlights={highlights}
      momentum={<TripMomentum events={momentum === "team-scores" || momentum === "split" || momentum === "leader" ? [] : highlights} fallback={momFallback} />} slides={slides} />
    </div>
    {/* Draft (owner 2026-11-10): trips with a team competition (Team, or Team & Individual) get this above Players.
        It holds the team draft board and the match draft boards; with none coming up, one short line. */}
    {!spectator && <TripTapInInvite code={tapInCode} name={draft.tripName || "Your Golf Trip"} />}
    {showDraft && <section className={`${styles.homePlayers} ${styles.homeDraft}`} aria-label="Drafts">
      <div className={styles.homeCompetition}>
        <TripDraftWidget onTeamsComplete={players => setCompletedTeams({ key: rosterKey, players })} headingClassName={styles.accountHeading} scope={draftScope} rounds={draft.includesTournament === "yes" ? rounds : []} playedThrough={afterRound} teamNames={teamNames} players={draftPlayers.map(player => { const roster = rosterPlayers.find(other => other.name === player.name); return { ...player, avatarUrl: player.avatarUrl ?? roster?.avatarUrl, username: player.username ?? roster?.username }; })} draft={teamDraft} startAt={tripNow} editHref={isOrganizer ? settingsHref : undefined} fallback={<p className={styles.homePlayersEmpty}>No drafts coming up</p>} />
      </div>
    </section>}
    <TripHomeRoster players={teamRosterPlayers} teams={homeTeams} allotted={allotted}
      invite={!spectator && !homeRosterFull(teamRosterPlayers.length, allotted, !!homeTeams)
        ? <TripHomeInvite tripId={tripId ?? null} stage={inviteStage} /> : undefined} />
    {/* Competition follows Players and the invitation link. */}
    <section className={styles.homePlayers} aria-labelledby="home-competition-heading">
      <h2 id="home-competition-heading" className={styles.accountHeading}>Competition</h2>
      <div className={styles.homeCompetition}>
        {competition !== "none" && competitionSummary ? <TripHomeCompetition summary={competitionSummary} /> : competitionNote}
      </div>
    </section>
  </div>;
}

/** Dev simulator weather: still loading (never settles) / a sample forecast. Made once so React's use() sees the same promise. */
const WEATHER_NEVER = new Promise<TripWeather>(() => {});
const WEATHER_SAMPLE = Promise.resolve(SAMPLE_WEATHER);

/** "Jan 7 – Jan 10, 2026": the year once, on the second date (on both if the trip crosses a year); one date if only one is set. */
function dateRangeLabel(start: string | undefined, end: string | undefined): string {
  const format = (day: string, withYear: boolean) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
  const from = validDay(start) ? start! : null, to = validDay(end) ? end! : null;
  if (from && to) return `${format(from, from.slice(0, 4) !== to.slice(0, 4))} – ${format(to, true)}`;
  return from || to ? format((from ?? to)!, true) : "";
}

/** A saved trip date (YYYY-MM-DD) that can be shown. */
const validDay = (value: string | undefined) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.card} aria-label={title}>
    <h2 className={styles.cardTitle}>{title}</h2>
    {children}
  </section>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}
