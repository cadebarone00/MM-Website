import { NativeTabs } from "expo-router/native-tabs";
import { badgeText, useTabBadges } from "~/lib/tabBadges.tsx";
import { colors } from "~/lib/theme.ts";

/**
 * Apple's real iOS tab bar (owner picked B, 2026-11-24): Play · Golf Trips · Profile · Tourneys · Leagues, maroon when
 * selected. Play shows a red badge while round invites are waiting.
 */
export default function TabsLayout() {
  const { play } = useTabBadges();
  const playBadge = badgeText(play);
  return (
    <NativeTabs tintColor={colors.maroon700}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: "flag", selected: "flag.fill" }} md="flag" />
        <NativeTabs.Trigger.Label>Play</NativeTabs.Trigger.Label>
        {playBadge && <NativeTabs.Trigger.Badge>{playBadge}</NativeTabs.Trigger.Badge>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="golf-trips">
        <NativeTabs.Trigger.Icon sf="airplane" md="flight" />
        <NativeTabs.Trigger.Label>Golf Trips</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tourneys">
        <NativeTabs.Trigger.Icon sf={{ default: "trophy", selected: "trophy.fill" }} md="emoji_events" />
        <NativeTabs.Trigger.Label>Tourneys</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="leagues">
        <NativeTabs.Trigger.Icon sf={{ default: "person.3", selected: "person.3.fill" }} md="groups" />
        <NativeTabs.Trigger.Label>Leagues</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
