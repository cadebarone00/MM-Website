import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase.ts";
import { NETWORK_ERROR } from "@/lib/apiReply.ts";
import { colors, fonts, gutter } from "@/lib/theme.ts";

/** Email + password, the same Supabase login as the website (Step 1: existing accounts only). */
export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    if (busy) return;
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setBusy(true);
    setError(null);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) setError(authError.message === "Invalid login credentials" ? "That email and password don't match." : authError.message);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.body}>
        <Text style={styles.wordmark}>The Maroon</Text>
        <Text style={styles.subtitle}>Sign in</Text>
        <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.tabInactive} value={email}
          onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
        <TextInput style={styles.input} placeholder="Password" placeholderTextColor={colors.tabInactive} value={password}
          onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={signIn} />
        {/* Fixed-height slot so the button doesn't jump when a message appears. */}
        <View style={styles.errorSlot}>{error && <Text style={styles.error}>{error}</Text>}</View>
        <Pressable style={({ pressed }) => [styles.button, pressed && styles.pressed]} onPress={signIn} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.maroon900} /> : <Text style={styles.buttonText}>Sign in</Text>}
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  body: { flex: 1, justifyContent: "center", paddingHorizontal: gutter, gap: 12 },
  wordmark: { fontFamily: fonts.bold, fontSize: 40, color: colors.onMaroon, textAlign: "center" },
  subtitle: { fontFamily: fonts.regular, fontSize: 18, color: colors.goldBright, textAlign: "center", marginBottom: 16 },
  input: { fontFamily: fonts.regular, fontSize: 17, color: colors.onMaroon, borderWidth: 1, borderColor: colors.gold,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, backgroundColor: colors.inputOnMaroon },
  errorSlot: { minHeight: 44 },
  error: { fontFamily: fonts.regular, fontSize: 15, color: colors.errorOnMaroon },
  button: { backgroundColor: colors.goldBright, borderRadius: 12, alignItems: "center", justifyContent: "center", height: 52 },
  pressed: { opacity: 0.85 },
  buttonText: { fontFamily: fonts.semibold, fontSize: 17, color: colors.maroon900 },
});
