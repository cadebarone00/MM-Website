import { NextResponse } from "next/server";
import { getPlayerProfileBySlug, getPlayerProfile } from "@/lib/data/players";
import { getCareerStatsDatabase, getLiveCareerArchiveRecords } from "@/lib/data/careerStatsDatabase";

type ArchiveHole = { hole: number; par: number; yards: number; score: number | null; putts: number | null; fairwayInRegulation: boolean | null; greenInRegulation: boolean | null };

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = getPlayerProfileBySlug(slug);
  if (!profile) return NextResponse.json({ ok: false, error: "Unknown player." }, { status: 404 });

  const [{ records }, liveRecords] = await Promise.all([getCareerStatsDatabase(), getLiveCareerArchiveRecords()]);
  const playerRecords = [...records, ...liveRecords].filter((record) => getPlayerProfile(record.player)?.slug === profile.slug);
  const rounds = new Map<string, { year: number; round: number; course: string; format: string; holes: ArchiveHole[] }>();

  for (const record of playerRecords) {
    const key = `${record.year}:${record.round}:${record.course}`;
    const item = rounds.get(key) ?? { year: record.year, round: record.round, course: record.course, format: record.format, holes: [] };
    if (!item.holes.some((hole) => hole.hole === record.hole)) {
      item.holes.push({ hole: record.hole, par: record.par, yards: record.yards, score: record.score, putts: record.putts, fairwayInRegulation: record.fairwayInRegulation, greenInRegulation: record.greenInRegulation });
    }
    rounds.set(key, item);
  }

  return NextResponse.json({
    ok: true,
    rounds: [...rounds.values()]
      .map((round) => ({ ...round, holes: round.holes.sort((a, b) => a.hole - b.hole) }))
      .sort((a, b) => b.year - a.year || b.round - a.round || a.course.localeCompare(b.course)),
  }, { headers: { "Cache-Control": "no-store" } });
}
