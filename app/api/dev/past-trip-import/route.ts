import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { addSamplePastTrip } from "@/lib/dev/samplePastTrips";
import { importInput, importSummary } from "@/lib/platform/pastTripImport";
import { readImportRequest } from "@/lib/platform/pastTripImportRequest";

export const runtime = "nodejs";

/**
 * App simulator only (development): the same reading and checks as /api/golf-trips/import (spreadsheet or walkthrough
 * draft), with no sign-in; "create" keeps the trip in the dev server's memory (lib/dev/samplePastTrips.ts).
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const read = await readImportRequest(request);
  if (!read.ok) return NextResponse.json(read.body, { status: read.status });
  if (read.action === "preview") return NextResponse.json({ ok: true, summary: importSummary(read.trip) });
  const id = randomUUID();
  addSamplePastTrip(id, importInput(read.trip, read.me || null, "You (sample)", randomUUID(), randomUUID));
  return NextResponse.json({ ok: true, tripId: id, url: `/dev/import-trip/${id}` }, { status: 201 });
}
