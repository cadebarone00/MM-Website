"use client";

import { useState } from "react";

export function LiveScoringPreview() {
  const [version, setVersion] = useState(0);
  const [format, setFormat] = useState("Singles");
  return <div>
    <h1 className="font-serif text-3xl font-bold text-maroon-900">Live Scoring Page Editor</h1>
    <p className="mt-2 text-sm text-ink-600">Interactive mobile preview of the live scoring page. Layout changes appear here automatically. Sample scores stay in this preview.</p>
    <div className="my-5 flex flex-wrap items-center gap-3">
      <label className="text-sm font-semibold text-maroon-800">Match format <select value={format} onChange={(event) => setFormat(event.target.value)} className="ml-2 rounded border border-gold-400 bg-white px-3 py-2">{["Singles", "Fourball", "Foursome"].map((item) => <option key={item}>{item}</option>)}</select></label>
      <button type="button" onClick={() => setVersion((value) => value + 1)} className="rounded border border-maroon-700 px-3 py-2 text-sm font-semibold text-maroon-700">Reset preview</button>
    </div>
    <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[2rem] border-4 border-ink-800 bg-white shadow-xl">
      <iframe key={format + version} src={"/portal/admin/scoring-preview/mobile?format=" + format} title="Interactive mobile live scoring preview" className="block h-[780px] w-full border-0" />
    </div>
  </div>;
}
