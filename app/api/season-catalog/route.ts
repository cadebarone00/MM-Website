import { NextResponse } from "next/server";
import { getSeasonCatalog } from "@/lib/data/seasonCatalog";
export async function GET(){return NextResponse.json(await getSeasonCatalog(),{headers:{"Cache-Control":"no-store"}});}
