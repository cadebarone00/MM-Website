import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as SecureStore from "expo-secure-store";
import type { SavedGolfTrip } from "@/lib/platform/golfTripCreate";
import { plannedRounds, type GolfTripDraft } from "@/lib/platform/golfTripDraft";
import { golfTripInvitePath } from "@/lib/platform/golfTripInvitations";
import { acceptedMembers, memberState, type MemberState } from "@/lib/platform/golfTripMembers";
import { canShareLiveLink, LIVE_VISIBILITIES, LIVE_VISIBILITY_COPY, liveSettingsFrom } from "@/lib/platform/liveVisibility";
import { BET_CATEGORIES, betAllowed, BETS } from "@/lib/platform/predictBets";
import { tapInPath } from "@/lib/platform/tapIn";
import { tripCorrectionListFromJson, type TripCorrectionList } from "@/lib/platform/tripCorrections";
import { predictSettingsFrom } from "@/lib/platform/tripHome";
import { GENERAL_CARDS, ORGANIZER_SECTIONS } from "@/lib/platform/tripSettingsSections";
import { clearSeen, TIPS_SEEN_KEY } from "@/lib/platform/tripTour";
import type { SetupBasis } from "@/lib/platform/savedTripSetup";
import { Competition, GeneralEditor, GolfSchedule, Games, MatchSelection, Skins } from "./TripSetupEditors.tsx";
import { apiRaw, shareUrl } from "~/lib/api.ts";
import { useTripSetup } from "~/lib/useTripSetup.ts";
import { FullScreenPage } from "~/components/FullScreenPage.tsx";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

type Member = SavedGolfTrip["members"][number];
const EDITORS = ["Golf Schedule", "Games", "Individual Competition", "Team Competition", "Skins", "Match Selection"] as const;
type Page = "home" | "General Settings" | "Players" | "Notifications" | "Scorecard View" | "Player Scoring" | "Predict" | "Delete Trip" | "History" | (typeof EDITORS)[number] | { later: string };
const BADGE: Record<MemberState, string> = { organizer: "Organizer", accepted: "Member", pending: "Invited", declined: "Declined" };
const SCORING_FIELDS = ["Opponent's score", "Putts", "Fairway", "Greens in regulation"];
const tipsStore = { getItem: (k: string) => { try { return SecureStore.getItem(k); } catch { return null; } }, setItem: (k: string, v: string) => { try { SecureStore.setItem(k, v); } catch { /* this visit only */ } } };
const setOf = (value: unknown): string[] => Array.isArray(value) ? value.filter((x): x is string => typeof x === "string")
  : value && typeof value === "object" && Array.isArray((value as { $set?: unknown }).$set) ? (value as { $set: unknown[] }).$set.filter((x): x is string => typeof x === "string") : [];

/**
 * Trip Settings in the app (project_specs.md Golf Trips part 2g, slice 1): the website's General / Organizer card grid.
 * Built here: Players (The Maroon Live, invite code, members, invite / renew / cancel / remove, leave), General Settings
 * (shown), Notifications and Scorecard View (what the app does), Show tips again, Player Scoring (stats + fields + the
 * trip's corrections), Predict, Delete Trip. Golf Schedule, Games, competitions, Skins, Match Selection and History come in
 * slices 2-3. Organizer-only changes; players see read only.
 */
