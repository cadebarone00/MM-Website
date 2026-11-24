import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, gutter } from "~/lib/theme.ts";

export type SlotState = { kind: "loading" } | { kind: "empty"; message: string } | { kind: "error"; message: string; onRetry?: () => void } | { kind: "ready" };

/**
 * One fixed-size box for loading / empty / error / ready (website rule: fixed layout, no shifting). Give it the height the
 * loaded content takes, so nothing below it moves when the data arrives.
 */
export function StateSlot({ state, height, children, tone = "light" }: { state: SlotState; height: number; children?: ReactNode; tone?: "light" | "dark" }) {
  const ink = tone === "dark" ? colors.onMaroon : colors.inkMuted;
  return (
    <View style={{ height }}>
      {state.kind === "ready" ? children : (
        <View style={styles.center}>
          {state.kind === "loading" && <ActivityIndicator color={tone === "dark" ? colors.goldBright : colors.maroon700} accessibilityLabel="Loading" />}
          {state.kind === "empty" && <Text style={[styles.text, { color: ink }]}>{state.message}</Text>}
          {state.kind === "error" && (
            <>
              <Text style={[styles.text, { color: tone === "dark" ? colors.errorOnMaroon : colors.error }]}>{state.message}</Text>
              {state.onRetry && (
                <Pressable accessibilityRole="button" onPress={state.onRetry} style={styles.retry}>
                  <Text style={[styles.retryText, { color: tone === "dark" ? colors.goldBright : colors.maroon700 }]}>Try again</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: gutter, gap: 6 },
  text: { fontFamily: fonts.regular, fontSize: 16, textAlign: "center" },
  retry: { paddingVertical: 10, paddingHorizontal: 16 },
  retryText: { fontFamily: fonts.semibold, fontSize: 16 },
});
