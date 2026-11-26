import { useState } from "react";
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { SymbolView } from "expo-symbols";
import { SheetClose } from "~/components/SheetClose.tsx";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

type Photo = { uri: string; name: string };
type Post = { id: number; text: string; photos: Photo[] };
const MAX_PHOTOS = 6;
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const TOO_MANY = "Choose up to 6 JPG, PNG or WebP pictures, 10 MB each.";

/**
 * The trip header's Feed (website TripFeedTab + TripFeed): Upload pictures / Make a post. Memory only, like the website:
 * nothing is uploaded or saved, and posts are gone when the trip page closes (project_specs.md Golf Trips part 2c).
 */
export function TripFeed({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState("");

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS });
    if (result.canceled || !result.assets.length) return;
    setComposing(true);
    const bad = result.assets.length + photos.length > MAX_PHOTOS
      || result.assets.some((a) => (a.mimeType && !TYPES.includes(a.mimeType)) || (a.fileSize ?? 0) > MAX_BYTES);
    if (bad) { setError(TOO_MANY); return; }
    setError("");
    setPhotos((list) => [...list, ...result.assets.map((a) => ({ uri: a.uri, name: a.fileName ?? "Trip picture" }))]);
  };
  const discard = () => { setPhotos([]); setText(""); setError(""); setComposing(false); };
  const post = () => {
    if (!text.trim() && !photos.length) return;
    setPosts((list) => [{ id: Date.now(), text: text.trim(), photos }, ...list]);
    setPhotos([]); setText(""); setComposing(false);
  };

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.page}>
        <View style={styles.header}><Text style={styles.title} accessibilityRole="header">Feed</Text><SheetClose onPress={onClose} /></View>
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.actions}>
            <Action icon="camera" label="Upload pictures" onPress={() => void pick()} />
            <Action icon="square.and.pencil" label="Make a post" onPress={() => setComposing(true)} />
          </View>
          <View accessibilityLiveRegion="polite" style={{ gap: 12 }}>
            {posts.map((p) => (
              <View key={p.id} style={styles.post}>
                <Text style={styles.author}>You</Text>
                {!!p.text && <Text style={styles.postText}>{p.text}</Text>}
                {p.photos.length > 0 && <View style={styles.photos}>{p.photos.map((ph) => <Image key={ph.uri} source={{ uri: ph.uri }} style={styles.photo} accessibilityLabel={ph.name} />)}</View>}
                <Pressable accessibilityRole="button" onPress={() => setPosts((list) => list.filter((x) => x.id !== p.id))} style={styles.delete}><Text style={styles.deleteText}>Delete post</Text></Pressable>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
      <Modal visible={composing} transparent animationType="fade" onRequestClose={discard}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
          <View style={styles.dialog}>
            <View style={styles.header}><Text style={styles.dialogTitle} accessibilityRole="header">Make a post</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close post" onPress={discard} hitSlop={10}><SymbolView name="xmark" size={18} tintColor={colors.ink} /></Pressable></View>
            <Text style={styles.label}>What is happening on the course?</Text>
            <TextInput style={styles.input} multiline maxLength={2000} value={text} onChangeText={setText} accessibilityLabel="What is happening on the course?" />
            {photos.length > 0 && <View style={styles.photos}>{photos.map((ph) => <Image key={ph.uri} source={{ uri: ph.uri }} style={styles.photo} accessibilityLabel={ph.name} />)}</View>}
            {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
            <View style={styles.footer}>
              <Pressable accessibilityRole="button" onPress={() => void pick()} style={styles.secondary}><Text style={styles.secondaryText}>Add pictures</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={!text.trim() && !photos.length} onPress={post} style={[styles.primary, !text.trim() && !photos.length && { opacity: 0.45 }]}><Text style={styles.primaryText}>Post</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Modal>
  );
}

function Action({ icon, label, onPress }: { icon: "camera" | "square.and.pencil"; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.action}>
      <SymbolView name={icon} size={16} tintColor={colors.maroon900} /><Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: gutter, minHeight: 52 },
  title: { fontFamily: fonts.bold, fontSize: 24, color: colors.cream },
  body: { padding: gutter, gap: 16 },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1, minHeight: minTap, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", borderRadius: radius.control, backgroundColor: colors.cream },
  actionText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.maroon900 },
  post: { padding: 14, borderRadius: radius.card, backgroundColor: colors.boardTop, borderWidth: 1, borderColor: colors.avatarRing, gap: 6 },
  author: { fontFamily: fonts.bold, fontSize: 15, color: colors.cream },
  postText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.boardInk },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  photo: { width: 96, height: 96, borderRadius: 8 },
  delete: { alignSelf: "flex-start", minHeight: minTap, justifyContent: "center" },
  deleteText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.errorOnMaroon },
  backdrop: { flex: 1, backgroundColor: colors.sheetBackdrop, justifyContent: "center", padding: gutter },
  dialog: { borderRadius: radius.card, backgroundColor: colors.cream, paddingBottom: gutter, gap: 10 },
  dialogTitle: { fontFamily: fonts.bold, fontSize: 20, color: colors.ink },
  label: { paddingHorizontal: gutter, fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  input: { marginHorizontal: gutter, minHeight: 96, padding: 10, borderRadius: radius.control, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, textAlignVertical: "top" },
  error: { paddingHorizontal: gutter, fontFamily: fonts.regular, fontSize: 14, color: colors.error },
  footer: { flexDirection: "row", gap: 10, paddingHorizontal: gutter },
  secondary: { flex: 1, minHeight: minTap, borderRadius: radius.control, borderWidth: 1, borderColor: colors.maroon700, alignItems: "center", justifyContent: "center" },
  secondaryText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.maroon700 },
  primary: { flex: 1, minHeight: minTap, borderRadius: radius.control, backgroundColor: colors.maroon700, alignItems: "center", justifyContent: "center" },
  primaryText: { fontFamily: fonts.bold, fontSize: 15, color: colors.cream },
});
