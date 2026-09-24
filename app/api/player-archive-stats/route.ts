import { NextResponse } from "next/server";
import { getPlayerProfile } from "@/lib/data/players";
import { getCareerStatsDatabase, getLiveCareerArchiveRecords } from "@/lib/data/careerStatsDatabase";

type Aggregate = { player: string; year: number; holes: number; strokes: number; birdies: number; bogeysPlus: number; fairwayHits: number; fairwayTotal: number; greenHits: number; greenTotal: number; putts: number; puttHoles: number };

export async function GET() {
  const [{ records }, live] = await Promise.all([getCareerStatsDatabase(), getLiveCareerArchiveRecords()]);
  const groups = new Map<string, Aggregate>();
  for (const row of [...records, ...live]) {
    const player = getPlayerProfile(row.player)?.slug;
    if (!player) continue;
    const key = player + ":" + row.year;
    const item = groups.get(key) ?? { player, year: row.year, holes: 0, strokes: 0, birdies: 0, bogeysPlus: 0, fairwayHits: 0, fairwayTotal: 0, greenHits: 0, greenTotal: 0, putts: 0, puttHoles: 0 };
    item.holes += 1; item.strokes += row.score;
    if (row.score - row.par === -1) item.birdies += 1;
    if (row.score - row.par >= 1) item.bogeysPlus += 1;
    if (row.fairwayInRegulation !== null) { item.fairwayTotal += 1; if (row.fairwayInRegulation) item.fairwayHits += 1; }
    if (row.greenInRegulation !== null) { item.greenTotal += 1; if (row.greenInRegulation) item.greenHits += 1; }
    if (row.putts !== null) { item.putts += row.putts; item.puttHoles += 1; }
    groups.set(key, item);
  }
  return NextResponse.json({ ok: true, rows: [...groups.values()] }, { headers: { "Cache-Control": "no-store" } });
}
