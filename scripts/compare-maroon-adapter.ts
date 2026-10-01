// Read-only check for the Maroon migration Phase 2 adapter
// (docs/maroon-legacy-migration-inventory.md). For each year it loads The
// Maroon's data the way the OLD site does (getCatalogTournament + the old
// leaderboard/match helpers) and the way the NEW adapter does
// (loadMaroonSite), and reports every difference. Reads only; never writes.
//
//   npx tsx scripts/compare-maroon-adapter.ts [year ...]   (default: 2024 2025 2026 2027)
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { getCatalogTournament, seasonSlug } = await import("../lib/data/seasonCatalog");
  const { getPlayerSlug } = await import("../lib/data/players");
  const { getPlayerNameMap } = await import("../lib/portal/allPlayers");
  const { matchLeader, matchStatus } = await import("../components/leaderboard/matchUtils");
  const { placementNumber } = await import("../lib/leaderboard/placement");
  const { loadMaroonSite } = await import("../lib/platform/maroonAdapterServer");

  const years = process.argv.slice(2).map(Number).filter(Number.isInteger);
  const names = await getPlayerNameMap();
  let failures = 0;

  for (const year of years.length ? years : [2024, 2025, 2026, 2027]) {
    const problems: string[] = [];
    const check = (ok: boolean, message: string) => { if (!ok) problems.push(message); };
    const legacy = await getCatalogTournament(seasonSlug(year));
    const adapted = await loadMaroonSite(year);
    if (!legacy || !adapted) {
      console.log(`${year}: ${!legacy ? "old site has no tournament" : "adapter returned nothing"}`);
      failures++;
      continue;
    }
    const { site } = adapted;
    const played = legacy.matches.some((m) => matchStatus(m) !== "scheduled");

    // Team points (only once something has been played).
    const pts = Object.fromEntries(site.teams.map((t) => [t.id, t.points]));
    check(played ? pts.maroon === legacy.maroonPts && pts.white === legacy.whitePts : pts.maroon === undefined && pts.white === undefined,
      `points: old ${legacy.maroonPts}–${legacy.whitePts}, new ${pts.maroon}–${pts.white}`);

    // Matches: same set, same sides, same status, same winner.
    check(site.matches.length === legacy.matches.length, `match count: old ${legacy.matches.length}, new ${site.matches.length}`);
    for (const old of legacy.matches) {
      const now = site.matches.find((m) => m.id === old.id);
      if (!now) { problems.push(`match ${old.id} missing`); continue; }
      check(now.sideA.players.join() === old.maroonPlayers.map(getPlayerSlug).join(), `match ${old.id} Maroon side`);
      check(now.sideB.players.join() === old.whitePlayers.map(getPlayerSlug).join(), `match ${old.id} White side`);
      check(now.status === matchStatus(old), `match ${old.id} status: old ${matchStatus(old)}, new ${now.status}`);
      const leader = matchLeader(old);
      if (matchStatus(old) === "final") {
        const expected = leader === "tie" ? "Halved" : `${leader === "maroon" ? "Maroon" : "White"} wins`;
        check((now.result ?? "").startsWith(expected), `match ${old.id} result: expected "${expected}…", got "${now.result}"`);
      }
    }
    for (const hidden of legacy.archiveOnlyMatches ?? []) check(!site.matches.some((m) => m.id === hidden.id), `archive-only match ${hidden.id} is showing`);

    // Leaderboard: same order and the same places as the old table.
    const ranked = [...legacy.individualLeaderboard].sort((a, b) => a.toPar - b.toPar);
    check(site.standings.length === ranked.length, `leaderboard size: old ${ranked.length}, new ${site.standings.length}`);
    ranked.forEach((old, index) => {
      const now = site.standings[index];
      check(now?.playerId === getPlayerSlug(old.player) && now.position === placementNumber(ranked, index),
        `leaderboard row ${index + 1}: old ${old.player} (place ${placementNumber(ranked, index)}), new ${now?.playerId} (place ${now?.position})`);
    });

    // Roster and names.
    for (const team of ["maroon", "white"] as const) {
      for (const raw of legacy.roster[team]) {
        const slug = getPlayerSlug(raw);
        const player = site.players.find((p) => p.id === slug);
        check(player?.teamId === team, `${slug} should be on ${team}`);
        if (names[slug]) check(player?.name === names[slug], `${slug} name: old "${names[slug]}", new "${player?.name}"`);
      }
    }

    // Every match is placed in a round that exists.
    const sessionIds = new Set(site.days.flatMap((d) => d.sessions.map((s) => s.id)));
    for (const m of site.matches) check(sessionIds.has(adapted.matchSessions[m.id] ?? ""), `match ${m.id} has no round`);

    const summary = `${site.matches.length} matches · ${site.players.length} players · ${site.standings.length} on leaderboard · ` +
      `${site.days.reduce((n, d) => n + d.sessions.length, 0)} rounds · points ${pts.maroon ?? "–"}–${pts.white ?? "–"}` +
      (site.results ? ` · ${site.results.headline}` : "");
    if (problems.length) {
      failures++;
      console.log(`${year}: ${problems.length} DIFFERENCE(S)\n  ${problems.join("\n  ")}`);
    } else {
      console.log(`${year}: MATCH  (${summary})`);
    }
  }

  if (failures) {
    console.log(`\n${failures} year(s) differ.`);
    process.exit(1);
  }
  console.log("\nAll years match the old site.");
}

main().catch((error) => {
  console.error("Check failed to run:", error instanceof Error ? error.message : error);
  process.exit(1);
});
