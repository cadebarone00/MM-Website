# Expo Step 1: Bare App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A bare Expo app in `mobile/` that signs in with Supabase, shows the five tabs, and proves a real `/api/app/profile` call on the owner's iPhone through Expo Go.

**Architecture:** Standalone Expo project (own `package.json`, `node_modules`) under `mobile/`, Expo Router file-based screens. Supabase JS client with a chunked SecureStore adapter holds the session; API calls send `Authorization: Bearer <access_token>` to `https://themaroon.site`.

**Tech Stack:** Expo SDK 58, Expo Router, TypeScript, expo-secure-store, @supabase/supabase-js, react-native-url-polyfill, @expo-google-fonts/spectral.

**Spec:** `project_specs.md` → "The Maroon native app with Expo (React Native) — Step 1".

## Global Constraints
- Nothing outside `mobile/` changes except: root `tsconfig.json` exclude + `eslint.config.mjs` ignore of `mobile/`, the spec, this plan.
- `mobile/.env` holds `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL=https://themaroon.site`; never committed (root `.gitignore` already ignores `.env*`).
- Tabs, in order: Play · Golf Trips · Profile · Tourneys · Leagues. Maroon + cream, Spectral.
- Login session only in the iPhone Keychain (SecureStore).

## Review Focus
1. Session JSON larger than SecureStore's ~2 KB per value → chunked adapter (unit-tested).
2. Expired access token on reopen → supabase `autoRefreshToken` + `getSession()` before each API call.
3. No internet / server 503 on Profile → plain error message + Retry, no crash.
4. Wrong password → Supabase error shown as plain text.
5. `/api/app/profile` returns `{ ok:false }` or non-JSON → treated as error (validated).

---

### Task 1: Scaffold + chunked secure storage
**Files:** Create `mobile/` via `create-expo-app` (blank-typescript), `mobile/lib/chunkedStorage.ts`, `mobile/lib/chunkedStorage.test.ts`; modify root `tsconfig.json`, `eslint.config.mjs`.
**Produces:** `createChunkedStorage(store: { getItemAsync, setItemAsync, deleteItemAsync }, chunkSize?: number)` → `{ getItem(key), setItem(key, value), removeItem(key) }` (async).
- [ ] Test: round-trips a 5,000-char value with chunkSize 2000 (3 chunks); overwriting with a shorter value removes stale chunks; removeItem clears all; missing key → null.
- [ ] Run `node --test mobile/lib/chunkedStorage.test.ts` → FAIL, implement, → PASS.

### Task 2: Supabase client, auth screens, tabs, Profile
**Files:** `mobile/lib/supabase.ts`, `mobile/lib/api.ts` (+ `api.test.ts` for response validation), `mobile/lib/theme.ts`, `mobile/app/_layout.tsx`, `mobile/app/sign-in.tsx`, `mobile/app/(tabs)/_layout.tsx`, `(tabs)/index.tsx` (Play), `golf-trips.tsx`, `profile.tsx`, `tourneys.tsx`, `leagues.tsx`.
**Produces:** `apiGet<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; error: string }>`; `parseApiReply(status, text)` pure + tested.
- [ ] Test `parseApiReply`: 200 `{ok:true,data}` → ok; 503 `{ok:false,error}` → that error; non-JSON → "Couldn't reach The Maroon. Try again."
- [ ] Root layout redirects to sign-in when no session, to tabs when signed in.
- [ ] `npx tsc --noEmit` in `mobile/` passes; `npx expo export --platform ios` bundles without errors.

### Task 3: Verify + hand off
- [ ] Root `npx tsc --noEmit -p tsconfig.json` unaffected by `mobile/`; root `npm run lint` doesn't scan `mobile/`.
- [ ] `npx expo start --tunnel` shows a QR; owner scans and checks the Done list.
