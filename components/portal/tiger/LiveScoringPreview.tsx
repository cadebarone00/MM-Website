"use client";

import { useEffect, useId, useRef, useState } from "react";
import { holeSubmissionStatus, validHoleDraft, type HoleSubmission } from "@/lib/live/holeSubmission";
import type { MatchFormat } from "@/lib/live/types";

function PreviewMatch({ format }: { format: MatchFormat }) {
  const session = useId();
  const maroonFrame = useRef<HTMLIFrameElement>(null);
  const whiteFrame = useRef<HTMLIFrameElement>(null);
  const submissions = useRef<HoleSubmission[]>([]);
  const [records, setRecords] = useState<HoleSubmission[]>([]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.session !== session) return;
      const frames = [maroonFrame.current, whiteFrame.current];
      const index = frames.findIndex((frame) => frame?.contentWindow === event.source);
      if (index < 0) return;
      const message = event.data;
      if (message.type !== "scoring-preview-ready" && message.type !== "scoring-preview-submit") return;
      let error: string | undefined;
      if (message.type === "scoring-preview-submit") {
        const entry = message.submission as HoleSubmission;
        const player = index === 0 ? "cam-latto" : "cade-barone";
        const pars = [4,4,5,3,4,5,3,4,4,4,3,4,4,4,5,4,3,5];
        if (!entry || !Number.isInteger(entry.hole) || entry.hole < 1 || entry.hole > 18 || !validHoleDraft(entry, pars[entry.hole - 1], format)) error = "Not all information is complete.";
        else {
          const saved = { ...entry, player, submittedAt: new Date().toISOString() };
          submissions.current = [...submissions.current.filter((row) => row.player !== player || row.hole !== entry.hole), saved];
          setRecords(submissions.current);
        }
      }
      frames.forEach((frame) => frame?.contentWindow?.postMessage({ type: "scoring-preview-state", session, submissions: submissions.current, requestId: message.requestId, error }, window.location.origin));
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [format, session]);
  const box = { format, maroonPlayers: ["cam-latto"], whitePlayers: ["cade-barone"] };
  const confirmed = Array.from({ length: 18 }, (_, i) => holeSubmissionStatus(box, "cam-latto", i + 1, records)).filter((status) => status === "confirmed").length;
  return <>
    <p className="mb-4 text-center text-sm text-ink-600">Preview archive: {confirmed} confirmed holes. Disputed holes are excluded.</p>
    <div className="grid grid-cols-1 items-start justify-items-center gap-6 lg:grid-cols-2">
      {(["maroon", "white"] as const).map((team) => <div key={team} className="w-full max-w-[390px]">
        <h2 className="mb-2 text-center font-serif text-xl font-bold text-maroon-800">{team === "maroon" ? "Maroon - Latto" : "White - Barone"}</h2>
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
    <p className="mt-2 text-sm text-ink-600">Submit a hole from both phones to test agreement, red discrepancies, and corrections. These sample scores never affect tournament data.</p>
    <div className="my-5 flex flex-wrap items-center gap-3">
      <label className="text-sm font-semibold text-maroon-800">Match format <select value={format} onChange={(event) => setFormat(event.target.value as MatchFormat)} className="ml-2 rounded border border-gold-400 bg-white px-3 py-2">{["Singles", "Fourball", "Foursome"].map((item) => <option key={item}>{item}</option>)}</select></label>
      <button type="button" onClick={() => setVersion((value) => value + 1)} className="rounded border border-maroon-700 px-3 py-2 text-sm font-semibold text-maroon-700">Reset preview</button>
    </div>
    <PreviewMatch key={format + version} format={format} />
  </div>;
}