export function TripSettings({ trip, draft, viewer, setupValues, basis, onClose, onChanged, onLeft }: {
  trip: SavedGolfTrip; draft: GolfTripDraft; viewer: { profileId: string; memberId: string; isOrganizer: boolean }; setupValues: Record<string, unknown>; basis: SetupBasis;
  onClose: () => void; onChanged: () => void; onLeft: () => void;
}) {
  const [page, setPage] = useState<Page>("home");
  const setup = useTripSetup(trip.trip.id, setupValues);
  const back = () => setPage("home");
  const title = typeof page === "string" ? (page === "home" ? "Trip Settings" : page) : page.later;
  const organizer = viewer.isOrganizer;
  const editorProps = { values: setup.values, write: setup.write, basis, trip, readOnly: !organizer };

  const card = (name: string) => {
    const open = () => {
      if (name === "Show tips again") { clearSeen(TIPS_SEEN_KEY, viewer.profileId, tipsStore); Alert.alert("Tips are back", "They'll show the next time you open the trip page."); return; }
      if (["General Settings", "Players", "Notifications", "Scorecard View", "Player Scoring", "Predict", "Delete Trip", "History", ...EDITORS].includes(name)) setPage(name as Page);
      else setPage({ later: name });
    };
    if (name === "Watch the Golf Trips tour") return null;
    return <Pressable key={name} accessibilityRole="button" onPress={open} style={styles.card}><Text style={styles.cardText}>{name.replace("Competition", "Comp")}</Text></Pressable>;
  };

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <FullScreenPage style={styles.page}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={page === "home" ? "Close settings" : "Back to settings"} onPress={page === "home" ? onClose : back} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          <View style={styles.back} />
        </View>
        {setup.status && <Text style={[styles.status, setup.status.failed && styles.bad]} accessibilityLiveRegion="polite">{setup.status.text}</Text>}
        <ScrollView contentContainerStyle={{ padding: gutter, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          {page === "home" && <>
            <Text style={styles.heading}>General</Text>
            <View style={styles.grid}>{GENERAL_CARDS.map(card)}</View>
            {organizer && ORGANIZER_SECTIONS.map((group) => <View key={group.title} style={{ gap: 10 }}>
              <Text style={styles.heading}>{group.title}</Text>
              <View style={styles.grid}>{group.cards.map(card)}</View>
            </View>)}
          </>}
          {page === "General Settings" && (organizer ? <GeneralEditor {...editorProps} draft={draft} onChanged={onChanged} /> : <General trip={trip} draft={draft} values={setup.values} />)}
          {page === "Golf Schedule" && <GolfSchedule {...editorProps} />}
          {page === "Games" && <Games {...editorProps} />}
          {page === "Individual Competition" && <Competition {...editorProps} kind="individual" />}
          {page === "Team Competition" && <Competition {...editorProps} kind="team" />}
          {page === "Skins" && <Skins {...editorProps} />}
          {page === "Match Selection" && <MatchSelection {...editorProps} />}
          {page === "Players" && <Players trip={trip} viewer={viewer} onChanged={onChanged} onLeft={onLeft} />}
          {page === "Notifications" && <Note text="Push notifications aren't in the new app yet. Trip news shows in the trip's Feed, and the current Maroon app still sends reminders." />}
          {page === "Scorecard View" && <Note text={`In the app, scoring opens from the bar at the bottom of the trip page on the day of a round. ${setup.values.playerStats === true ? "Your organizer requires stats: putts, fairways and greens on every hole." : "Stats (putts, fairways and greens) are asked for when your organizer turns Player Stats on."}`} />}
          {page === "Player Scoring" && <PlayerScoring tripId={trip.trip.id} profileId={viewer.profileId} values={setup.values} write={setup.write} />}
          {page === "Predict" && <PredictSettings values={setup.values} write={setup.write} teamEvent={Boolean((setup.values.localCompetitionType as { team?: string | null } | undefined)?.team)} />}
          {page === "History" && <History values={setup.values} write={setup.write} readOnly={!organizer} />}
          {page === "Delete Trip" && <DeleteTrip tripId={trip.trip.id} name={trip.trip.name} onDeleted={onLeft} />}
          {typeof page === "object" && <Note text={`${page.later} comes to the app in the next part of Golf Trips 2g. Until then, change it on the website's Trip Settings (or the current Maroon app).`} />}
        </ScrollView>
      </FullScreenPage>
    </Modal>
  );
}

function General({ trip, draft, values }: { trip: SavedGolfTrip; draft: GolfTripDraft; values: Record<string, unknown> }) {
  const rounds = plannedRounds(draft);
  const joined = acceptedMembers(trip.members).length;
  return <>
    <Section title="Trip"><Row label="Name" value={trip.trip.name} /><Row label="Destination" value={trip.trip.destination || "Not set"} /></Section>
    <Section title="Dates"><Row label="Arrival" value={draft.startDate || "Not set"} /><Row label="Departure" value={draft.endDate || "Not set"} /></Section>
    <Section title="Players"><Row label="Player amount" value={`${Number(values.playerTotal) || trip.trip.expected_traveler_count || joined} (${joined} joined)`} /></Section>
    <Section title="Golf Schedule">
      {rounds.length === 0 && <Text style={styles.muted}>No golf days yet. Set the trip dates first.</Text>}
      {rounds.map((r) => <Row key={r.number} label={`Round ${r.number}${r.date ? ` · ${r.date}` : ""}`} value={draft[`round${r.number}Course`] || "Course TBD"} />)}
    </Section>
    <Note text="Changing the trip's basics comes to the app with the other setup editors (next part of 2g). Until then, change them on the website." />
  </>;
}

function Players({ trip, viewer, onChanged, onLeft }: { trip: SavedGolfTrip; viewer: { profileId: string; memberId: string; isOrganizer: boolean }; onChanged: () => void; onLeft: () => void }) {
  const tripId = trip.trip.id, manage = viewer.isOrganizer;
  const [members, setMembers] = useState<Member[]>(trip.members);
  const [link, setLink] = useState<{ memberId: string; name: string; url: string } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [live, setLive] = useState(liveSettingsFrom(trip.trip.live_visibility, trip.trip.live_players_can_share, "link"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  useEffect(() => { setMembers(trip.members); }, [trip.members]);
  useEffect(() => { void apiRaw<{ ok?: boolean; code?: string | null }>(`/api/golf-trips/${tripId}/invite-code`).then((r) => { if (r.body?.ok && r.body.code) setCode(r.body.code); }); }, [tripId]);
  const watchCode = trip.trip.watch_code;
  const send = async (path: string, method: "POST" | "DELETE" | "PATCH", body?: unknown) => {
    const r = await apiRaw<{ ok?: boolean; error?: string; inviteToken?: string; memberId?: string }>(path, { method, body });
    return { ok: r.status >= 200 && r.status < 300 && !!r.body?.ok, body: r.body, offline: r.status === 0 };
  };
  const showLink = (memberId: string, who: string, token: string) => setLink({ memberId, name: who, url: shareUrl(golfTripInvitePath(token)) });
  const saveLive = async (next: typeof live) => {
    const before = live; setLive(next);
    const r = await send(`/api/golf-trips/${tripId}/live`, "PATCH", next);
    if (!r.ok) { setLive(before); setMessage(r.offline ? "Couldn't save. Check your connection." : r.body?.error ?? "Couldn't save. Try again."); } else onChanged();
  };
  const remove = (m: Member) => {
    const unaccepted = ["pending", "declined"].includes(memberState(m));
    Alert.alert(unaccepted ? `Cancel ${m.displayName}'s invitation?` : `Remove ${m.displayName}?`, unaccepted ? "Their link will stop working." : "Their flights on this trip are removed too.", [
      { text: "Keep", style: "cancel" },
      { text: unaccepted ? "Cancel invite" : "Remove", style: "destructive", onPress: async () => {
        setBusy(m.id); const r = await send(`/api/golf-trips/${tripId}/members/${m.id}`, "DELETE"); setBusy(null);
        if (r.ok) { setMembers((list) => list.filter((x) => x.id !== m.id)); setMessage(unaccepted ? `${m.displayName}'s invitation was cancelled.` : `${m.displayName} was removed from the trip.`); onChanged(); }
        else setMessage(r.body?.error ?? "We couldn't do that. Try again.");
      } }]);
  };
  const renew = async (m: Member) => {
    setBusy(m.id); const r = await send(`/api/golf-trips/${tripId}/members/${m.id}/link`, "POST"); setBusy(null);
    if (r.ok && r.body?.inviteToken) { showLink(m.id, m.displayName, r.body.inviteToken); onChanged(); } else setMessage(r.body?.error ?? "We couldn't make a new link. Try again.");
  };
  const invite = async () => {
    setBusy("invite"); const r = await send(`/api/golf-trips/${tripId}/members`, "POST", { displayName: name.trim(), email }); setBusy(null);
    if (r.ok && r.body?.inviteToken && r.body.memberId) { showLink(r.body.memberId, name.trim(), r.body.inviteToken); setName(""); setEmail(""); onChanged(); }
    else setMessage(r.body?.error ?? "We couldn't send that invite. Try again.");
  };
  const leave = () => Alert.alert("Leave this trip?", "You'll need a new invite to rejoin. Your flights on it are removed; your account and profile stay.", [
    { text: "Stay", style: "cancel" },
    { text: "Leave", style: "destructive", onPress: async () => { const r = await send(`/api/golf-trips/${tripId}/leave`, "POST"); if (r.ok) onLeft(); else setMessage(r.body?.error ?? "We couldn't take you off the trip. Try again."); } }]);
  const players = acceptedMembers(members).length, invited = members.filter((m) => memberState(m) === "pending").length;

  return <>
    <Section title="The Maroon Live">
      {manage && <>
        <Text style={styles.muted}>Who can watch: <Text style={styles.strong}>{LIVE_VISIBILITY_COPY[live.visibility].label}</Text></Text>
        {LIVE_VISIBILITIES.map((v) => <Pressable key={v} accessibilityRole="radio" accessibilityState={{ checked: live.visibility === v }} onPress={() => void saveLive({ ...live, visibility: v })} style={[styles.option, live.visibility === v && styles.optionOn]}>
          <Text style={styles.optionTitle}>{LIVE_VISIBILITY_COPY[v].label}</Text><Text style={styles.muted}>{LIVE_VISIBILITY_COPY[v].detail}</Text></Pressable>)}
        <Toggle label="Players can share the link" value={live.playersCanShare} onChange={(playersCanShare) => void saveLive({ ...live, playersCanShare })} disabled={live.visibility === "private"} />
      </>}
      {watchCode && canShareLiveLink(live, manage) ? <Pressable accessibilityRole="button" onPress={() => void Share.share({ message: shareUrl(tapInPath(watchCode) ?? "") })} style={styles.button}><Text style={styles.buttonText}>Share the live link</Text></Pressable>
        : !manage && <Text style={styles.muted}>The organizer decides who can share the live link.</Text>}
    </Section>
    {code && <Section title="Invite code"><Text style={styles.code} selectable>{code}</Text>
      <Pressable accessibilityRole="button" onPress={() => void Share.share({ message: `Join ${trip.trip.name} on The Maroon with code ${code}` })} style={styles.button}><Text style={styles.buttonText}>Share code</Text></Pressable>
      {manage && <Pressable accessibilityRole="button" onPress={async () => { const r = await send(`/api/golf-trips/${tripId}/invite-code`, "POST"); const next = (r.body as { code?: string } | null)?.code; if (r.ok && next) setCode(next); }}><Text style={styles.link}>Make a new code</Text></Pressable>}
    </Section>}
    <Section title="Members">
      <Text style={styles.muted}>{players} {players === 1 ? "player" : "players"}{invited ? ` · ${invited} invited` : ""}</Text>
      {members.map((m) => {
        const state = memberState(m), isYou = m.id === viewer.memberId, unaccepted = state === "pending" || state === "declined";
        return <View key={m.id} style={styles.member}>
          <View style={styles.memberTop}><Text style={styles.memberName}>{m.displayName}</Text><Text style={styles.badge}>{BADGE[state]}</Text>{isYou && <Text style={styles.muted}>You</Text>}</View>
          {manage && m.email && !isYou && <Text style={styles.muted}>{m.email}</Text>}
          {manage && !isYou && state !== "organizer" && <View style={styles.row}>
            {unaccepted && <Pressable accessibilityRole="button" disabled={busy === m.id} onPress={() => void renew(m)} style={styles.small}><Text style={styles.smallText}>{state === "declined" ? "Invite again" : "New invite link"}</Text></Pressable>}
            <Pressable accessibilityRole="button" disabled={busy === m.id} onPress={() => remove(m)} style={[styles.small, { borderColor: colors.errorOnMaroon }]}><Text style={[styles.smallText, styles.bad]}>{unaccepted ? "Cancel invite" : "Remove"}</Text></Pressable>
          </View>}
          {link?.memberId === m.id && <InviteLink name={link.name} url={link.url} />}
        </View>;
      })}
      {link && !members.some((m) => m.id === link.memberId) && <InviteLink name={link.name} url={link.url} />}
    </Section>
    {manage && <Section title="Invite member">
      <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={colors.searchFaint} maxLength={120} style={styles.input} accessibilityLabel="Name" />
      <TextInput value={email} onChangeText={setEmail} placeholder="Email (optional)" placeholderTextColor={colors.searchFaint} maxLength={200} keyboardType="email-address" autoCapitalize="none" style={styles.input} accessibilityLabel="Email (optional)" />
      <Pressable accessibilityRole="button" disabled={!name.trim() || busy === "invite"} onPress={() => void invite()} style={[styles.button, !name.trim() && styles.dim]}><Text style={styles.buttonText}>{busy === "invite" ? "Creating…" : "Create invite link"}</Text></Pressable>
    </Section>}
    {!manage && <Section title="Leave trip"><Text style={styles.muted}>Take yourself off this trip. Your flights on it are removed; your account and profile stay.</Text>
      <Pressable accessibilityRole="button" onPress={leave} style={[styles.button, { borderColor: colors.errorOnMaroon }]}><Text style={[styles.buttonText, styles.bad]}>Leave Trip</Text></Pressable></Section>}
    {!!message && <Text style={styles.status} accessibilityRole="alert">{message}</Text>}
  </>;
}

function InviteLink({ name, url }: { name: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return <View style={styles.inviteLink}>
    <Text style={styles.strong}>Invite link for {name}</Text>
    <Text style={styles.muted} selectable>{url}</Text>
    <View style={styles.row}>
      <Pressable accessibilityRole="button" onPress={async () => { await Clipboard.setStringAsync(url); setCopied(true); }} style={styles.small}><Text style={styles.smallText}>{copied ? "Copied" : "Copy invite link"}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => void Share.share({ message: url })} style={styles.small}><Text style={styles.smallText}>Share</Text></Pressable>
    </View>
    <Text style={styles.muted}>Send this link to them. It's shown only now; if it's lost, make a new one.</Text>
  </View>;
}

function PlayerScoring({ tripId, profileId, values, write }: { tripId: string; profileId: string; values: Record<string, unknown>; write: (field: string, value: unknown) => void }) {
  const stats = values.playerStats === true;
  const off = setOf(values.scoringFieldsOff);
  const [list, setList] = useState<TripCorrectionList | null | "loading">("loading");
  const load = async () => {
    const r = await apiRaw<{ ok?: boolean; corrections?: unknown }>(`/api/golf-trips/${tripId}/scoring/corrections?scope=trip`);
    setList(r.status === 200 && r.body?.ok ? tripCorrectionListFromJson(r.body.corrections) : null);
  };
  useEffect(() => { void load(); }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps -- loads once
  const decide = async (requestId: string, approve: boolean, note: string | null) => {
    const r = await apiRaw<{ ok?: boolean; error?: string }>(`/api/golf-trips/${tripId}/scoring/corrections`, { method: "POST", body: { action: "decide", requestId, approve, note, expectedProfileId: profileId } });
    if (!(r.status === 200 && r.body?.ok)) Alert.alert("Not saved", r.body?.error ?? "Couldn't save that. Try again.");
    await load();
  };
  return <>
    <Section title="What players enter">
      {SCORING_FIELDS.map((field) => {
        const on = !off.includes(field), stat = field !== "Opponent's score";
        return <View key={field}>
          {field === "Putts" && <Toggle label="Player Stats" value={stats} onChange={(v) => write("playerStats", v)} />}
          <Toggle label={field === "Opponent's score" ? "Attesting" : field} value={on} disabled={stat && !stats}
            onChange={() => write("scoringFieldsOff", { $set: on ? [...off, field] : off.filter((f) => f !== field) })} />
        </View>;
      })}
    </Section>
    <Section title="Corrections">
      {list === "loading" && <Text style={styles.muted}>Loading…</Text>}
      {list === null && <Text style={styles.muted}>Corrections aren't available for this trip yet.</Text>}
      {list && list !== "loading" && list.requests.length === 0 && <Text style={styles.muted}>No correction requests yet.</Text>}
      {list && list !== "loading" && list.requests.map((r) => <View key={r.id} style={styles.member}>
        <Text style={styles.memberName}>{r.golferName} · Round {r.roundNumber} · {r.holes.length === 1 ? `Hole ${r.holes[0]}` : `Holes ${r.holes.join(", ")}`}</Text>
        <Text style={styles.muted}>“{r.reason}” · {r.status === "pending" ? "Waiting for a decision" : r.status === "approved" ? "Approved" : r.status === "denied" ? "Denied" : "Corrected and resubmitted"}{r.decisionNote ? ` · Note: ${r.decisionNote}` : ""}</Text>
        {r.status === "pending" && r.canDecide && <View style={styles.row}>
          <Pressable accessibilityRole="button" onPress={() => void decide(r.id, true, null)} style={styles.small}><Text style={styles.smallText}>Approve</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => Alert.prompt?.("Deny this request?", "Say why. Their submitted card stays as it is.", (text) => { if (text?.trim()) void decide(r.id, false, text.trim()); })} style={[styles.small, { borderColor: colors.errorOnMaroon }]}><Text style={[styles.smallText, styles.bad]}>Deny</Text></Pressable>
        </View>}
      </View>)}
    </Section>
  </>;
}

function PredictSettings({ values, write, teamEvent }: { values: Record<string, unknown>; write: (field: string, value: unknown) => void; teamEvent: boolean }) {
  const settings = predictSettingsFrom(values);
  const save = (next: { on: boolean; off: string[] }) => write("predictSettings", next);
  return <>
    <Section title="Prediction market">
      <Text style={styles.muted}>Players predict with Maroon Coins: a play-only balance for this trip. No money changes hands, and coins can't be bought or cashed out.</Text>
      <Toggle label="Predict" value={settings.on} onChange={(on) => save({ ...settings, on })} />
    </Section>
    {BET_CATEGORIES.map((category) => <Section key={category} title={category}>
      {BETS.filter((b) => b.category === category).map((b) => {
        const allowed = betAllowed(b.id, teamEvent), on = allowed && !settings.off.includes(b.id);
        return <Toggle key={b.id} label={b.title} note={allowed ? b.blurb : "Needs a team competition"} value={on} disabled={!allowed || !settings.on}
          onChange={() => save({ ...settings, off: on ? [...settings.off, b.id] : settings.off.filter((id) => id !== b.id) })} />;
      })}
    </Section>)}
  </>;
}

type PastTrip = { id: string; name: string; place: string; arrival: string; departure: string; players: string[]; rounds: { id: string; number: number; course: { name: string } }[] };
/** Organizer → History: the past trips saved with this trip (name, place, dates, players, rounds). Remove asks first. */
function History({ values, write, readOnly }: { values: Record<string, unknown>; write: (field: string, value: unknown) => void; readOnly: boolean }) {
  const trips = Array.isArray(values.pastTrips) ? values.pastTrips as PastTrip[] : [];
  return <>
    {trips.length === 0 && <Note text="No past trips yet. Bring one in from Golf Trips → Import past trip." />}
    {trips.map((t) => <Section key={t.id} title={t.name}>
      <Row label="Where" value={t.place || "—"} />
      <Row label="Dates" value={`${t.arrival} – ${t.departure}`} />
      <Row label="Players" value={String(t.players.length)} />
      <Row label="Rounds" value={t.rounds.map((r) => `${r.number}. ${r.course.name}`).join(", ") || "—"} />
      {!readOnly && <Pressable accessibilityRole="button" onPress={() => Alert.alert(`Remove ${t.name}?`, "It comes off this trip's history.", [{ text: "Keep", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => write("pastTrips", trips.filter((x) => x.id !== t.id)) }])} style={[styles.small, { borderColor: colors.errorOnMaroon, alignSelf: "flex-start" }]}>
        <Text style={[styles.smallText, styles.bad]}>Remove</Text></Pressable>}
    </Section>)}
    <Note text="Adding a past trip's rounds and scores here is on the website for now; Golf Trips → Import past trip works in the app." />
  </>;
}

function DeleteTrip({ tripId, name, onDeleted }: { tripId: string; name: string; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const remove = () => Alert.alert(`Delete ${name}?`, "Everyone loses the trip: its settings, plans, games, scores and chat. This can't be undone.", [
    { text: "Keep trip", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: () => Alert.alert("Are you sure?", `Delete ${name} for everyone?`, [{ text: "Keep trip", style: "cancel" }, { text: "Delete for everyone", style: "destructive", onPress: async () => {
      setBusy(true);
      const r = await apiRaw<{ ok?: boolean; error?: string }>(`/api/golf-trips/${tripId}`, { method: "DELETE" });
      setBusy(false);
      if (r.status === 200 && r.body?.ok) onDeleted(); else setMessage(r.status === 0 ? "You're offline. The trip wasn't deleted." : r.body?.error ?? "Couldn't delete the trip. Try again.");
    } }]) }]);
  return <Section title={`Delete ${name}`}>
    <Text style={styles.muted}>Deleting removes the trip for everyone on it: settings, plans, games, scores and chat. Submitted rounds already saved to players' profiles stay on their profiles.</Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={remove} style={[styles.button, { borderColor: colors.errorOnMaroon }]}><Text style={[styles.buttonText, styles.bad]}>{busy ? "Deleting…" : "Delete Trip"}</Text></Pressable>
    {!!message && <Text style={styles.status} accessibilityRole="alert">{message}</Text>}
  </Section>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section} accessibilityLabel={title}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}
function Row({ label, value }: { label: string; value: string }) {
  return <View style={styles.kv}><Text style={styles.muted}>{label}</Text><Text style={styles.kvValue}>{value}</Text></View>;
}
function Note({ text }: { text: string }) { return <Text style={styles.note}>{text}</Text>; }
function Toggle({ label, note, value, onChange, disabled = false }: { label: string; note?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <View style={[styles.toggle, disabled && styles.dim]}>
    <View style={{ flex: 1 }}><Text style={styles.toggleLabel}>{label}</Text>{note && <Text style={styles.muted}>{note}</Text>}</View>
    <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.goldBright }} accessibilityLabel={label} />
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: gutter, minHeight: 52 },
  back: { width: minTap, height: minTap, justifyContent: "center" },
  backText: { fontFamily: fonts.regular, fontSize: 34, color: colors.cream, marginTop: -4 },
  title: { flex: 1, textAlign: "center", fontFamily: fonts.bold, fontSize: 18, color: colors.cream },
  status: { paddingHorizontal: gutter, fontFamily: fonts.semibold, fontSize: 13, color: colors.boardInk, textAlign: "center" },
  bad: { color: colors.errorOnMaroon },
  heading: { fontFamily: fonts.bold, fontSize: 16, color: colors.cream },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: { width: "48%", flexGrow: 1, minHeight: 84, padding: 14, justifyContent: "flex-end", borderRadius: radius.card, borderWidth: 1, borderColor: colors.boardBorderSoft, backgroundColor: colors.boardBottom },
  cardText: { fontFamily: fonts.bold, fontSize: 16, color: colors.cream },
  section: { gap: 8, padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: colors.boardBorderSoft, backgroundColor: colors.boardBottom },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.cream },
  muted: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.boardInk },
  strong: { fontFamily: fonts.semibold, color: colors.cream },
  note: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.boardInk },
  kv: { flexDirection: "row", justifyContent: "space-between", gap: 10, paddingVertical: 4 },
  kvValue: { flexShrink: 1, textAlign: "right", fontFamily: fonts.semibold, fontSize: 14, color: colors.cream },
  option: { padding: 10, gap: 2, borderRadius: radius.control, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  optionOn: { borderColor: colors.goldBright },
  optionTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  toggle: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: minTap, paddingVertical: 4 },
  toggleLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  dim: { opacity: 0.45 },
  button: { minHeight: 46, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorder, alignItems: "center", justifyContent: "center" },
  buttonText: { fontFamily: fonts.bold, fontSize: 15, color: colors.cream },
  link: { fontFamily: fonts.semibold, fontSize: 14, color: colors.boardLink, paddingVertical: 6 },
  code: { fontFamily: fonts.bold, fontSize: 28, letterSpacing: 4, color: colors.goldBright, textAlign: "center" },
  member: { gap: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  memberTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  memberName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  badge: { fontFamily: fonts.capsSemibold, fontSize: 10, letterSpacing: 0.6, color: colors.boardGold, textTransform: "uppercase" },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  small: { minHeight: 34, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorder, justifyContent: "center" },
  smallText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.cream },
  input: { minHeight: 46, paddingHorizontal: 12, borderRadius: radius.control, borderWidth: 1, borderColor: colors.boardBorderSoft, backgroundColor: colors.inputOnMaroon, color: colors.cream, fontFamily: fonts.regular, fontSize: 15 },
  inviteLink: { gap: 6, padding: 10, borderRadius: radius.control, borderWidth: 1, borderColor: colors.goldBright },
});
