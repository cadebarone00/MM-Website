# Expo Step 0: Building Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox steps.

**Goal:** The shared native pieces every app screen uses, Apple's native tab bar (owner picked B), and the app importing the website's `lib/` code directly.
**Architecture:** `@/…` in `mobile/` = repo root (same as the website); the app's own code = `~/…` (`mobile/src`). Metro watches `../lib`. Components in `mobile/src/components/`, one file each, colors only from `theme.ts`. A dev-only **Building blocks** gallery (`/dev/blocks`, opened from Profile in dev) shows every piece in every state.
**Tech:** Expo SDK 58, `expo-router/native-tabs`, `formSheet`, expo-haptics, expo-clipboard, @react-native-community/datetimepicker, tsx (tests with path aliases).
**Spec:** `project_specs.md` → "Expo app Step 0 (building blocks) + Step 1 (Play)"; `docs/architecture/app-first.md`.

## Global Constraints
- 16px gutter, Spectral (Barlow not needed yet), colors from `mobile/src/lib/theme.ts` only.
- Fixed-size state slots (loading/empty/error same height).
- Shared logic comes from `lib/`; the one website change is moving `initialsFor` into `lib/profile/initials.ts` (re-exported from `myProfile.ts`, so website imports don't change).

## Review Focus
1. Shared `lib/` import must bundle in Metro (not just type-check) → `npx expo export --platform ios` in Task 1.
2. Avatar initials for empty / one-word / emoji names → `initialsFor` tests (existing behavior: "?" for empty).
3. Code card on a phone with no share target / clipboard failure → no crash, plain "Couldn't copy" note.
4. Tab badge with 0 invites → no badge shown.
5. Sheet close on a phone with large text → X stays tappable (44pt hit area).

### Task 1: Shared code + aliases
Files: `mobile/tsconfig.json`, `mobile/metro.config.js`, rename imports `@/` → `~/` in `mobile/src`, `lib/profile/initials.ts`, `lib/profile/myProfile.ts` (re-export), `mobile/src/lib/shared.test.ts`.
- [ ] Test: `initialsFor("Cade Barone") === "CB"`, `formatCode` + `joinPath("round", …)` from `@/lib/platform/codeInvites`, `roundStats([])` from `@/lib/profile/roundStats` runs.
- [ ] `npm test` (tsx) passes; `npx tsc --noEmit`; `npx expo export --platform ios` bundles; root `npm test` for lib/profile still passes.

### Task 2: Native tab bar
Files: `mobile/src/app/(tabs)/_layout.tsx` → `NativeTabs`, gold tint, SF Symbols, `badge?: number` on Play (hidden at 0).

### Task 3: Building blocks + gallery
Files: `Button.tsx`, `Card.tsx`, `Avatar.tsx`, `SheetClose.tsx` + `sheetOptions` (formSheet 0.85), `SearchField.tsx` + `SearchResults.tsx`, `PageHeader.tsx`, `PillToggle.tsx`, `SelectField.tsx`, `DateField.tsx`, `CodeCard.tsx`, `StateSlot.tsx`; `mobile/src/app/dev/blocks.tsx`, `mobile/src/app/dev/sheet.tsx`; Profile gets a dev-only "Building blocks" button.
- [ ] `npx tsc --noEmit`, `npm test`, iOS bundle, dev server starts clean; owner checks the gallery on the phone.
