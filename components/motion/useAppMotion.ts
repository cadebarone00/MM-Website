"use client";

import { useReducedMotion, type MotionProps, type Transition } from "motion/react";

export const motionTiming = {
  press: 0.12,
  hover: 0.16,
  entrance: 0.2,
  feedback: 0.24,
} as const;

const ease: Transition["ease"] = [0.22, 1, 0.36, 1];

/** Spread a pattern onto a motion element; no wrappers, styles or global provider needed. */
export function useAppMotion() {
  // Treat an unresolved preference as reduced motion (including SSR).
  const reducedMotion = useReducedMotion() !== false;
  const transition = (duration: number): Transition => ({
    type: "tween", duration: reducedMotion ? 0 : duration, ease,
  });
  const entrance = (distance: number): MotionProps => ({
    initial: reducedMotion ? false : { opacity: 0, y: distance },
    animate: { opacity: 1, y: 0 },
    transition: transition(motionTiming.entrance),
  });

  return {
    reducedMotion,
    buttonPress: {
      whileTap: { scale: reducedMotion ? 1 : 0.98 },
      transition: transition(motionTiming.press),
    } satisfies MotionProps,
    cardInteraction: {
      whileHover: { y: reducedMotion ? 0 : -2 },
      whileTap: { scale: reducedMotion ? 1 : 0.995 },
      transition: transition(motionTiming.hover),
    } satisfies MotionProps,
    pageEntrance: entrance(4),
    panelEntrance: entrance(6),
    success: {
      initial: false,
      animate: { scale: reducedMotion ? 1 : [1, 1.025, 1] },
      transition: transition(motionTiming.feedback),
    } satisfies MotionProps,
    errorShake: {
      initial: false,
      animate: { x: reducedMotion ? 0 : [0, -3, 3, -2, 2, 0] },
      transition: transition(motionTiming.feedback),
    } satisfies MotionProps,
  };
}
