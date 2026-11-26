import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

type ScrollHandler = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;

/**
 * The trip page's tuck-away header (owner 2026-11-26): scroll down on any trip tab and the top row (menu · feed · chat ·
 * name · gear) tucks up, leaving the slightly smaller Home · Golf · Venue · Itinerary tabs right under the Dynamic Island;
 * scroll back up (or reach the top) and it comes back down. Each tab's main ScrollView passes `useTripScroll()` as onScroll.
 */
export const TripScrollContext = createContext<ScrollHandler | undefined>(undefined);

/** The onScroll handler for a trip tab's main list (undefined outside a trip page, e.g. an imported past trip). */
export const useTripScroll = () => useContext(TripScrollContext);

const MOVE = 6; // points of scrolling in one direction before the header reacts (ignores tiny jitters)
const TOP = 24; // within this much of the top the header is always out

/** 0 = header out, 1 = tucked away. */
export function useTripCollapse() {
  const [progress] = useState(() => new Animated.Value(0));
  const tucked = useRef(false);
  const lastY = useRef(0);

  const go = useCallback((tuck: boolean) => {
    if (tucked.current === tuck) return;
    tucked.current = tuck;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) { progress.setValue(tuck ? 1 : 0); return; }
      Animated.timing(progress, { toValue: tuck ? 1 : 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    });
  }, [progress]);

  const onScroll = useCallback<ScrollHandler>((event) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const y = contentOffset.y;
    // Ignore the bounce past the bottom so the header doesn't pop out at the end of a list.
    const bottom = Math.max(0, contentSize.height - layoutMeasurement.height);
    if (y > bottom) { lastY.current = bottom; return; }
    const dy = y - lastY.current;
    if (y <= TOP) go(false);
    else if (dy > MOVE) go(true);
    else if (dy < -MOVE) go(false);
    else return; // keep comparing against the last point where we decided
    lastY.current = y;
  }, [go]);

  /** Bring the header back (switching tabs). */
  const expand = useCallback(() => { lastY.current = 0; go(false); }, [go]);

  return { progress, onScroll, expand };
}
