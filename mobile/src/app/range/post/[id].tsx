import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RibbonBlock } from "@/lib/content/ribbon";
import { PageHeader } from "~/components/PageHeader.tsx";
import { PostCard } from "~/components/range/PostCard.tsx";
import { assetUrl } from "~/lib/api.ts";
import { usePlayData } from "~/lib/playData.tsx";
import { videoLink } from "~/lib/range.ts";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

/** One On The Range post (website RibbonArticle): cover, headline, summary, the body blocks, then more from that tab. */
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { post: find, posts } = usePlayData();
  const post = find(id);

  if (!post) {
    return (
      <SafeAreaView style={styles.page} edges={["top"]}>
        <View style={styles.gutter}><PageHeader title="Post" back /></View>
        <Text style={styles.missing}>This post isn&apos;t available anymore.</Text>
      </SafeAreaView>
    );
  }
  const more = posts(post.tab).filter((other) => other.id !== post.id).slice(0, 3);
  const cover = post.coverImage ? assetUrl(post.coverImage) : null;
  const coverVideo = !cover && post.coverVideo ? videoLink(assetUrl(post.coverVideo)) : null;

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.gutter}><PageHeader title={post.tab} back /></View>
      <ScrollView contentContainerStyle={styles.content}>
        {cover && <View style={styles.cover}><Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /></View>}
        {coverVideo && <OpenLink label="Watch the video" url={coverVideo} icon="play.circle.fill" />}
        <Text style={styles.kicker}>THE MAROON · {post.tab.toUpperCase()}</Text>
        <Text style={post.format === "quick" ? styles.quick : styles.title}>{post.title}</Text>
        {post.summary ? <Text style={styles.summary}>{post.summary}</Text> : null}
        {post.blocks.map((block, i) => <Block key={i} block={block} />)}
        {more.length > 0 && (
          <View style={styles.more}>
            <Text style={styles.moreTitle}>More from {post.tab}</Text>
            {more.map((other) => <PostCard key={other.id} post={other} onOpen={() => router.replace({ pathname: "/range/post/[id]", params: { id: other.id } })} />)}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Block({ block }: { block: RibbonBlock }) {
  switch (block.type) {
    case "text": return <Text style={styles.body}>{block.text}</Text>;
    case "heading": return <Text style={styles.heading}>{block.text}</Text>;
    case "quote": return <View style={styles.quote}><Text style={styles.quoteText}>{block.text}</Text></View>;
    case "photo": return (
      <View style={styles.figure}>
        <View style={styles.photo}><Image source={{ uri: assetUrl(block.src) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /></View>
        {block.caption ? <Text style={styles.caption}>{block.caption}</Text> : null}
      </View>
    );
    case "video": {
      const url = videoLink(block.url.startsWith("/") ? assetUrl(block.url) : block.url);
      return url ? <View style={styles.figure}><OpenLink label="Watch the video" url={url} icon="play.circle.fill" />{block.caption ? <Text style={styles.caption}>{block.caption}</Text> : null}</View> : null;
    }
    case "link": return <OpenLink label={block.label} url={block.url} icon="arrow.up.right.square" />;
  }
}

/** Opens a link in Safari / YouTube. A link the phone can't open does nothing (never crashes). */
function OpenLink({ label, url, icon }: { label: string; url: string; icon: "play.circle.fill" | "arrow.up.right.square" }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={() => { Linking.openURL(url).catch(() => {}); }} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
      <SymbolView name={icon} size={20} tintColor={colors.maroon700} />
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.cream },
  gutter: { paddingHorizontal: gutter },
  content: { paddingHorizontal: gutter, paddingBottom: 56, gap: 12 },
  missing: { padding: gutter, fontFamily: fonts.regular, fontSize: 16, color: colors.inkMuted },
  cover: { height: 220, borderRadius: radius.card, overflow: "hidden", backgroundColor: colors.maroon900 },
  kicker: { marginTop: 4, fontFamily: fonts.capsSemibold, fontSize: 10, letterSpacing: 1.4, color: colors.inkMuted },
  title: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 33, color: colors.ink },
  quick: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 29, color: colors.ink },
  summary: { fontFamily: fonts.regular, fontSize: 18, lineHeight: 26, color: colors.inkMuted },
  body: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 26, color: colors.ink },
  heading: { marginTop: 8, fontFamily: fonts.bold, fontSize: 21, color: colors.ink },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.gold, paddingLeft: 14 },
  quoteText: { fontFamily: fonts.semibold, fontSize: 19, lineHeight: 27, color: colors.maroon700 },
  figure: { gap: 6 },
  photo: { height: 220, borderRadius: radius.control, overflow: "hidden", backgroundColor: colors.line },
  caption: { fontFamily: fonts.regular, fontSize: 14, color: colors.inkMuted },
  link: { minHeight: minTap + 4, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderRadius: radius.control, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  pressed: { opacity: 0.8 },
  linkText: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.maroon700 },
  more: { marginTop: 18, gap: 12 },
  moreTitle: { fontFamily: fonts.bold, fontSize: 20, color: colors.ink },
});
