import assert from "node:assert/strict";
import test from "node:test";
import { advanceAnimationQueue, emptyAnimationQueue, enqueueScoreAnimation, sceneExitAt } from "./animationQueue.ts";

test("an animation waits four seconds after its scene becomes visible", () => {
  const queued = enqueueScoreAnimation(emptyAnimationQueue(), { id: "birdie", scene: "individual_leaderboard", kind: "birdie", queuedAt: 0 });
  assert.equal(advanceAnimationQueue(queued, "individual_leaderboard", 0, 3_999).active, null);
  assert.equal(advanceAnimationQueue(queued, "individual_leaderboard", 0, 4_000).active?.id, "birdie");
});

test("each actual start pushes the scene exit to five seconds from that start", () => {
  let state = emptyAnimationQueue();
  state = enqueueScoreAnimation(state, { id: "birdie", scene: "individual_leaderboard", kind: "birdie", queuedAt: 7_000 });
  state = advanceAnimationQueue(state, "individual_leaderboard", 0, 7_000);
  assert.equal(sceneExitAt(10_000, state, "individual_leaderboard"), 12_000);
  state = enqueueScoreAnimation(state, { id: "bogey", scene: "individual_leaderboard", kind: "bogey", queuedAt: 9_000 });
  state = advanceAnimationQueue(state, "individual_leaderboard", 0, 11_000);
  assert.equal(state.active?.id, "bogey");
  assert.equal(sceneExitAt(12_000, state, "individual_leaderboard"), 16_000);
});
