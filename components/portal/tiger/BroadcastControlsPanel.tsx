"use client";

import { useEffect, useState } from "react";
import type { BroadcastConfig, BroadcastScene, BroadcastState } from "@/lib/broadcast/types";
import type { PlaylistTrack } from "@/lib/broadcast/playlist";
import { DISPLAY_YEARS } from "@/lib/broadcast/displayYears";
import { useAutoScene } from "@/lib/broadcast/useAutoScene";
import { useLiveBroadcastAudio } from "@/lib/broadcast/useLiveBroadcastAudio";
import { Volume2, VolumeX } from "lucide-react";
import { BroadcastPreview } from "./BroadcastPreview";
import { getMockRunTotalMs, MOCK_RUN_DEFAULT_VIDEO_MS } from "@/lib/broadcast/mockRun";

const SCENE_BUTTONS: { scene: BroadcastScene; label: string }[] = [
  { scene: "individual_leaderboard", label: "Individual Leaderboard" },
  { scene: "match_play", label: "Match Play" },
  { scene: "holding", label: "Holding" },
];
type PreviewScene = BroadcastScene | "video_transition" | "player_video";
type PreviewVideoSettings = {
  player: string;
  place: string;
  scoreToPar: string;
  round: string;
  hole: string;
  par: string;
  yards: string;
  shot: string;
  videoUrl: string;
  course: string;
  format: "Singles" | "Fourball" | "Foursome";
  showMatch: boolean;
  team: "maroon" | "white";
  ownPlayers: string;
  opposingPlayers: string;
  ownStatus: string;
  opposingStatus: string;
};
type LeaderboardAnimationSettings = { birdieEnabled: boolean; birdieDelayMs: number; rowMoveMs: number };
type MockRunState = { status: "running" | "paused"; offsetMs: number; startedAt: number | null; videoDurationMs: number; seed: number; leaderboardAnimation: LeaderboardAnimationSettings };
type RehearsalClip = {
  playerSlug: string; playerName: string; round: number; hole: number; shotNumber: number;
  course: string; format: string; par: number | null; yards: number | null; url: string;
};

const DEFAULT_PREVIEW_VIDEO: PreviewVideoSettings = {
  player: "Cade Barone",
  place: "1",
  scoreToPar: "-13",
  round: "1",
  hole: "16",
  par: "4",
  yards: "611",
  shot: "1",
  videoUrl: "",
  course: "Maroon Masters Golf Club",
  format: "Singles",
  showMatch: true,
  team: "white",
  ownPlayers: "Barone",
  opposingPlayers: "Sherrell",
  ownStatus: "1 UP",
  opposingStatus: "1 DN",
};
const PREVIEW_SCENE_BUTTONS: { scene: PreviewScene; label: string }[] = [
  ...SCENE_BUTTONS,
  { scene: "video_transition", label: "Video Transition" },
  { scene: "player_video", label: "Live Player Video" },
];

const SCENE_LABELS: Record<BroadcastScene, string> = {
  holding: "Holding",
  individual_leaderboard: "Individual Leaderboard",
  match_play: "Match Play",
};

/**
 * Two modes, matching how a real broadcast control room works:
 *
 * - **Rehearsing** (not live): every control here — data year, scene — only
 *   changes the local preview iframe (a `/broadcast?preview=1&...` render
 *   that never touches the real, shared broadcast state, see
 *   app/broadcast/page.tsx). Nothing a Tiger clicks here reaches real
 *   viewers until "Go Live."
 * - **On Air** (live): controls act directly on the real /broadcast, same
 *   as before — scene overrides, Pause/Resume, announcements all take
 *   effect immediately, everywhere.
 */
