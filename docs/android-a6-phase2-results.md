# A6 Phase 2 Android build record

2026-10-21. Local development only. No production accounts or services modified; no deployment, push, merge, store upload, public release or iOS implementation.

**Single-owner continuation: Android APK compilation, installation and launch verified.** Gradle completed successfully in 5m 6s (123 actionable tasks: 56 executed, 67 up-to-date). `adb install -r` returned `Success`; `am start -W` returned `Status: ok` and the installed package path was confirmed. Functional testing found a trip-screen Realtime transport crash; this is not a fully working golf/scoring beta.

The existing isolated mobile project is `C:/Users/Owner/Documents/GitHub/maroon-a6-poc`. Its packaged build imports the existing A1 worktree's `SavedGolfTripHome`, `ProfileView`, `SiteBottomNav`, location hook and scoring interfaces. Next.js remains the API/scoring backend; Supabase remains the identity provider. This is a native Capacitor shell with packaged web interfaces, not a Kotlin rewrite.

## Compatibility and tools verified

- C: available space before build: 512,906,633,216 bytes (about 478 GiB).
- Node 24.16.0; Capacitor Android/core/CLI 8.5.2.
- Microsoft OpenJDK 21.0.12.1+1 at `C:/Users/Owner/AppData/Local/Programs/Java/jdk-21.0.12.1+1`.
- Android SDK at `C:/Users/Owner/AppData/Local/Android/Sdk`: platform 36, build tools 35.0.0 and 36.0.0, platform-tools 37.0.1, emulator 37.2.12, API 36 Google APIs x86_64 image.
- Windows Hypervisor Platform acceleration verified usable. Existing AVD `maroon_a6` booted; adb reported emulator-5554 connected and `sys.boot_completed=1`.
- Gradle wrapper 8.14.3 downloaded into the isolated project's `.gradle-cache`. Android Gradle Plugin configured as 8.13.0. Existing Java/SDK installations were reused, not redundantly reinstalled. No system-wide PATH changes.

## Service isolation verified

The running test Docker stack is `maroon-auth-test`, separate from the ordinary development stack. The existing harness refuses any Supabase API other than `http://127.0.0.1:55321`, replaces all Supabase environment variables with test-stack values, and blocks fetch destinations other than localhost/127.0.0.1. No production environment file was inspected or copied.

Started the existing A1 Next.js test build on loopback port 3998 with the harness imported before Next.js, using `NEXT_BUILD_OUTPUT=out/next-a6`. Started `server.mts` on loopback port 4100 with its existing isolation harness and Next headers stubs. These preserve the original backend and bearer identity flow. The Android bundle uses emulator host alias `10.0.2.2` for these services and local test Supabase. Native network security disallows cleartext except that emulator host; that exception is unsuitable for a distributed beta.

## Native build and device test evidence

Build invoked from the isolated `android-app` directory:

```powershell
$env:JAVA_HOME='C:/Users/Owner/AppData/Local/Programs/Java/jdk-21.0.12.1+1'
$env:ANDROID_HOME='C:/Users/Owner/AppData/Local/Android/Sdk'
$env:GRADLE_USER_HOME='C:/Users/Owner/Documents/GitHub/maroon-a6-poc/.gradle-cache'
./android/gradlew.bat -p android assembleDebug --max-workers=2 --console=plain
```

Before the successful build, checked Java process command lines: no competing Gradle build client remained, only a leftover idle daemon. Stopped that idle daemon, regenerated the Android bundle and ran `cap sync android` successfully. Repaired `android/local.properties` to contain the SDK's absolute forward-slash path in UTF-8. The bundle includes 194 app modules, 16 public images and bundled fonts; Capacitor registered the secure-storage native plugin. No backend source, production configuration or identity architecture was changed.

| Artifact/device fact | Verified value |
| --- | --- |
| APK | `../maroon-a6-poc/android-app/android/app/build/outputs/apk/debug/app-debug.apk` |
| Size | 13,278,707 bytes |
| SHA-256 | `B246B4CF6C69568069CBB96314130C3930E36A44572313F0960DC61E76E18785` |
| Label / package | Maroon A6 / `site.themaroon.app.poc` |
| Version | versionName 1.0, versionCode 1 |
| SDK | Minimum 24; compile/target 36 |
| Emulator | `emulator-5554`, `sdk_gphone64_x86_64`, Android 16/API 36 |
| WebView | `com.google.android.webview` 133.0.6943.137 |
| Install and launch | Streamed install Success; cold launch Status ok; activity TotalTime 4990 ms (not a repeatable performance benchmark) |

The earlier attempt was interrupted after confirmed competing-session activity; that is superseded by the successful single-owner build above. The competing invocation's resource-merge failure was not treated as this build's result. One owner must continue to control native outputs and the emulator.

## Installed-app tests and errors

The existing `android-app/device-test.mjs` ran against the installed APK using Playwright Android and adb. It saves incremental evidence to `out/android-results.json`. A supplementary runner records independent checks in `out/android-supplementary-results.json`; screenshots are in `out/android-shots`. No production credentials or services were used. Fresh synthetic golfers/trip were created through the test harness; an initial local Auth user-creation request timed out, then a new-fixture retry succeeded. Test passwords/tokens are not included in this report.

