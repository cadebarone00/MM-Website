"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getPlayerDisplayName, getPlayerLastName } from "@/lib/data/players";
import { holeSubmissionStatus, submittedPair, type HoleSubmission, type ScoringPair } from "@/lib/live/holeSubmission";
import { liveRoundStatus, waitingOnSubmitters } from "@/lib/live/roundStatus";
import { scoringStage } from "@/lib/live/scoringStage";
import { stageButtonLabel, stageNote } from "@/lib/live/scoringStageCopy";
import { applyPreviewHole, applyPreviewRoundSubmit, emptyRoom, expandPreviewTeammates, officialPreviewPlayers, PREVIEW_PARS, type PreviewRoom } from "@/lib/live/scoringPreviewRoom";
import type { MatchFormat } from "@/lib/live/types";

const PLAYERS = ["cam-latto", "cade-barone"] as const;
const HOLES = PREVIEW_PARS.map((_, i) => ({ number: i + 1 }));

/** What that player's real Scoring tab would show right now. */
function scoringTabLine(box: ScoringPair, player: string, room: PreviewRoom): string {
  if (officialPreviewPlayers(box, room).includes(player)) return "Scoring tab: Round complete — moves on to your next round";
  const status = liveRoundStatus(box, player, HOLES, room.submissions);
  const holesEntered = HOLES.filter((hole) => submittedPair(box, player, hole.number, room.submissions).mine).length;
  const stage = scoringStage({ hasMatch: true, matchState: "Live", holesEntered, roundCard: status.state, iSubmitted: room.submitted.includes(player) });
  if (stage === "none") return "Scoring tab: Waiting For Matchup";
  const waitingNames = waitingOnSubmitters(box, player, room.submitted).filter((slug) => slug !== player).map(getPlayerLastName);
  const note = stageNote(stage, { holesEntered, waitingNames });
  return `Scoring tab: ${stageButtonLabel(stage)}${note ? " — " + note : ""}`;
}

function officialLine(box: ScoringPair, room: PreviewRoom): string {
  const official = officialPreviewPlayers(box, room);
  if (official.length === PLAYERS.length) return "Both players have submitted — this round is now official and would count toward handicap and the rounds archive.";
  if (room.submitted.length === 0) return "Neither player has pressed Submit Round yet.";
  const [done] = room.submitted;
  const other = PLAYERS.find((slug) => slug !== done)!;
  return `${getPlayerDisplayName(done)} has submitted — waiting on ${getPlayerDisplayName(other)}. Not official yet.`;
}

function PreviewMatch({ format }: { format: MatchFormat }) {
  const session = useId();
  const maroonFrame = useRef<HTMLIFrameElement>(null);
  const whiteFrame = useRef<HTMLIFrameElement>(null);
  const roomRef = useRef<PreviewRoom>(emptyRoom());
  const [room, setRoom] = useState<PreviewRoom>(emptyRoom());
  const box = useMemo<ScoringPair>(() => ({ format, maroonPlayers: ["cam-latto"], whitePlayers: ["cade-barone"] }), [format]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.session !== session) return;
      const frames = [maroonFrame.current, whiteFrame.current];
      const index = frames.findIndex((frame) => frame?.contentWindow === event.source);
      if (index < 0) return;
      const message = event.data;
      if (message.type !== "scoring-preview-ready" && message.type !== "scoring-preview-submit" && message.type !== "scoring-preview-submit-round") return;
      const player = PLAYERS[index];
      let error: string | undefined;
      if (message.type === "scoring-preview-submit") {
        const entry = message.submission as HoleSubmission | undefined;
        if (!entry) error = "Not all information is complete.";
        else {
          const result = applyPreviewHole(box, roomRef.current, player, entry, new Date().toISOString());
          roomRef.current = result.room;
          error = result.error;
        }
      } else if (message.type === "scoring-preview-submit-round") {
        const result = applyPreviewRoundSubmit(box, roomRef.current, player);
        roomRef.current = result.room;
        error = result.error;
      }
      setRoom(roomRef.current);
      const submittedPlayers = expandPreviewTeammates(format, roomRef.current.submitted);
      frames.forEach((frame) => frame?.contentWindow?.postMessage({ type: "scoring-preview-state", session, submissions: roomRef.current.submissions, submittedPlayers, requestId: message.requestId, error }, window.location.origin));
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [box, format, session]);
  const confirmed = HOLES.filter((hole) => holeSubmissionStatus(box, "cam-latto", hole.number, room.submissions) === "confirmed").length;
  return <>
    <p className="mb-1 text-center text-sm text-ink-600">Preview archive: {confirmed} confirmed holes. Disputed holes are excluded.</p>
    <p className="mb-4 text-center text-sm font-semibold text-maroon-800">{officialLine(box, room)}</p>
    <div className="grid grid-cols-1 items-start justify-items-center gap-6 lg:grid-cols-2">
      {(["maroon", "white"] as const).map((team, index) => <div key={team} className="w-full max-w-[390px]">
        <h2 className="text-center font-serif text-xl font-bold text-maroon-800">{team === "maroon" ? "Maroon - Latto" : "White - Barone"}</h2>
        <p className="mb-2 text-center text-xs text-ink-500">{scoringTabLine(box, PLAYERS[index], room)}</p>
        <div className="overflow-hidden rounded-[2rem] border-4 border-ink-800 bg-white shadow-xl">
          <iframe ref={team === "maroon" ? maroonFrame : whiteFrame} src={"/portal/admin/scoring-preview/mobile?format=" + format + "&team=" + team + "&session=" + encodeURIComponent(session)} title={team + " live scoring preview"} className="block h-[850px] w-full border-0" />
        </div>
      </div>)}
    </div>
  </>;
}
export function LiveScoringPreview() {
  const [version, setVersion] = useState(0);
  const [format, setFormat] = useState<MatchFormat>("Singles");
  return <div>
    <h1 className="font-serif text-3xl font-bold text-maroon-900">Live Scoring Page Editor</h1>
    <p className="mt-2 text-sm text-ink-600">Play a whole round on both phones: enter all 18 holes on each (try a mismatch to see the red hole, then fix it), open the Scorecard to watch the round total go white, red, then green, and press Submit Round on each phone. The line above each phone shows what that player&apos;s Scoring tab would say. These sample scores never affect tournament data.</p>
    <div className="my-5 flex flex-wrap items-center gap-3">
      <label className="text-sm font-semibold text-maroon-800">Match format <select value={format} onChange={(event) => setFormat(event.target.value as MatchFormat)} className="ml-2 rounded border border-gold-400 bg-white px-3 py-2">{["Singles", "Fourball", "Foursome"].map((item) => <option key={item}>{item}</option>)}</select></label>
      <button type="button" onClick={() => setVersion((value) => value + 1)} className="rounded border border-maroon-700 px-3 py-2 text-sm font-semibold text-maroon-700">Reset preview</button>
    </div>
    <PreviewMatch key={format + version} format={format} />
  </div>;
}