export function BroadcastControlsPanel({
  initialDisplayYear,
  initialState,
  initialTracks,
  config,
}: {
  initialDisplayYear: number;
  initialState: BroadcastState;
  initialTracks: PlaylistTrack[];
  config: BroadcastConfig;
}) {
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcementText, setAnnouncementText] = useState("");
  const [announcementBusy, setAnnouncementBusy] = useState(false);
  const [tracks, setTracks] = useState(initialTracks);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [playlistBusy, setPlaylistBusy] = useState<string | null>(null);
  const [urlBusy, setUrlBusy] = useState(false);
  const [trackUrl, setTrackUrl] = useState("");
  const [trackUrlTitle, setTrackUrlTitle] = useState("");
  const [previewYear, setPreviewYear] = useState(initialDisplayYear);
  const [previewScene, setPreviewScene] = useState<PreviewScene>("individual_leaderboard");
  const [openRehearsalPanel, setOpenRehearsalPanel] = useState<PreviewScene | null>(null);
  const [previewVideo, setPreviewVideo] = useState<PreviewVideoSettings>(DEFAULT_PREVIEW_VIDEO);
  const [clipBusy, setClipBusy] = useState(false);
  const [mockRun, setMockRun] = useState<MockRunState | null>(null);
  const [mockClock, setMockClock] = useState(Date.now());
  const [mockPickerOpen, setMockPickerOpen] = useState(false);
  const [mockClips, setMockClips] = useState<RehearsalClip[]>([]);
  const [mockClipsBusy, setMockClipsBusy] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [leaderboardAnimation] = useState<LeaderboardAnimationSettings>({ birdieEnabled: true, birdieDelayMs: 7000, rowMoveMs: 1000 });
  const [animationTest, setAnimationTest] = useState<{ kind: "birdie"; startedAt: number; seed: number } | null>(null);

  // Lets a host actually hear whatever's selected in the Playlist below,
  // whether rehearsing or live — audible only in this browser tab, since
  // real /watch-live viewers only get this hook mounted once tournamentLive
  // is true (see WatchLiveExperience.tsx). Muted by default, same
  // one-click-to-unmute pattern as the real viewer player.
  const { nowPlayingTitle, muted: previewMuted, setMuted: setPreviewMuted } = useLiveBroadcastAudio(state, tracks, state.videoPhase !== null);

  const isLive = state.tournamentLive;
  const isAuto = state.automationMode === "auto";
  // The real live scene while auto rotation is running — current_scene in
  // the database is stale in that case (auto rotation never writes it
  // back, see the spec's §8/§15), so this is what Pause actually freezes on.
  const liveAutoScene = useAutoScene(state.sceneStartedAt, config, isLive && isAuto);

  // Good enough for this admin panel: whether *something* is set to show,
  // not a live moment-by-moment check against the clock (that precision
  // belongs to the actual /broadcast viewer — components/broadcast/OverlayLayer.tsx).
  // Worst case here is "Clear Now" staying visible a few seconds after an
  // announcement already auto-expired on its own; clicking it then is a no-op.
  const overlayActive = Boolean(state.overlayText);

  const previewNameCount = (value: string) => value.split(",").map((name) => name.trim()).filter(Boolean).length;
  const matchPlayerCount = previewVideo.format === "Singles" ? 1 : 2;
  const previewMatchReady = previewNameCount(previewVideo.ownPlayers) === matchPlayerCount && previewNameCount(previewVideo.opposingPlayers) === matchPlayerCount;
  const ownTeamLabel = previewVideo.team === "white" ? "White" : "Maroon";
  const opposingTeamLabel = previewVideo.team === "white" ? "Maroon" : "White";
  const mockTotalMs = getMockRunTotalMs(mockRun?.videoDurationMs);
  const mockElapsed = mockRun
    ? Math.min(mockTotalMs, mockRun.offsetMs + (mockRun.status === "running" && mockRun.startedAt ? Math.max(0, mockClock - mockRun.startedAt) : 0))
    : 0;

  useEffect(() => {
    if (!mockRun || mockRun.status !== "running" || !mockRun.startedAt) return;
    const startedAt = mockRun.startedAt;
    const offsetMs = mockRun.offsetMs;
    const timer = window.setInterval(() => {
      const elapsed = offsetMs + Math.max(0, Date.now() - startedAt);
      if (elapsed >= getMockRunTotalMs(mockRun.videoDurationMs)) {
        setMockRun(null);
        return;
      }
      setMockClock(Date.now());
    }, 250);
    return () => window.clearInterval(timer);
  }, [mockRun]);

  const previewSrc = (() => {
    if (isLive) return "/broadcast";
    const params = new URLSearchParams({
      preview: "1",
      year: String(previewYear),
      scene: previewScene,
      videoPlayer: previewVideo.player,
      videoPlace: previewVideo.place,
      videoToPar: previewVideo.scoreToPar,
      videoRound: previewVideo.round,
      videoHole: previewVideo.hole,
      videoPar: previewVideo.par,
      videoYards: previewVideo.yards,
      videoShot: previewVideo.shot,
      videoUrl: previewVideo.videoUrl,
      videoCourse: previewVideo.course,
      videoFormat: previewVideo.format,
      videoMatch: previewVideo.showMatch && previewMatchReady ? "1" : "0",
      videoTeam: previewVideo.team,
      videoOwn: previewVideo.ownPlayers,
      videoOpposing: previewVideo.opposingPlayers,
      videoOwnStatus: previewVideo.ownStatus,
      videoOpposingStatus: previewVideo.opposingStatus,
    });
    if (mockRun) {
      params.set("mock", "1");
      params.set("mockOffset", String(mockRun.status === "running" ? mockRun.offsetMs : mockElapsed));
      params.set("mockVideoDuration", String(mockRun.videoDurationMs));
      params.set("mockSeed", String(mockRun.seed));
      params.set("mockBirdieEnabled", mockRun.leaderboardAnimation.birdieEnabled ? "1" : "0");
      params.set("mockBirdieDelay", String(mockRun.leaderboardAnimation.birdieDelayMs));
      params.set("mockRowMove", String(mockRun.leaderboardAnimation.rowMoveMs));
      if (mockRun.status === "running" && mockRun.startedAt) params.set("mockStart", String(mockRun.startedAt));
    }
    if (animationTest) {
      params.set("animationTest", animationTest.kind);
      params.set("animationTestStart", String(animationTest.startedAt));
      params.set("animationTestSeed", String(animationTest.seed));
    }
    return `/broadcast?${params.toString()}`;
  })();

  function updatePreviewVideo<Key extends keyof PreviewVideoSettings>(key: Key, value: PreviewVideoSettings[Key]) {
    setPreviewVideo((current) => ({ ...current, [key]: value }));
  }

  function testBirdieAnimation() {
    let seed = Math.floor(Math.random() * 2_147_483_647);
    if (seed % 3 === 0) seed += 1; // the mock generator reserves multiples of three for bogeys
    setPreviewScene("individual_leaderboard");
    setAnimationTest({ kind: "birdie", seed, startedAt: Date.now() });
  }

  function startMockRun(videoDurationMs = MOCK_RUN_DEFAULT_VIDEO_MS, seed = Math.floor(Math.random() * 2_147_483_647)) {
    setMockClock(Date.now());
    setMockRun({ status: "running", offsetMs: 0, startedAt: Date.now(), videoDurationMs, seed, leaderboardAnimation });
  }

  function pauseMockRun() {
    if (!mockRun || mockRun.status !== "running") return;
    setMockRun({ status: "paused", offsetMs: mockElapsed, startedAt: null, videoDurationMs: mockRun.videoDurationMs, seed: mockRun.seed, leaderboardAnimation: mockRun.leaderboardAnimation });
  }

  function resumeMockRun() {
    if (!mockRun || mockRun.status !== "paused") return;
    setMockClock(Date.now());
    setMockRun({ ...mockRun, status: "running", startedAt: Date.now() });
  }

  function seekMockRun(offsetMs: number) {
    const clamped = Math.min(mockTotalMs, Math.max(0, offsetMs));
    setMockClock(Date.now());
    setMockRun((current) => current?.status === "running"
      ? { ...current, offsetMs: clamped, startedAt: Date.now() }
      : { status: "paused", offsetMs: clamped, startedAt: null, videoDurationMs: MOCK_RUN_DEFAULT_VIDEO_MS, seed: Math.floor(Math.random() * 2_147_483_647), leaderboardAnimation });
  }

  async function openMockPicker() {
    setMockPickerOpen((open) => !open);
    if (mockClips.length > 0 || mockClipsBusy) return;
    setMockClipsBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/tiger/broadcast/rehearsal-videos?year=${previewYear}`);
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not load archived clips.");
        return;
      }
      setMockClips(data.clips);
    } finally {
      setMockClipsBusy(false);
    }
  }

  async function startMockFromClip(clip: RehearsalClip) {
    setPreviewVideo((current) => ({
      ...current,
      player: clip.playerName,
      round: String(clip.round),
      hole: String(clip.hole),
      shot: String(clip.shotNumber),
      par: clip.par == null ? current.par : String(clip.par),
      yards: clip.yards == null ? current.yards : String(clip.yards),
      course: clip.course,
      format: clip.format === "Foursome" ? "Foursome" : clip.format === "Fourball" ? "Fourball" : "Singles",
      videoUrl: clip.url,
    }));
    setMockPickerOpen(false);
    const durationMs = await new Promise<number>((resolve) => {
      const probe = document.createElement("video");
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(Number.isFinite(probe.duration) && probe.duration > 0 ? Math.round(probe.duration * 1000) : MOCK_RUN_DEFAULT_VIDEO_MS);
      };
      const timeout = window.setTimeout(done, 5000);
      probe.preload = "metadata";
      probe.onloadedmetadata = done;
      probe.onerror = done;
      probe.src = clip.url;
    });
    startMockRun(durationMs);
  }

  async function loadCamRoundThreeClip() {
    setClipBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/rehearsal-video?year=2026&playerSlug=cam-latto&round=3&hole=5&shotNumber=4");
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not load Cam's scorecard clip.");
        return;
      }
      setPreviewVideo((current) => ({
        ...current,
        player: data.video.playerName,
        round: "3",
        hole: "5",
        shot: "4",
        par: data.video.par == null ? current.par : String(data.video.par),
        yards: data.video.yards == null ? current.yards : String(data.video.yards),
        course: data.video.course || current.course,
        format: data.video.format === "Foursome" ? "Foursome" : data.video.format === "Fourball" ? "Fourball" : "Singles",
        videoUrl: data.video.url,
        showMatch: true,
        team: "maroon",
        ownPlayers: "Latto, Drew",
        opposingPlayers: "Quez, Collin",
        ownStatus: "AS",
        opposingStatus: "AS",
      }));
    } finally {
      setClipBusy(false);
    }
  }

  async function postAnnouncement() {
    const text = announcementText.trim();
    if (!text) return;
    setAnnouncementBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, durationSeconds: 8 }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not post the announcement.");
        return;
      }
      setState((current) => ({ ...current, overlayText: text, overlayExpiresAt: new Date(Date.now() + 8000).toISOString() }));
      setAnnouncementText("");
    } finally {
      setAnnouncementBusy(false);
    }
  }

  async function clearAnnouncement() {
    setAnnouncementBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not clear the announcement.");
        return;
      }
      setState((current) => ({ ...current, overlayText: null, overlayExpiresAt: null }));
    } finally {
      setAnnouncementBusy(false);
    }
  }

  async function uploadTrack(file: File) {
    setUploadBusy(true);
    setError(null);
    try {
      const extension = "." + (file.name.split(".").pop() ?? "mp3").toLowerCase();
      const signRes = await fetch("/api/portal/tiger/broadcast/playlist/upload/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extension }),
      });
      const signData = await signRes.json();
      if (!signData.ok) {
        setError(signData.error ?? "Could not prepare that upload.");
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", signData.url);
        xhr.setRequestHeader("Content-Type", file.type || "audio/mpeg");
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (status ${xhr.status}).`)));
        xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
        xhr.send(file);
      });

      const durationSeconds = await new Promise<number>((resolve, reject) => {
        const probe = new Audio();
        probe.preload = "metadata";
        probe.onloadedmetadata = () => resolve(probe.duration);
        probe.onerror = () => reject(new Error("Could not read that file's length."));
        probe.src = URL.createObjectURL(file);
      });

      const confirmRes = await fetch("/api/portal/tiger/broadcast/playlist/upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: file.name.replace(/\.[^.]+$/, ""), storagePath: signData.storagePath, durationSeconds }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmData.ok) {
        setError(confirmData.error ?? "Uploaded, but could not save it to the playlist.");
        return;
      }
      setTracks((current) => [...current, confirmData.track]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that file.");
    } finally {
      setUploadBusy(false);
    }
  }

  async function addTrackFromUrl() {
    const url = trackUrl.trim();
    const title = trackUrlTitle.trim();
    if (!url || !title) return;
    setUrlBusy(true);
    setError(null);
    try {
      // The browser measures the track's length itself, same technique as
      // uploadTrack — the server (which does the actual download, see
      // .../upload/from-url) has no built-in way to read an mp3's duration
      // without a new dependency, and the browser already does this for free.
      const durationSeconds = await new Promise<number>((resolve, reject) => {
        const probe = new Audio();
        probe.preload = "metadata";
        probe.onloadedmetadata = () => resolve(probe.duration);
        probe.onerror = () => reject(new Error("Could not read that link — check it's a direct link to an audio file."));
        probe.src = url;
      });

      const res = await fetch("/api/portal/tiger/broadcast/playlist/upload/from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, title, durationSeconds }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not add that link.");
        return;
      }
      setTracks((current) => [...current, data.track]);
      setTrackUrl("");
      setTrackUrlTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that link.");
    } finally {
      setUrlBusy(false);
    }
  }

  async function playTrack(trackId: string) {
    setPlaylistBusy(trackId);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/playlist/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not start that track.");
        return;
      }
      setState((current) => ({ ...current, audioTrackId: trackId, audioStartedAt: new Date().toISOString() }));
    } finally {
      setPlaylistBusy(null);
    }
  }

  async function pausePlaylist() {
    setPlaylistBusy("pause");
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/playlist/pause", { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not pause the playlist.");
        return;
      }
      setState((current) => ({ ...current, audioTrackId: null, audioStartedAt: null }));
    } finally {
      setPlaylistBusy(null);
    }
  }

  async function setLoopMode(mode: "one" | "all") {
    setPlaylistBusy(`loop-${mode}`);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/playlist/loop-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not change loop mode.");
        return;
      }
      setState((current) => ({ ...current, audioLoopMode: mode }));
    } finally {
      setPlaylistBusy(null);
    }
  }

  async function setShuffle(shuffle: boolean) {
    setPlaylistBusy(`shuffle-${shuffle}`);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/playlist/shuffle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shuffle }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not change shuffle.");
        return;
      }
      setState((current) => ({ ...current, audioShuffle: shuffle }));
    } finally {
      setPlaylistBusy(null);
    }
  }

  async function deleteTrack(trackId: string) {
    setPlaylistBusy(`delete-${trackId}`);
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/playlist/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not remove that track.");
        return;
      }
      setTracks((current) => current.filter((t) => t.id !== trackId));
      setState((current) => (current.audioTrackId === trackId ? { ...current, audioTrackId: null, audioStartedAt: null } : current));
    } finally {
      setPlaylistBusy(null);
    }
  }

  async function setLiveScene(scene: BroadcastScene | null, options?: { paused?: boolean; busyKey?: string }) {
    setBusy(options?.busyKey ?? scene ?? "auto");
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene, paused: options?.paused ?? false }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not update the broadcast.");
        return;
      }
      setState((current) => ({
        ...current,
        automationMode: scene === null ? "auto" : "producer",
        currentScene: scene ?? current.currentScene,
        paused: scene !== null && (options?.paused ?? false),
      }));
    } finally {
      setBusy(null);
    }
  }

  function pause() {
    setLiveScene(liveAutoScene, { paused: true, busyKey: "pause" });
  }

  async function goLive() {
    setBusy("golive");
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ live: true, year: previewYear }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not go live.");
        return;
      }
      setState((current) => ({
        ...current,
        seasonYear: previewYear,
        tournamentLive: true,
        automationMode: "auto",
        sceneStartedAt: new Date().toISOString(),
      }));
    } finally {
      setBusy(null);
    }
  }

  async function endBroadcast() {
    setBusy("end");
    setError(null);
    try {
      const res = await fetch("/api/portal/tiger/broadcast/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ live: false }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Could not end the broadcast.");
        return;
      }
      setState((current) => ({ ...current, tournamentLive: false, audioTrackId: null, audioStartedAt: null }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6">
      <div className="mt-4">
        <BroadcastPreview src={previewSrc} />
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg border-2 border-stone-300 p-4">
        <span
          className={[
            "rounded-full px-3 py-1 font-condensed text-2xs font-semibold uppercase tracking-wide",
            isLive ? "bg-maroon-700 text-white" : "bg-stone-200 text-ink-700",
          ].join(" ")}
        >
          {isLive ? "On Air" : "Rehearsing"}
        </span>
        {isLive ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={endBroadcast}
            className="rounded-lg border-2 border-stone-300 px-4 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-ink-700 transition hover:bg-stone-50 disabled:opacity-50"
          >
            {busy === "end" ? "Ending…" : "End Broadcast"}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy !== null} onClick={openMockPicker} className="rounded-lg border-2 border-gold-500 bg-gold-50 px-4 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-ink-900 transition hover:bg-gold-100 disabled:opacity-50">Mock Run</button>
            <button type="button" disabled={busy !== null} onClick={goLive} className="rounded-lg bg-maroon-700 px-4 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-maroon-800 disabled:opacity-50">
              {busy === "golive" ? "Going Live…" : `Go Live (${previewYear})`}
            </button>
          </div>
        )}
      </div>
      {!isLive && mockPickerOpen && (
        <section className="rounded-b-lg border-x-2 border-b-2 border-gold-400 bg-gold-50/50 p-4">
          <h2 className="font-serif text-lg font-bold text-ink-900">Choose a mock</h2>
          <p className="mt-1 font-sans text-xs text-ink-600">Each run uses a real archived shot, plays the full broadcast sequence twice, and keeps the player-video section on screen for that clip&apos;s actual length.</p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => { setMockPickerOpen(false); startMockRun(); }} className="rounded-lg border-2 border-stone-300 bg-white p-3 text-left transition hover:border-gold-500">
              <span className="block font-condensed text-sm font-semibold uppercase tracking-wide text-ink-900">Overlay demo</span>
              <span className="mt-1 block font-sans text-xs text-ink-600">Uses the rehearsal values currently in the controls.</span>
            </button>
            {mockClips.map((clip) => (
              <button key={`${clip.playerSlug}-${clip.round}-${clip.hole}-${clip.shotNumber}`} type="button" onClick={() => { void startMockFromClip(clip); }} className="rounded-lg border-2 border-stone-300 bg-white p-3 text-left transition hover:border-gold-500">
                <span className="block font-condensed text-sm font-semibold uppercase tracking-wide text-ink-900">{clip.playerName} · R{clip.round} · Hole {clip.hole} · Shot {clip.shotNumber}</span>
                <span className="mt-1 block font-sans text-xs text-ink-600">{clip.course} · {clip.format}{clip.par ? ` · Par ${clip.par}` : ""}{clip.yards ? ` · ${clip.yards} yds` : ""}</span>
              </button>
            ))}
          </div>
          {mockClipsBusy && <p className="mt-3 font-sans text-xs text-ink-600">Loading uploaded scorecard clips…</p>}
          {!mockClipsBusy && mockClips.length === 0 && <p className="mt-3 font-sans text-xs text-ink-600">No uploaded clips were found for {previewYear}. The overlay demo is still available.</p>}
        </section>
      )}
      {!isLive && mockRun && (
        <section className="rounded-b-lg border-x-2 border-b-2 border-gold-400 bg-gold-50/50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-condensed text-sm font-semibold uppercase tracking-wide text-ink-900">Two-cycle mock run</h2>
              <p className="font-sans text-xs text-ink-600">Leaderboard, Match Play, Holding, player transition, and player video — then repeated once.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={mockRun.status === "running" ? pauseMockRun : resumeMockRun} className="rounded-lg border-2 border-stone-300 bg-white px-3 py-2 font-condensed text-xs font-semibold uppercase tracking-wide text-ink-800">{mockRun.status === "running" ? "Pause" : "Resume"}</button>
              <button type="button" onClick={() => startMockRun(mockRun.videoDurationMs)} className="rounded-lg border-2 border-gold-500 bg-gold-50 px-3 py-2 font-condensed text-xs font-semibold uppercase tracking-wide text-ink-800">Randomize</button>
              <button type="button" onClick={() => setMockRun(null)} className="rounded-lg border-2 border-stone-300 bg-white px-3 py-2 font-condensed text-xs font-semibold uppercase tracking-wide text-ink-800">End Mock</button>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <input type="range" min="0" max={mockTotalMs} step="1000" value={mockElapsed} onChange={(e) => seekMockRun(Number(e.target.value))} className="min-w-0 flex-1 accent-maroon-700" aria-label="Rewind mock broadcast" />
            <span className="w-24 text-right font-mono text-xs text-ink-700">{Math.floor(mockElapsed / 60000)}:{String(Math.floor((mockElapsed % 60000) / 1000)).padStart(2, "0")} / {Math.floor(mockTotalMs / 60000)}:{String(Math.floor((mockTotalMs % 60000) / 1000)).padStart(2, "0")}</span>
          </div>
        </section>
      )}
      {error && <p className="mt-2 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}

      {!isLive ? (
        <div className="mt-4">
          <p className="font-sans text-xs text-ink-500">
            Nothing below affects the real /broadcast yet — this is a private rehearsal. Hit Go Live when it looks right.
          </p>

          <label className="mt-3 flex flex-col gap-1 font-sans text-xs text-ink-700">
            Data year
            <select
              value={previewYear}
              onChange={(e) => setPreviewYear(Number(e.target.value))}
              className="w-40 rounded-lg border-2 border-stone-300 px-3 py-2 text-sm"
            >
              {DISPLAY_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {PREVIEW_SCENE_BUTTONS.map((b) => (
              <button
                key={b.scene}
                type="button"
                onClick={() => {
                  setPreviewScene(b.scene);
                  setAnimationTest(null);
                  setOpenRehearsalPanel((open) => open === b.scene ? null : b.scene);
                }}
                className={[
                  "rounded-lg border-2 px-4 py-4 font-condensed text-sm font-semibold uppercase tracking-wide transition",
                  previewScene === b.scene ? "border-maroon-700 bg-maroon-700 text-white" : "border-stone-300 text-ink-700 hover:bg-stone-50",
                ].join(" ")}
              >
                {b.label}
              </button>
            ))}
          </div>

          {openRehearsalPanel === "individual_leaderboard" && (
            <section className="mt-4 rounded-lg border-2 border-gold-400 bg-gold-50/40 p-4">
              <h2 className="font-serif text-lg font-bold text-ink-900">Individual Leaderboard animations</h2>
              <div className="mt-3 flex items-center justify-between rounded-lg border-2 border-stone-300 bg-white px-3 py-3">
                <div>
                  <h3 className="font-condensed text-sm font-semibold uppercase tracking-wide text-ink-900">Birdie</h3>
                  <p className="mt-1 font-sans text-xs text-ink-600">Callout, score update, then row movement.</p>
                </div>
                <button type="button" onClick={testBirdieAnimation} className="rounded-lg bg-maroon-700 px-3 py-2 font-condensed text-xs font-semibold uppercase tracking-wide text-white hover:bg-maroon-800">Test Animation</button>
              </div>
            </section>
          )}
          {openRehearsalPanel === "match_play" && (
            <section className="mt-4 rounded-lg border-2 border-gold-400 bg-gold-50/40 p-4">
              <h2 className="font-serif text-lg font-bold text-ink-900">Match Play scene controls</h2>
              <p className="mt-1 font-sans text-xs text-ink-600">This dropdown is the home for Match Play animations and simulated match-state controls as we build them. The current preview is selected above and remains rehearsal-only.</p>
            </section>
          )}
          {openRehearsalPanel === "holding" && (
            <section className="mt-4 rounded-lg border-2 border-gold-400 bg-gold-50/40 p-4">
              <h2 className="font-serif text-lg font-bold text-ink-900">Holding scene controls</h2>
              <p className="mt-1 font-sans text-xs text-ink-600">This is where holding-screen timing, motion, and music-transition settings will live. It currently previews the selected holding scene.</p>
            </section>
          )}
          {openRehearsalPanel === "video_transition" && (
            <section className="mt-4 rounded-lg border-2 border-gold-400 bg-gold-50/40 p-4">
              <h2 className="font-serif text-lg font-bold text-ink-900">Player video transition controls</h2>
              <p className="mt-1 font-sans text-xs text-ink-600">The transition holds for four seconds before the player video. Its animation and music-fade settings will be built here.</p>
            </section>
          )}
          {openRehearsalPanel === "player_video" && (
            <section className="mt-4 rounded-lg border-2 border-gold-400 bg-gold-50/40 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <h2 className="font-serif text-lg font-bold text-ink-900">Live Player Video rehearsal controls</h2>
                <p className="font-sans text-xs text-ink-500">Preview only — this never changes the real broadcast.</p>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <p className="font-sans text-xs text-ink-600">Use commas to stack partners or opponents in the match overlay.</p>
                <button
                  type="button"
                  disabled={clipBusy}
                  onClick={loadCamRoundThreeClip}
                  className="rounded-lg border border-gold-500 bg-white px-3 py-1 font-condensed text-xs font-semibold uppercase tracking-wide text-ink-800 hover:bg-gold-50"
                >
                  {clipBusy ? "Loading Cam clip…" : "Load Cam R3 · Classic · H5 · Shot 4"}
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <label className="col-span-2 flex flex-col gap-1 font-sans text-xs text-ink-700">
                  Player name
                  <input value={previewVideo.player} onChange={(e) => updatePreviewVideo("player", e.target.value)} className="rounded-lg border-2 border-stone-300 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="flex flex-col gap-1 font-sans text-xs text-ink-700">
                  Tournament place
                  <input type="number" min="1" value={previewVideo.place} onChange={(e) => updatePreviewVideo("place", e.target.value)} className="rounded-lg border-2 border-stone-300 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="flex flex-col gap-1 font-sans text-xs text-ink-700">
                  Score to par
                  <input value={previewVideo.scoreToPar} onChange={(e) => updatePreviewVideo("scoreToPar", e.target.value)} placeholder="-13" className="rounded-lg border-2 border-stone-300 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="flex flex-col gap-1 font-sans text-xs text-ink-700">
                  Round
                  <input type="number" min="1" max="8" value={previewVideo.round} onChange={(e) => updatePreviewVideo("round", e.target.value)} className="rounded-lg border-2 border-stone-300 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="flex flex-col gap-1 font-sans text-xs text-ink-700">
                  Hole
                  <input type="number" min="1" max="18" value={previewVideo.hole} onChange={(e) => updatePreviewVideo("hole", e.target.value)} className="rounded-lg border-2 border-stone-300 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="flex flex-col gap-1 font-sans text-xs text-ink-700">
                  Par
                  <input type="number" min="3" max="6" value={previewVideo.par} onChange={(e) => updatePreviewVideo("par", e.target.value)} className="rounded-lg border-2 border-stone-300 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="flex flex-col gap-1 font-sans text-xs text-ink-700">
                  Yardage
                  <input type="number" min="1" value={previewVideo.yards} onChange={(e) => updatePreviewVideo("yards", e.target.value)} className="rounded-lg border-2 border-stone-300 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="flex flex-col gap-1 font-sans text-xs text-ink-700">
                  Shot being hit
                  <input type="number" min="1" value={previewVideo.shot} onChange={(e) => updatePreviewVideo("shot", e.target.value)} className="rounded-lg border-2 border-stone-300 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="col-span-2 flex flex-col gap-1 font-sans text-xs text-ink-700">
                  Rehearsal clip URL <span className="font-normal text-ink-500">(optional public MP4/WebM link)</span>
                  <input type="url" value={previewVideo.videoUrl} onChange={(e) => updatePreviewVideo("videoUrl", e.target.value)} placeholder="Paste Cam's uploaded video URL" className="rounded-lg border-2 border-stone-300 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="col-span-2 flex flex-col gap-1 font-sans text-xs text-ink-700">
                  Golf course
                  <input value={previewVideo.course} onChange={(e) => updatePreviewVideo("course", e.target.value)} className="rounded-lg border-2 border-stone-300 bg-white px-3 py-2 text-sm" />
                </label>
                <label className="col-span-2 flex flex-col gap-1 font-sans text-xs text-ink-700">
                  Format
                  <select value={previewVideo.format} onChange={(e) => updatePreviewVideo("format", e.target.value as PreviewVideoSettings["format"])} className="rounded-lg border-2 border-stone-300 bg-white px-3 py-2 text-sm">
                    <option value="Singles">Singles</option>
                    <option value="Fourball">Fourball</option>
                    <option value="Foursome">Foursome / Alternate Shot</option>
                  </select>
                </label>
              </div>

              <div className="mt-4 border-t border-gold-300 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-condensed text-sm font-semibold uppercase tracking-wide text-ink-900">Match group</h3>
                  <label className="flex items-center gap-2 font-sans text-xs font-semibold text-ink-700">
                    <input type="checkbox" checked={previewVideo.showMatch} onChange={(e) => updatePreviewVideo("showMatch", e.target.checked)} className="size-4 accent-maroon-700" />
                    Show match overlay
                  </label>
                </div>
                <div className={["mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2", !previewVideo.showMatch ? "opacity-45" : ""].join(" ")}>
                  <label className="flex flex-col gap-1 font-sans text-xs text-ink-700">
                    Player&apos;s team
                    <select disabled={!previewVideo.showMatch} value={previewVideo.team} onChange={(e) => updatePreviewVideo("team", e.target.value as "maroon" | "white")} className="rounded-lg border-2 border-stone-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed">
                      <option value="white">White</option>
                      <option value="maroon">Maroon</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 font-sans text-xs text-ink-700">
                    Player&apos;s match status
                    <input disabled={!previewVideo.showMatch} value={previewVideo.ownStatus} onChange={(e) => updatePreviewVideo("ownStatus", e.target.value)} placeholder="1 UP" className="rounded-lg border-2 border-stone-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed" />
                  </label>
                  <label className="flex flex-col gap-1 font-sans text-xs text-ink-700">
                    {ownTeamLabel} player{matchPlayerCount === 1 ? "" : "s"}
                    <input disabled={!previewVideo.showMatch} value={previewVideo.ownPlayers} onChange={(e) => updatePreviewVideo("ownPlayers", e.target.value)} placeholder="Barone, Smith" className="rounded-lg border-2 border-stone-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed" />
                  </label>
                  <label className="flex flex-col gap-1 font-sans text-xs text-ink-700">
                    {opposingTeamLabel} player{matchPlayerCount === 1 ? "" : "s"}
                    <input disabled={!previewVideo.showMatch} value={previewVideo.opposingPlayers} onChange={(e) => updatePreviewVideo("opposingPlayers", e.target.value)} placeholder="Sherrell, Jones" className="rounded-lg border-2 border-stone-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed" />
                  </label>
                  <label className="flex flex-col gap-1 font-sans text-xs text-ink-700 sm:col-start-2">
                    Opponent&apos;s match status
                    <input disabled={!previewVideo.showMatch} value={previewVideo.opposingStatus} onChange={(e) => updatePreviewVideo("opposingStatus", e.target.value)} placeholder="1 DN" className="rounded-lg border-2 border-stone-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed" />
                  </label>
                </div>
                {previewVideo.showMatch && !previewMatchReady && (
                  <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 font-sans text-xs font-semibold text-red-700">
                    {previewVideo.format} requires {matchPlayerCount} {ownTeamLabel} player{matchPlayerCount === 1 ? "" : "s"} and {matchPlayerCount} {opposingTeamLabel} player{matchPlayerCount === 1 ? "" : "s"}. Add comma-separated last names for both sides to show the match overlay.
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <p className="font-sans text-sm text-ink-700">
            Currently showing: <span className="font-semibold text-ink-900">{SCENE_LABELS[isAuto ? liveAutoScene : state.currentScene]}</span> —{" "}
            {isAuto ? "Auto rotation" : state.paused ? "Paused" : "Producer Mode (manual)"}
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {SCENE_BUTTONS.map((b) => (
              <button
                key={b.scene}
                type="button"
                disabled={busy !== null}
                onClick={() => setLiveScene(b.scene)}
                className="rounded-lg border-2 border-maroon-700 bg-maroon-700 px-4 py-4 font-condensed text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-maroon-800 disabled:opacity-50"
              >
                {busy === b.scene ? "Switching…" : `Show ${b.label}`}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy !== null || !isAuto}
              onClick={pause}
              className="rounded-lg border-2 border-stone-300 px-4 py-4 font-condensed text-sm font-semibold uppercase tracking-wide text-ink-700 transition hover:bg-stone-50 disabled:opacity-50"
            >
              {busy === "pause" ? "Pausing…" : "Pause Automation"}
            </button>
            <button
              type="button"
              disabled={busy !== null || isAuto}
              onClick={() => setLiveScene(null)}
              className="rounded-lg border-2 border-stone-300 px-4 py-4 font-condensed text-sm font-semibold uppercase tracking-wide text-ink-700 transition hover:bg-stone-50 disabled:opacity-50"
            >
              {busy === "auto" ? "Resuming…" : "Resume / Return to Auto"}
            </button>
          </div>

          <section className="mt-8 rounded-lg border-2 border-stone-300 p-4">
            <h2 className="font-serif text-lg font-bold text-ink-900">Announcement</h2>
            <p className="mt-1 font-sans text-xs text-ink-500">Shows as a banner over whatever&apos;s on screen for 8 seconds, then disappears on its own.</p>
            {overlayActive && <p className="mt-2 font-sans text-xs font-semibold text-maroon-700">Currently showing: &ldquo;{state.overlayText}&rdquo;</p>}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={announcementText}
                onChange={(e) => setAnnouncementText(e.target.value)}
                maxLength={120}
                placeholder="e.g. Round 1 tee times pushed back 15 minutes"
                className="flex-1 rounded-lg border-2 border-stone-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={announcementBusy || !announcementText.trim()}
                onClick={postAnnouncement}
                className="rounded-lg bg-maroon-700 px-4 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-50"
              >
                Post
              </button>
              {overlayActive && (
                <button
                  type="button"
                  disabled={announcementBusy}
                  onClick={clearAnnouncement}
                  className="rounded-lg border-2 border-stone-300 px-4 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-ink-700 disabled:opacity-50"
                >
                  Clear Now
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Visible whether rehearsing or on air — a host can upload, test-listen
          to (this browser only, via useLiveBroadcastAudio above), and queue
          up songs before Go Live, not just once live. */}
      <section className="mt-8 rounded-lg border-2 border-stone-300 p-4">
        <button type="button" onClick={() => setPlaylistOpen((open) => !open)} className="flex w-full items-center justify-between text-left">
          <span className="font-serif text-lg font-bold text-ink-900">Broadcast Playlist</span>
          <span className="font-condensed text-sm font-semibold uppercase tracking-wide text-maroon-700">{playlistOpen ? "Close" : "Open"}</span>
        </button>
        {playlistOpen && <div className="mt-1">
        <p className="font-sans text-xs text-ink-500">
          {isLive
            ? "Playing live on /watch-live. Stops automatically when you end the broadcast."
            : "Test songs here anytime — only you hear this until you Go Live, which starts the show with whatever's queued (or the top of the list)."}
        </p>

        {state.audioTrackId && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-2">
            <button
              type="button"
              onClick={() => setPreviewMuted(!previewMuted)}
              aria-label={previewMuted ? "Unmute preview" : "Mute preview"}
              className="text-ink-700"
            >
              {previewMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <span className="font-sans text-xs text-ink-700">
              {previewMuted ? "Muted — " : "Playing — "}
              {nowPlayingTitle ?? "…"}
            </span>
          </div>
        )}

        <label className="mt-3 inline-block cursor-pointer rounded-lg bg-maroon-700 px-4 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-maroon-800">
          {uploadBusy ? "Uploading…" : "Upload Song"}
          <input
            type="file"
            accept="audio/*"
            disabled={uploadBusy}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) uploadTrack(file);
            }}
          />
        </label>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            value={trackUrl}
            onChange={(e) => setTrackUrl(e.target.value)}
            placeholder="Or paste a direct link to an mp3…"
            className="flex-1 rounded-lg border-2 border-stone-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={trackUrlTitle}
            onChange={(e) => setTrackUrlTitle(e.target.value)}
            placeholder="Song title"
            className="rounded-lg border-2 border-stone-300 px-3 py-2 text-sm sm:w-40"
          />
          <button
            type="button"
            disabled={urlBusy || !trackUrl.trim() || !trackUrlTitle.trim()}
            onClick={addTrackFromUrl}
            className="rounded-lg border-2 border-stone-300 px-4 py-2 font-condensed text-sm font-semibold uppercase tracking-wide text-ink-700 transition hover:bg-stone-50 disabled:opacity-50"
          >
            {urlBusy ? "Adding…" : "Add"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={playlistBusy !== null}
            onClick={() => setLoopMode("one")}
            className={[
              "rounded-lg border-2 px-3 py-2 font-condensed text-xs font-semibold uppercase tracking-wide transition disabled:opacity-50",
              state.audioLoopMode === "one" ? "border-maroon-700 bg-maroon-700 text-white" : "border-stone-300 text-ink-700 hover:bg-stone-50",
            ].join(" ")}
          >
            Loop One
          </button>
          <button
            type="button"
            disabled={playlistBusy !== null}
            onClick={() => setLoopMode("all")}
            className={[
              "rounded-lg border-2 px-3 py-2 font-condensed text-xs font-semibold uppercase tracking-wide transition disabled:opacity-50",
              state.audioLoopMode === "all" ? "border-maroon-700 bg-maroon-700 text-white" : "border-stone-300 text-ink-700 hover:bg-stone-50",
            ].join(" ")}
          >
            Loop All
          </button>
          <button
            type="button"
            disabled={playlistBusy !== null || state.audioLoopMode === "one"}
            onClick={() => setShuffle(!state.audioShuffle)}
            title={state.audioLoopMode === "one" ? "Shuffle only applies to Loop All" : undefined}
            className={[
              "rounded-lg border-2 px-3 py-2 font-condensed text-xs font-semibold uppercase tracking-wide transition disabled:opacity-50",
              state.audioShuffle ? "border-maroon-700 bg-maroon-700 text-white" : "border-stone-300 text-ink-700 hover:bg-stone-50",
            ].join(" ")}
          >
            Shuffle {state.audioShuffle ? "On" : "Off"}
          </button>
        </div>

        {tracks.length === 0 ? (
          <p className="mt-4 font-sans text-sm text-ink-500">No songs uploaded yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {tracks.map((track) => {
              const isPlaying = state.audioTrackId === track.id;
              return (
                <li key={track.id} className="flex items-center justify-between gap-3 rounded-lg border-2 border-stone-200 px-3 py-2">
                  <span className={["truncate font-sans text-sm", isPlaying ? "font-semibold text-maroon-700" : "text-ink-700"].join(" ")}>
                    {isPlaying ? "▶ " : ""}
                    {track.title}
                  </span>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={playlistBusy !== null}
                      onClick={isPlaying ? pausePlaylist : () => playTrack(track.id)}
                      className={[
                        "rounded-lg border-2 px-3 py-1 font-condensed text-xs font-semibold uppercase tracking-wide transition disabled:opacity-50",
                        isPlaying ? "border-maroon-700 bg-maroon-700 text-[0px] text-white hover:bg-maroon-800" : "border-stone-300 text-ink-700 hover:bg-stone-50",
                      ].join(" ")}
                    >
                      {isPlaying && <span className="text-xs">{playlistBusy === "pause" ? "Pausing…" : "Pause"}</span>}
                      {playlistBusy === track.id ? "Starting…" : "Play"}
                    </button>
                    <button
                      type="button"
                      disabled={playlistBusy !== null}
                      onClick={() => deleteTrack(track.id)}
                      className="rounded-lg border-2 border-stone-300 px-3 py-1 font-condensed text-xs font-semibold uppercase tracking-wide text-ink-700 transition hover:bg-stone-50 disabled:opacity-50"
                    >
                      {playlistBusy === `delete-${track.id}` ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        </div>}
      </section>
    </div>
  );
}
