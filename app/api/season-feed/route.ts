import { NextResponse } from "next/server";
import { getSeasonCalendar } from "@/lib/live/seasonCalendarServer";
import { getSeasonTournament } from "@/lib/data/seasonCatalog";
export async function GET(){const calendar=await getSeasonCalendar();const tournament=await getSeasonTournament(calendar.activeYear);return NextResponse.json({...tournament,updatedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});}
