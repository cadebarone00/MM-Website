import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RibbonPost } from "@/lib/content/ribbon";
import { assetUrl } from "~/lib/api.ts";
import { cardAction } from "~/lib/range.ts";
import { colors, fonts, radius } from "~/lib/theme.ts";

/** One post in the Featured trip card style (website RibbonPostCard): cover photo, "Balata · Tab", headline, summary. */
export function PostCard({ post, onOpen }: { post: RibbonPost; onOpen: () => void }) {
  const quick = post.format === "quick";
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${post.title}. Open`} onPress={onOpen} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {post.coverImage ? <Image source={{ uri: assetUrl(post.coverImage) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        : post.coverVideo ? <View style={[StyleSheet.absoluteFill, styles.videoTile]}><SymbolView name="play.circle.fill" size={44} tintColor={colors.cream} /></View> : null}
      <LinearGradient colors={["transparent", "rgba(29,11,17,0.85)"]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0.3 }} end={{ x: 0, y: 1 }} />
      <View style={styles.text}>
        <Text style={styles.kicker}>BALATA · {post.tab.toUpperCase()}</Text>
        <Text style={quick ? styles.quick : styles.title} numberOfLines={3}>{post.title}</Text>
        {!quick && post.summary ? <Text style={styles.summary} numberOfLines={2}>{post.summary}</Text> : null}
      </View>
      <View style={styles.open}>
        <Text style={styles.openText}>{cardAction(post)}</Text>
        <SymbolView name="arrow.right" size={12} tintColor={colors.maroon950} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { height: 230, borderRadius: radius.card, overflow: "hidden", backgroundColor: colors.maroon900, justifyContent: "flex-end" },
  pressed: { opacity: 0.9 },
  videoTile: { alignItems: "center", justifyContent: "center", backgroundColor: colors.maroon700 },
  text: { padding: 16, paddingBottom: 54, gap: 4 },
  kicker: { fontFamily: fonts.capsSemibold, fontSize: 10, letterSpacing: 1.4, color: colors.avatarGold },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 26, color: colors.cream },
  quick: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, color: colors.cream },
  summary: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: colors.boardInk },
  open: { position: "absolute", left: 16, bottom: 14, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.homeCream },
  openText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.maroon950 },
});
