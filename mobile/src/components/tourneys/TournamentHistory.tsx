import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { PastTournament } from "@/lib/platform/pastTournaments";
import { toSiteData, type PublicTournament } from "@/lib/platform/publicSite";
import type { TournamentHome } from "@/lib/platform/tournamentHome";
import type { TournamentSiteData } from "@/components/platform/tournament-site/types";
import { SheetClose } from "~/components/SheetClose.tsx";
import { apiGet } from "~/lib/api.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; site: TournamentSiteData };
type Tab = "Overview" | "Leaderboard" | "Matches" | "Players" | "Schedule";
function target(href: string): { kind: "public" | "play"; slug: string; year: string } | null {
  const match = /^\/(play|t)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(\d{4})\/?$/.exec(href);
  return match ? { kind: match[1] === "t" ? "public" : "play", slug: match[2], year: match[3] } : null;
}
export function TournamentHistory({ item, close }: { item: PastTournament | null; close: () => void }) {
  const [load, setLoad] = useState<Load>({ status: "loading" }); const [tab, setTab] = useState<Tab>("Overview"); const [retry, setRetry] = useState(0); const generation = useRef(0);
  useEffect(() => {
    if (!item) return;
    const version = ++generation.current; const parsed = target(item.href); setTab("Overview"); setLoad({ status: "loading" });
    if (!parsed) { setLoad({ status: "error", message: "This tournament is not available here." }); return; }
    const url = `/api/app/tournament?kind=${parsed.kind}&tournament=${encodeURIComponent(parsed.slug)}&year=${parsed.year}`;
    void apiGet<TournamentHome | PublicTournament>(url).then(result => {
      if (version !== generation.current) return;
      if (!result.ok) { setLoad({ status: "error", message: result.error }); return; }
      try { const site = parsed.kind === "play" ? (result.data as TournamentHome).site : toSiteData(result.data as PublicTournament); if (!site?.branding || !Array.isArray(site.players)) throw Error("Invalid tournament data"); setLoad({ status: "ready", site }); }
      catch { setLoad({ status: "error", message: "Couldn't display this tournament. Try again." }); }
    });
    return () => { generation.current++; };
  }, [item, retry]);
  const site = load.status === "ready" ? load.site : null;
  const playerName = (id: string) => site?.players.find(p => p.id === id)?.name ?? "Player";
  return <Modal visible={item !== null} presentationStyle="pageSheet" animationType="slide" onRequestClose={close}><View style={styles.page}><View style={styles.header}><Text style={styles.title}>{item?.name} {item?.year}</Text><SheetClose onPress={close} /></View><ScrollView contentContainerStyle={styles.content}>
    {load.status === "loading" ? <Text style={styles.text}>Loading tournament…</Text> : load.status === "error" ? <><Text accessibilityRole="alert" style={styles.text}>{load.message}</Text><Pressable accessibilityRole="button" onPress={() => setRetry(n => n + 1)}><Text style={styles.link}>Try again</Text></Pressable></> : <>
      <View style={styles.tabs}>{(["Overview", "Leaderboard", "Matches", "Players", "Schedule"] as const).map(name => <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === name }} key={name} onPress={() => setTab(name)} style={[styles.pill, tab === name && styles.selected]}><Text style={styles.text}>{name}</Text></Pressable>)}</View>
      {tab === "Overview" && <><Text style={styles.heading}>{load.site.branding.name}</Text><Text style={styles.text}>{load.site.dates} · {load.site.destination}</Text>{load.site.description ? <Text style={styles.text}>{load.site.description}</Text> : null}{load.site.results && <><Text style={styles.heading}>{load.site.results.headline}</Text><Text style={styles.text}>{load.site.results.detail}</Text></>}</>}
      {tab === "Leaderboard" && (load.site.standings.length ? load.site.standings.map((row, i) => <Text style={styles.text} key={`${row.playerId}-${i}`}>{row.position} · {playerName(row.playerId)} · {row.score}{row.progress ? ` · ${row.progress}` : ""}</Text>) : <Text style={styles.text}>{load.site.scoringNotice ?? "No standings available."}</Text>)}
      {tab === "Matches" && (load.site.matches.length ? load.site.matches.map(match => <View key={match.id} style={styles.group}><Text style={styles.heading}>{match.sideA.players.map(playerName).join(", ")} vs {match.sideB.players.map(playerName).join(", ")}</Text><Text style={styles.text}>{[match.format, match.result ?? match.progress, match.teeTime].filter(Boolean).join(" · ")}</Text></View>) : <Text style={styles.text}>{load.site.scoringNotice ?? "No matches available."}</Text>)}
      {tab === "Players" && (load.site.players.length ? load.site.players.map(p => <Text key={p.id} style={styles.text}>{p.name}{p.captain ? " · Captain" : ""}</Text>) : <Text style={styles.text}>No players available.</Text>)}
      {tab === "Schedule" && (load.site.days.length ? load.site.days.map(day => <View key={day.date} style={styles.group}><Text style={styles.heading}>{day.label}</Text>{day.sessions.map(session => <Text key={session.id} style={styles.text}>{[session.label, session.format, session.teeTime].filter(Boolean).join(" · ")}</Text>)}</View>) : <Text style={styles.text}>No schedule available.</Text>)}
    </>}
  </ScrollView></View></Modal>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.maroon900, padding: gutter }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, title: { flex: 1, fontFamily: fonts.bold, color: colors.cream, fontSize: 21 }, content: { paddingVertical: 20, gap: 14 }, tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, pill: { borderWidth: 1, borderColor: colors.avatarGold, borderRadius: 10, padding: 9 }, selected: { backgroundColor: colors.maroon700 }, text: { fontFamily: fonts.regular, color: colors.cream, fontSize: 16 }, heading: { fontFamily: fonts.bold, color: colors.avatarGold, fontSize: 18 }, group: { gap: 6, paddingVertical: 6 }, link: { fontFamily: fonts.bold, color: colors.avatarGold } });
