"use client";

import { useEffect, useState, useSyncExternalStore, type MouseEvent } from "react";
import { GolfTripHome } from "@/components/platform/GolfTripHome";
import { DevProfilePreview, DevEditProfilePreview, DevSettingsPreview } from "./DevProfilePreview";
import { FixtureIsolation } from "./FixtureIsolation";
import { SimulatorFixtureProvider } from "./SimulatorBridge";
import { DEFAULT_SIMULATOR_STATE, type SimulatorConfig, type SimulatorPage } from "@/lib/dev/simulator";
import { simulatorTripData, simulatorNow, simulatorScorecard } from "@/lib/dev/golfTripSimulatorData";
import { GOLF_MATCH_PREVIEW, GOLF_TRIP_MOCK_DRAFT, GOLF_TRIP_MOCK_TRAVEL } from "@/lib/platform/golfTripPreviewFixture";
import type { GolfTripNavigation } from "@/lib/platform/golfTripNavigation";
import { sampleTripStatsView } from "@/lib/dev/sampleTripRounds";
import styles from "./IphonePreview.module.css";

const subscribeNever = () => () => {};
const MOCK = { preview: GOLF_TRIP_MOCK_DRAFT, previewMatch: GOLF_MATCH_PREVIEW, travel: GOLF_TRIP_MOCK_TRAVEL };
const SCENARIOS = [
  { id: "scheduled", label: "Before round", roundStatus: "scheduled" },
  { id: "live", label: "Live round", roundStatus: "live" },
  { id: "roundEnd", label: "Finished, unsubmitted", roundStatus: "roundEnd" },
  { id: "complete", label: "Trip complete", roundStatus: "complete" },
] as const;

/** Audited components only. No route loader, session, saved-trip id, or remote mutation callbacks. */
export function IphonePreview({ pages }: { pages: SimulatorPage[] }) {
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [pageId, setPageId] = useState(pages[0]?.id ?? "/dev/tournament");
  const [scenarioId, setScenarioId] = useState<string>("live");
  const [profileCondition, setProfileCondition] = useState("profile-preview-sample");
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [navigation, setNavigation] = useState<GolfTripNavigation>({ tab: "Home" });
  useEffect(() => {
    const restore = (event: KeyboardEvent) => { if (event.key === "Escape") { setHidden(false); setOpen(false); } };
    window.addEventListener("keydown", restore);
    return () => window.removeEventListener("keydown", restore);
  }, []);
  const page = pages.find(item => item.id === pageId);
  const profilePage = pages.find(item => item.path === "/dev/profile");
  const profile = pageId.startsWith("/dev/profile");
  const scenario = SCENARIOS.find(item => item.id === scenarioId) ?? SCENARIOS[1];
  const condition = profilePage?.conditions?.find(item => item.id === profileCondition);
  const config: SimulatorConfig = { source: "mock", state: {
    ...DEFAULT_SIMULATOR_STATE, roundStatus: scenario.roundStatus, sampleGames: true,
    ...(profile ? condition?.state : {}),
  }, navigation };
  const data = simulatorTripData(MOCK, MOCK, config);
  const stats = data.previewMatch ? sampleTripStatsView(data.previewMatch.leaderboard.map(row => ({ id: row.golfer.name, name: row.golfer.name, hcp: row.golfer.hcp }))) : undefined;
  function selectPage(id: string) {
    const next = pages.find(item => item.id === id);
    if (!next && !["/dev/profile/edit", "/dev/profile/settings"].includes(id)) return;
    setPageId(id);
    if (next?.navigation) setNavigation({ ...next.navigation });
    window.scrollTo(0, 0);
  }
  function containLinks(event: MouseEvent) {
    const anchor = (event.target as Element).closest("a");
    if (!anchor) return;
    event.preventDefault(); event.stopPropagation();
    const url = new URL(anchor.href, window.location.href);
    if (url.origin === window.location.origin) selectPage(url.pathname);
  }
  if (process.env.NODE_ENV !== "development") return null;
  // All links are contained before Next's Link handlers. CSP also prevents speculative RSC/API fetches.
  return <FixtureIsolation.Provider value><SimulatorFixtureProvider config={config}>
    <div className={styles.canvas} data-iphone-preview onClickCapture={containLinks} onAuxClickCapture={containLinks}>
      {hydrated && (profile ? pageId === "/dev/profile/edit" ? <DevEditProfilePreview onDone={() => selectPage("/dev/profile")} onCancel={() => selectPage("/dev/profile")} /> : pageId === "/dev/profile/settings" ? <DevSettingsPreview /> : <DevProfilePreview />
        : <GolfTripHome key={scenario.id} {...data} settingsHref="/dev-iphone" organizer={false}
          navigation={navigation} onNavigationChange={setNavigation} now={simulatorNow(config, data, scenario.id === "live")}
          roundLive={scenario.id === "live" || scenario.id === "roundEnd"} tripStats={stats}
          scoringPrefill={simulatorScorecard(config.state.roundStatus, data.previewMatch?.par, "match")}
          opponentCardMatches signedInName={data.previewMatch?.leaderboard[0]?.golfer.name}
          competitionKey="dev-iphone" savedCompetitionType={{ individual: "Stroke Play", team: "2 Teams" }} />)}
    </div>
    {hidden ? <button type="button" className={styles.restore} aria-label="Restore development controls" onClick={() => setHidden(false)} />
      : <aside className={styles.overlay} aria-label="Development preview controls">
        {!open ? <button type="button" className={styles.toggle} aria-label="Open development controls" onClick={() => setOpen(true)}>☰</button>
          : <div className={styles.panel}>
            <label>Page<select aria-label="Page" value={page?.id ?? pageId} onChange={event => selectPage(event.target.value)}>
              {pages.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              <option value="/dev/profile/edit">Edit profile</option><option value="/dev/profile/settings">Profile settings</option>
            </select></label>
            {profile ? <label>Profile scenario<select aria-label="Profile scenario" value={profileCondition} onChange={event => setProfileCondition(event.target.value)}>
              {profilePage?.conditions?.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select></label> : <label>Trip scenario<select aria-label="Trip scenario" value={scenarioId} onChange={event => setScenarioId(event.target.value)}>
              {SCENARIOS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select></label>}
            <button type="button" onClick={() => setOpen(false)}>Close controls</button>
            <button type="button" onClick={() => { setOpen(false); setHidden(true); }}>Hide for screenshot</button>
          </div>}
      </aside>}
  </SimulatorFixtureProvider></FixtureIsolation.Provider>;
}
