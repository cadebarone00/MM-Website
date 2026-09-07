"use client";

import Image from "next/image";
import type { BroadcastPlayerVideo, BroadcastTeam } from "@/lib/broadcast/types";

function toPar(value: number | null) {
  if (value == null || value === 0) return "E";
  return value > 0 ? `+${value}` : String(value);
}

function teamStatusClass(team: BroadcastTeam) {
  return team === "white" ? "bg-white text-maroon-800" : "bg-maroon-800 text-white";
}

function Names({ names, align, team }: { names: string[]; align: "left" | "right"; team: BroadcastTeam }) {
  return <div className={`flex min-w-0 flex-1 flex-col justify-center px-4 text-2xl leading-tight ${teamStatusClass(team)} ${align === "right" ? "items-end text-right" : "items-start text-left"}`}>{names.map((name) => <span key={name} className="truncate">{name}</span>)}</div>;
}

export function PlayerVideoScene({ video, preview = false }: { video: BroadcastPlayerVideo; preview?: boolean }) {
  const shotNumbers = [...Array(video.par).keys()].map((index) => index + 1);
  if (video.shotNumber > video.par) shotNumbers.push(video.shotNumber);
  const match = video.match;
  const opposingTeam: BroadcastTeam = match?.team === "white" ? "maroon" : "white";
  const scoreBoxClass = video.scoreToPar != null && video.scoreToPar < 0 ? "bg-red-700" : "bg-black";
  const playerTeamClass = match ? teamStatusClass(match.team) : "bg-maroon-800 text-white";

  return (
    <main className="relative min-h-screen overflow-hidden bg-black">
      {preview ? (
        <><Image src="/loading/desktop.png" alt="Player video preview" fill priority className="object-cover" /><div className="absolute inset-0 grid place-items-center bg-black/35 font-condensed text-4xl font-bold uppercase tracking-[0.2em] text-white">Player video preview</div></>
      ) : <video className="h-screen w-screen object-contain" src={video.videoUrl} autoPlay playsInline onEnded={() => { void fetch("/api/broadcast/video/complete", { method: "POST" }); }} />}

      <aside className="absolute right-8 top-8 w-[570px] overflow-hidden border border-black/20 bg-white font-condensed font-bold uppercase shadow-2xl">
        <div className="flex h-20 items-stretch text-white">
          <span className="grid w-24 place-items-center bg-gold-400 text-3xl">{video.individualPlace ?? "—"}</span>
          <span className={`flex flex-1 items-center px-5 text-3xl tracking-wide ${playerTeamClass}`}>{video.playerName}</span>
          <span className={`grid w-24 place-items-center text-3xl ${scoreBoxClass}`}>{toPar(video.scoreToPar)}</span>
        </div>
        <div className="flex min-h-13 items-center bg-stone-200 px-5 text-xl tracking-wide text-ink-900">
          <span>Hole {video.hole}</span><span className="ml-6">Par {video.par}</span><span className="ml-6">{video.yards} yds</span>
          <div className="ml-auto flex items-center gap-1.5" aria-label={`Shot ${video.shotNumber}`}>
            {shotNumbers.map((shot) => {
              const overParCurrent = shot === video.shotNumber && shot > video.par;
              const current = shot === video.shotNumber;
              return <span key={shot} className={`grid size-7 place-items-center ${overParCurrent ? "bg-gold-400 ring-1 ring-gold-600" : current ? "font-black text-ink-950" : "font-medium text-ink-500"}`}>{shot}</span>;
            })}
          </div>
        </div>
        <div className="flex min-h-11 items-center justify-center bg-white px-5 text-center text-lg tracking-wide text-ink-900">
          <span>Round {video.round}</span>
          <span className="mx-3 text-gold-600">&bull;</span>
          <span>{video.format ?? "Format to be confirmed"}</span>
          <span className="mx-3 text-gold-600">&bull;</span>
          <span className="truncate">{video.courseName ?? "Course to be confirmed"}</span>
        </div>
        {match && (
          <div className="flex min-h-20 border-t border-stone-300">
            <span className={`grid w-24 place-items-center text-3xl ${teamStatusClass(match.team)}`}>{match.ownStatus}</span>
            <Names names={match.ownPlayers} align="left" team={match.team} />
            <Names names={match.opposingPlayers} align="right" team={opposingTeam} />
            <span className={`grid w-24 place-items-center text-3xl ${teamStatusClass(opposingTeam)}`}>{match.opposingStatus}</span>
          </div>
        )}
      </aside>
    </main>
  );
}
