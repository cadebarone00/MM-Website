import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * The page inside a full-screen pop-up (Trip Settings, the draft rooms). A full-screen Modal on iPhone is its own window,
 * so a SafeAreaView inside it can't see the notch / clock and the header slides under them. The insets are read here,
 * from the app's own screen, and applied as padding, so the title and back button always sit below the clock.
 */
export function FullScreenPage({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[{ flex: 1, paddingTop: Math.max(insets.top, 20), paddingBottom: insets.bottom }, style]}>{children}</View>;
}
