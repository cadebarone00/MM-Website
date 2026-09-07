import type { BroadcastScene } from "./types";

/** A visual score animation belongs to one leaderboard scene only. */
export type AnimationScene = Extract<BroadcastScene, "individual_leaderboard" | "match_play">;
export type ScoreAnimationKind = "birdie" | "eagle" | "bogey";

export interface QueuedScoreAnimation {
  id: string;
  scene: AnimationScene;
  kind: ScoreAnimationKind;
  queuedAt: number;
}

export interface ActiveScoreAnimation extends QueuedScoreAnimation {
  startedAt: number;
  endsAt: number;
}

export interface AnimationQueueState {
  pending: QueuedScoreAnimation[];
  active: ActiveScoreAnimation | null;
  /** Last actual start for each scene; arrival time never controls spacing. */
  lastStartedAt: Partial<Record<AnimationScene, number>>;
  /** The auto-rotation must not leave a scene before this instant. */
  exitNotBefore: Partial<Record<AnimationScene, number>>;
}

export const ANIMATION_START_GAP_MS = 4_000;
export const ANIMATION_SCENE_EXTENSION_MS = 5_000;
export const SCORE_ANIMATION_DURATION_MS = 1_900;

export function emptyAnimationQueue(): AnimationQueueState {
  return { pending: [], active: null, lastStartedAt: {}, exitNotBefore: {} };
}

/** Deduplicates by source id while retaining FIFO order inside each scene. */
export function enqueueScoreAnimation(state: AnimationQueueState, animation: QueuedScoreAnimation): AnimationQueueState {
  if (state.active?.id === animation.id || state.pending.some((item) => item.id === animation.id)) return state;
  return { ...state, pending: [...state.pending, animation] };
}

/**
 * Starts at most one animation. A scene must have been visible for four
 * seconds and the preceding animation on that scene must have started at
 * least four seconds ago. Starting an item gives the audience five seconds
 * from that exact start instant, rather than adding five seconds blindly.
 */
export function advanceAnimationQueue(
  state: AnimationQueueState,
  visibleScene: BroadcastScene,
  sceneEnteredAt: number,
  now: number,
  durationMs = SCORE_ANIMATION_DURATION_MS
): AnimationQueueState {
  const active = state.active && state.active.endsAt > now ? state.active : null;
  const base = active === state.active ? state : { ...state, active: null };
  if (active || (visibleScene !== "individual_leaderboard" && visibleScene !== "match_play")) return base;

  const nextIndex = base.pending.findIndex((item) => item.scene === visibleScene);
  if (nextIndex < 0) return base;
  const previousStart = base.lastStartedAt[visibleScene] ?? Number.NEGATIVE_INFINITY;
  const eligibleAt = Math.max(sceneEnteredAt + ANIMATION_START_GAP_MS, previousStart + ANIMATION_START_GAP_MS);
  if (now < eligibleAt) return base;

  const next = base.pending[nextIndex];
  const pending = base.pending.filter((_, index) => index !== nextIndex);
  const started: ActiveScoreAnimation = { ...next, startedAt: now, endsAt: now + durationMs };
  return {
    pending,
    active: started,
    lastStartedAt: { ...base.lastStartedAt, [visibleScene]: now },
    exitNotBefore: { ...base.exitNotBefore, [visibleScene]: Math.max(base.exitNotBefore[visibleScene] ?? 0, now + ANIMATION_SCENE_EXTENSION_MS) },
  };
}

/** A normal rotation deadline is only delayed when an animation requires it. */
export function sceneExitAt(baseExitAt: number, state: AnimationQueueState, scene: BroadcastScene): number {
  const extension = scene === "individual_leaderboard" || scene === "match_play" ? state.exitNotBefore[scene] ?? 0 : 0;
  return Math.max(baseExitAt, extension);
}