| Installed-app check | Actual result |
| --- | --- |
| Sign-in UI and password authentication | Passed against local test Supabase |
| Golf Trips list and bearer API identity | Passed; account endpoint recognized the test account before sign-out |
| Native session storage | Passed scoped probe: session in native store, localStorage empty, no backend cookies; 8,882-byte preferences file contained neither readable access nor refresh token |
| Session restoration | Passed after process death and relaunch |
| Profile navigation | Header, identity and bottom navigation rendered; tournament/trip content cards displayed unavailable messages, so complete Profile data behavior is not verified |
| GPS diagnostic | Passed route navigation and shared-hook location delivery: synthetic emulator fix 35.19550, -79.46920, reported accuracy 5 m and source real; returned to Golf Trips via bottom navigation |
| Offline launch | Passed with airplane mode enabled: session restored and cached Golf Trips list rendered with saved-copy indicator |
| Golf Trip Home | Failed: mixed-content WebSocket caused blank rendering |
| Scoring / offline score entry / reconnect synchronization | Blocked by trip-screen crash; not reached and unverified |
| Sign-out local clearing | Passed: sign-in UI returned, zero session/screen keys remained in native secure storage |
| Immediate access-token invalidation | Failed: old bearer token still produced an authenticated session from `/api/account/me` (HTTP 200) |
| Immediate refresh-token invalidation | Failed: old refresh token still succeeded at local Auth token endpoint (HTTP 200) |

The original disk probe returned zero bytes because its `adb sh -c` arguments were incorrectly quoted; the supplementary probe reads the plugin's named file directly and supersedes that invalid failure. Neither the file probe nor a successful build establishes a complete security audit. Location permissions were pregranted through adb; the actual prompt/denial path was not tested. GPS used the prototype diagnostic screen with the real shared hook, not the full course map interface.

**Trip/scoring blocker:** opening the real saved Golf Trip starts a subscription to `ws://10.0.2.2:55321/realtime/v1/websocket` from `https://localhost`. Android WebView blocks mixed-content WebSockets. Supabase throws `WebSocket not available`, React renders blank, and the live-round assertion times out. The test stack also omits the Realtime container. Golf Trip Home rendering failed; online score entry, offline score entry, queued-score persistence and reconnect score synchronization were not reached and remain unverified. Do not claim an offline/sync pass from Phase 1 browser evidence or from successful APK compilation. Resolving this later requires an intentional local transport/test setup and secure staging WSS; this task does not enable insecure mixed content globally or deploy a backend.

Other observed issues: emulator System UI showed an ANR/wait dialog during startup; it was dismissed and the completed build daemon's memory released. Playwright's package-name WebView lookup stalled; selecting the actual app process's WebView socket with a finite timeout allowed automation. A resource request returned 404; its exact asset was not identified in the initial test capture. Gradle emitted flatDir metadata and SDK XML-version warnings but completed successfully. These are recorded separately from application test failures.

The prototype's local sign-out clearing must not be equated with server-side revocation. The immediate invalidation probes above failed; cause, expiry/grace behavior and integration with the A4 backend sign-out path require follow-up. This result does not claim production sign-out was exercised or broken. Full map/course overlays, location permission prompt/denial, real physical-device GPS, app upgrades/reboots, signup/recovery, multi-device conflicts and hosted Realtime remain outside verified evidence. No scoring database mutations were performed by the device test because it failed before reaching score entry. Emulator networking was restored after the tests; the installed app remains available, signed out.

## First installed beta requirements

A local emulator debug APK and a remotely installable beta are different milestones. For a physical local install, provide a USB-debugging Android device and an explicit test-service route (for example adb reverse with a localhost-specific build/configuration); the current emulator-only `10.0.2.2` bundle cannot reach this workstation from a physical phone. Never point it at production to bypass that limitation.

For invited remote testers, provision the separately approved staging environment, switch to staging-only HTTPS configuration, select a dedicated beta ID, remove debug/test hooks, validate isolation in the final artifact, complete real-device authentication/offline/sync tests and prepare a signed AAB/upload key. Play upload/distribution remains a separate action. Details, including iOS staging and eventual TestFlight prerequisites: [staging plan](mobile-beta-staging-plan.md). Open compliance actions remain [review_required](android-a6-phase2-review.md).

Before calling the installed build a working golf beta, resolve the trip/Realtime transport crash, verify Profile content loading and correct the prototype's server sign-out integration. Then execute the score-entry, offline queue and reconnect synchronization checks that were blocked here. Work stopped after the first verified Android installation and the scoped test/error report; no app feature expansion was attempted.

## Documentation checks

`npm.cmd run docs:workflow`, `npm.cmd run docs:workflow:check` and `npm.cmd run compliance:check` passed. Registry validation establishes structure only. PowerShell blocks the `npm.ps1` wrapper; using `npm.cmd` required no execution-policy change. A headless browser opened generated workflow HTML and passed change-panel, navigation and search checks; its screenshot was visually inspected. `git diff --check` passed.
