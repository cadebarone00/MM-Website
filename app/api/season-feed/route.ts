import { NextResponse } from "next/server";
import { getSeasonCatalog } from "@/lib/data/seasonCatalog";
import { getSeasonTournament } from "@/lib/data/seasonCatalog";
export async function GET(){const catalog=await getSeasonCatalog();const tournament=await getSeasonTournament(catalog.nextTournament.year);return NextResponse.json({...tournament,updatedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});}
