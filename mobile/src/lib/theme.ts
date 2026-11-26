/** Balata's colors and fonts (same values as the website's globals.css). Use these, never hard-coded colors. */
export const colors = {
  darkBackground: "#1d0b11",
  maroon900: "#240001",
  maroon700: "#500001",
  cream: "#fbf8f1",
  card: "#ffffff",
  ink: "#240001",
  inkMuted: "#6b5552",
  gold: "#c9a86e",
  goldBright: "#e3c27f",
  onMaroon: "#f6eee8",
  tabInactive: "#8d7874",
  error: "#a3261c",
  errorOnMaroon: "#f2a9a0",
  line: "#e6ddd0",
  inputOnMaroon: "rgba(255,255,255,0.05)",
  maroon500: "#872a2e",
  // Avatar (website ProfileAvatar.module.css): thin gold ring, faint gold fill, gold initials.
  avatarGold: "#dcc495",
  avatarRing: "rgba(220,196,149,0.5)",
  avatarFill: "rgba(220,196,149,0.12)",
  // Sheet close X (website SheetClose.module.css): see-through maroon rounded square.
  closeFill: "rgba(135,42,46,0.45)",
  closeRing: "rgba(220,196,149,0.22)",
  pillOff: "#cfc6bb",
  // Standard search (website components/search/Search.module.css): solid maroon page.
  searchInk: "#f4efe6",
  searchMuted: "rgba(244,239,230,0.6)",
  searchFaint: "rgba(244,239,230,0.5)",
  searchField: "rgba(244,239,230,0.1)",
  searchLine: "rgba(244,239,230,0.15)",
  problem: "#9b1c1c",
  white: "#ffffff",
  money: { up: "#2e7d4f", down: "#a3261c" },
  // Play home (website components/platform/MobileHome.module.css).
  maroon950: "#1d0b11",
  homeCream: "#f4efe6",
  boardBorder: "#b99c6b",
  boardBorderSoft: "rgba(185,156,107,0.53)",
  boardGold: "#d7b77e",
  boardInk: "#e5d4c7",
  boardLink: "#f2d497",
  boardTop: "#42131c",
  boardBottom: "#23070d",
  paper: "#fff9ef",
  paperBorder: "rgba(213,183,127,0.5)",
  paperInk: "#35141a",
  paperInkSoft: "#462129",
  inviteFill: "#2b1219",
  // Golf trip page, TestFlight look (website GolfTripHome / TripBigBoard / TripMomentum / MomSection .module.css).
  tripGold: "#edcf91",
  tripLabel: "#d4bfa9",
  tripInk: "#fff5df",
  tripMuted: "#e3d3c7",
  tripBorder: "rgba(201,168,110,0.6)",
  tripGlow: "rgba(201,168,110,0.3)",
  tripLineFaint: "rgba(201,168,110,0.45)",
  tripFill: "rgba(255,255,255,0.05)",
  tripFillStrong: "rgba(251,248,241,0.08)",
  tripPillLine: "rgba(220,196,149,0.6)",
  tripPillFill: "rgba(220,196,149,0.1)",
  tripDotOff: "rgba(251,248,241,0.28)",
  tripLive: "#ff6b6b",
  tripTileTop: "#4a1525",
  tripTileMid: "#3a0f1c",
  tripTileLow: "#2b0a14",
  tripPlay: "#2e7d32",
  tripPlayInk: "#7fd39a",
  tripSit: "#ff9a9a",
  tripRose: "rgba(190,90,100,0.55)",
  rangePage: "#e6e2db",
  rangeFilterOn: "#fffdf8",
  // Setup pages, trip-builder look (website CreateTournament.module.css .wizard, PlayRound.module.css .wiz*).
  wizardFill: "rgba(251,248,241,0.08)",
  wizardLine: "rgba(201,168,110,0.35)",
  wizardMuted: "#e1cec4",
  wizardTrack: "rgba(251,248,241,0.12)",
  wizardDisabledFill: "rgba(251,248,241,0.1)",
  wizardDisabledInk: "rgba(251,248,241,0.35)",
  // Scoring sheet (website GolfTripScoring.module.css): light cream sheet, maroon ink.
  sheetTop: "#f8f3ea",
  sheetBottom: "#f2ebdf",
  sheetInk: "#240001",
  sheetMuted: "rgba(47,12,14,0.7)",
  sheetLine: "rgba(47,12,14,0.3)",
  sheetLineSoft: "rgba(47,12,14,0.22)",
  sheetGlass: "rgba(255,255,255,0.28)",
  sheetGrabber: "rgba(122,79,41,0.5)",
  sheetBackdrop: "rgba(20,4,6,0.55)",
} as const;

/** Rounded corners used everywhere. */
export const radius = { card: 16, control: 12, close: 10, pill: 999 } as const;

/** Smallest tap target (Apple's 44pt rule). */
export const minTap = 44;

export const fonts = {
  regular: "Spectral_400Regular",
  semibold: "Spectral_600SemiBold",
  bold: "Spectral_700Bold",
  /** Loaded where it's used (useFonts with Spectral_500Medium_Italic): "not set" lines on the trip page. */
  italic: "Spectral_500Medium_Italic",
  /** Barlow: ONLY for tiny ALL-CAPS labels (owner font rule). */
  capsSemibold: "Barlow_600SemiBold",
  capsBold: "Barlow_700Bold",
} as const;

/** Everything sits 16px from the phone's edges (same rule as the website's --page-gutter). */
export const gutter = 16;
