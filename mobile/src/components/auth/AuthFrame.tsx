import { useState, type ReactNode } from "react";
import { BalataLogo } from "~/components/BalataLogo.tsx";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

/** Progress line on the sign-up screens, in the order they really come (website onboardingRoutes PROGRESS). */
const PROGRESS = ["sign-up", "verify", "password", "name", "birthday", "photo", "settings", "created"] as const;
export type ProgressStep = (typeof PROGRESS)[number];

/**
 * Every Sign up / Log in / onboarding screen (website /start/* and /onboarding/* designs): maroon page, the M, an
 * optional progress line, the title, then the screen's boxes and button. Content sits at the top so the keyboard never
 * covers it (owner rule 2026-11-20: question pages all-at-top).
 */
export function AuthFrame({ title, subtitle, progress, back, children }: {
  title: string; subtitle?: string; progress?: ProgressStep; back?: boolean; children: ReactNode;
}) {
  useLightStatusBar();
  return (
    <SafeAreaView style={styles.page} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            {back ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}>
                <SymbolView name="chevron.left" size={22} tintColor={colors.cream} />
              </Pressable>
            ) : <View style={styles.back} />}
            <BalataLogo light style={styles.logo} />
            <View style={styles.back} />
          </View>
          {progress && (
            <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={[styles.fillBar, { width: `${((PROGRESS.indexOf(progress) + 1) / PROGRESS.length) * 100}%` }]} />
            </View>
          )}
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <View style={styles.body}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** A labelled box (or just a placeholder). `password` adds the eye to show / hide it. */
export function AuthField({ label, password, ...input }: { label?: string; password?: boolean } & TextInputProps) {
  const [shown, setShown] = useState(false);
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.box}>
        <TextInput placeholderTextColor={colors.wizardMuted} autoCorrect={false} {...input} secureTextEntry={password && !shown}
          accessibilityLabel={label ?? input.placeholder} style={styles.input} />
        {password && (
          <Pressable accessibilityRole="button" accessibilityLabel={shown ? "Hide password" : "Show password"} onPress={() => setShown(!shown)} style={styles.eye}>
            <SymbolView name={shown ? "eye.slash" : "eye"} size={18} tintColor={colors.wizardMuted} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Always two lines tall, so the button under it never moves when a message appears. */
export function AuthMessage({ error, notice }: { error?: string | null; notice?: string | null }) {
  return (
    <View style={styles.message}>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : notice ? <Text style={styles.notice}>{notice}</Text> : null}
    </View>
  );
}

export function AuthLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.link}>
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

export const AuthSmall = ({ children }: { children: ReactNode }) => <Text style={styles.small}>{children}</Text>;

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  fill: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: gutter, paddingBottom: 32 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8 },
  back: { width: minTap, height: minTap, alignItems: "center", justifyContent: "center" },
  logo: { width: 150, height: 50 },
  track: { height: 4, marginTop: 14, borderRadius: 2, overflow: "hidden", backgroundColor: colors.wizardTrack },
  fillBar: { height: "100%", borderRadius: 2, backgroundColor: colors.goldBright },
  title: { marginTop: 28, fontFamily: fonts.bold, fontSize: 30, color: colors.cream },
  subtitle: { marginTop: 6, fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: colors.wizardMuted },
  body: { marginTop: 24, gap: 14 },
  field: { gap: 6 },
  label: { fontFamily: fonts.semibold, fontSize: 14, color: colors.wizardMuted },
  box: { minHeight: 52, flexDirection: "row", alignItems: "center", borderRadius: radius.control, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.inputOnMaroon },
  input: { flex: 1, minHeight: 50, paddingHorizontal: 14, fontFamily: fonts.regular, fontSize: 17, color: colors.cream },
  eye: { width: minTap, height: minTap, alignItems: "center", justifyContent: "center" },
  message: { minHeight: 42, justifyContent: "center" },
  error: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19, color: colors.errorOnMaroon },
  notice: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: colors.goldBright },
  link: { minHeight: minTap, alignItems: "center", justifyContent: "center" },
  linkText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.goldBright },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.wizardMuted, textAlign: "center" },
});
