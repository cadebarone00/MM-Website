import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";
import { apiJson } from "./api.ts";
import { pushRoute } from "./pushRoutes.ts";

/**
 * Phone notifications (project_specs.md "Expo app Step 6"): ask the phone, get its Expo push address, give it to the
 * server (POST /api/app/push-devices), forget it on sign out; tapping a notification opens the matching screen.
 * Needs the app's Expo project id (app.json extra.eas.projectId, made by `eas init`) and a real phone; Expo Go on
 * Android can't receive them at all. While the app is open a notification still shows as a banner.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const TOKEN_KEY = "maroon-push-token-v1";
export type PushState = "on" | "off" | "denied" | "unsupported" | "not_set_up";
export type PushAnswer = { state: PushState; message?: string };

const projectId = (): string | null => {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const id = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === "string" && id ? id : null;
};
const unsupported = () => !Device.isDevice || (Platform.OS === "android" && Constants.executionEnvironment === ExecutionEnvironment.StoreClient);
const savedToken = async () => { try { return await AsyncStorage.getItem(TOKEN_KEY); } catch { return null; } };

/** Settings shows this: is this phone getting notifications? */
export async function pushState(): Promise<PushState> {
  if (unsupported()) return "unsupported";
  if (!projectId()) return "not_set_up";
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "denied") return "denied";
  return status === "granted" && (await savedToken()) ? "on" : "off";
}

/** Turn notifications on for this phone. `ask` = show the phone's "Allow notifications?" prompt if it hasn't been answered. */
export async function turnOnPush(ask = true): Promise<PushAnswer> {
  try {
    if (unsupported()) return { state: "unsupported", message: "Notifications need a real phone (and the full app on Android)." };
    const id = projectId();
    if (!id) return { state: "not_set_up", message: "Phone notifications aren't set up for this app build yet." };
    if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("default", { name: "The Maroon", importance: Notifications.AndroidImportance.HIGH });
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted" && ask) ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return { state: status === "denied" ? "denied" : "off", message: status === "denied" ? "Notifications are off for The Maroon in your phone's Settings." : undefined };
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
    const r = await apiJson("/api/app/push-devices", { method: "POST", body: { token, platform: Platform.OS === "ios" ? "ios" : "android" } });
    if (!r.ok) return { state: "off", message: r.error };
    try { await AsyncStorage.setItem(TOKEN_KEY, token); } catch { /* asks again next time */ }
    return { state: "on" };
  } catch {
    return { state: "off", message: "Couldn't turn notifications on. Try again." };
  }
}

/** Stop notifications to this phone (Turn off, and before signing out). Never throws. */
export async function turnOffPush(): Promise<void> {
  const token = await savedToken();
  if (!token) return;
  await apiJson("/api/app/push-devices", { method: "DELETE", body: { token } }).catch(() => undefined);
  try { await AsyncStorage.removeItem(TOKEN_KEY); } catch { /* nothing to undo */ }
}

/**
 * While someone is signed in and set up: keep this phone's address fresh (only when they already allowed
 * notifications: no prompt here), and open the right screen when a notification is tapped (also the one that opened
 * the app).
 */
export function usePush(active: boolean) {
  useEffect(() => {
    if (!active) return;
    void (async () => { if ((await pushState()) !== "unsupported" && (await savedToken())) await turnOnPush(false); })();
    const open = (response: Notifications.NotificationResponse | null) => {
      const link = response?.notification.request.content.data?.link;
      if (response) router.push(pushRoute(link));
    };
    void Notifications.getLastNotificationResponseAsync().then((last) => { if (last) { open(last); void Notifications.clearLastNotificationResponseAsync(); } }).catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [active]);
}
