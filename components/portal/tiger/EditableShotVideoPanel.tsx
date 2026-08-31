"use client";

import { useRef, useState } from "react";

export function EditableShotVideoPanel({
  shotCount,
  existingUrls,
  stagedFiles,
  onStage,
}: {
  shotCount: number;
  existingUrls: Record<number, string>;
  stagedFiles: Record<number, File>;
  onStage: (shot: number, file: File) => void;
}) {
  const shots = Array.from({ length: shotCount }, (_, i) => i + 1);
  const [currentShot, setCurrentShot] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const staged = stagedFiles[currentShot];
  const stagedUrl = staged ? URL.createObjectURL(staged) : null;
  const previewUrl = stagedUrl ?? existingUrls[currentShot];

  return (
    <div className="-mx-7 sm:mx-0">
      {previewUrl ? (
        <div className="relative">
          <video key={previewUrl} controls playsInline className="aspect-video w-full bg-ink-900 sm:rounded-md" src={previewUrl} />
          {staged && (
            <span className="absolute top-2 left-2 rounded-sm bg-maroon-700 px-2 py-1 font-condensed text-2xs font-semibold uppercase tracking-wide text-white">
              Unsaved
            </span>
          )}
        </div>
      ) : (
        <div className="aspect-video w-full flex flex-col items-center justify-center gap-2 bg-ink-900 text-cream-100 sm:rounded-md">
          <span className="font-condensed text-xs font-semibold tracking-wide uppercase opacity-80">Shot {currentShot} · No video yet</span>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onStage(currentShot, file);
          e.target.value = "";
        }}
      />

      <div className="flex items-center px-7 py-3 sm:px-0">
        {shots.map((shot, i) => (
          <div key={shot} className="flex flex-1 items-center last:flex-none">
            <button
              type="button"
              onClick={() => {
                setCurrentShot(shot);
                if (!existingUrls[shot] && !stagedFiles[shot]) fileInputRef.current?.click();
              }}
              className={[
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-condensed text-[11px] font-bold cursor-pointer transition-colors",
                shot <= currentShot ? "bg-maroon-700 text-white" : "bg-cream-100 text-maroon-700 border border-ink-300",
                stagedFiles[shot] ? "ring-2 ring-offset-1 ring-amber-500" : existingUrls[shot] ? "ring-2 ring-offset-1 ring-maroon-700" : "",
              ].join(" ")}
            >
              {shot}
            </button>
            {i < shots.length - 1 && (
              <div className="mx-1 h-[3px] flex-1 overflow-hidden rounded-full bg-ink-200">
                <div className="h-full bg-maroon-700 transition-all duration-300" style={{ width: shot + 1 <= currentShot ? "100%" : "0%" }} />
              </div>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={() => fileInputRef.current?.click()} className="mx-7 sm:mx-0 font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-700 underline">
        {previewUrl ? "Replace this shot's video" : "Upload video for this shot"}
      </button>
    </div>
  );
}
