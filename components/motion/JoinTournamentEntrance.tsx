"use client";

import { useLayoutEffect } from "react";
import { motion, useAnimationControls, type HTMLMotionProps } from "motion/react";
import { consumeJoinTournamentTransition } from "./joinTournamentTransition";
import { useAppMotion } from "./useAppMotion";

/** Preserves the destination's existing main element and server-rendered children. */
export function JoinTournamentEntrance({ children, className }: Pick<HTMLMotionProps<"main">, "children" | "className">) {
  const controls = useAnimationControls();
  const { pageEntrance, reducedMotion } = useAppMotion();

  useLayoutEffect(() => {
    const fromHomeCard = consumeJoinTournamentTransition();
    if (reducedMotion) {
      controls.set({ opacity: 1, y: 0 });
      return;
    }
    if (!fromHomeCard || typeof pageEntrance.initial !== "object") return;
    controls.set(pageEntrance.initial);
    // Start before paint, without delaying or replacing Next's navigation.
    void controls.start({ opacity: 1, y: 0, transition: pageEntrance.transition });
  }, [controls, pageEntrance, reducedMotion]);

  return <motion.main className={className} initial={false} animate={controls}>{children}</motion.main>;
}
