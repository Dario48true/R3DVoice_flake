# RedVoice Plan 6 — Mobile Clients (iOS + Android) Implementation Plan

> **Status:** STUB — scope sketch only. Full task breakdown pending after Plan 5 ships.

**Goal:** Companion iOS + Android apps that share the same accounts and rooms as the desktop client. Feature parity goal for v1 mobile: join room, hear voice, watch remote screenshares, toggle own mic. **Mobile does NOT publish screen** (no API for that on iOS; only via extension; deferred).

**Timeline:** Realistic 2–3 months of full-time work. Should not be started until Plan 5 is fully shipped and voice has had a month of real-world use — premature mobile means rewriting it when the desktop API shifts.

---

## Decision tree before writing the full plan

### 1. React Native vs. Native (Swift + Kotlin)?

| Aspect | React Native | Native (2 codebases) |
|---|---|---|
| Shared logic with desktop | High (TS stores, API client reused) | None |
| Performance | Good, but WebRTC integration through JS bridge | Best |
| LiveKit SDK support | Official RN SDK exists (`@livekit/react-native`) | Official iOS + Android SDKs |
| Team size needed | 1 dev | 2 specialists (iOS + Android each) |
| **Recommended for RedVoice** | **Yes** — single dev, wants shared TS | |

### 2. Expo or bare RN?

| Aspect | Expo | Bare RN |
|---|---|---|
| Setup time | Minutes | Hours |
| Native modules | Limited (EAS workarounds) | Full access |
| LiveKit RN compatibility | Needs custom dev-client config | Works out of box |
| **Recommended** | Bare RN (LiveKit needs native Opus, not available in managed Expo) | |

### 3. Monorepo or separate repo?

| Aspect | Monorepo addition (`apps/mobile`) | Separate repo |
|---|---|---|
| Shared types via `@redvoice/shared` | Trivial | Needs npm-publish of shared |
| CI complexity | Slightly more | Cleaner separation |
| **Recommended** | Monorepo addition | |

---

## Rough scope (not full tasks — skeleton)

1. `apps/mobile/` React Native bare project, TypeScript, iOS + Android
2. Shared code: `@redvoice/shared` types, `@redvoice/api-client` (extract from `apps/client/src/renderer/src/lib/api.ts` into its own package so mobile reuses)
3. Auth flow: register/login/me — same endpoints, different UI
4. Lobby screen (mobile): list rooms, join by link/paste
5. Pre-Join (mobile): mic + speaker picker only (no screenshare toggle)
6. In-Room (mobile): tile grid (card layout), remote audio playback, remote screenshare video player, mute/leave buttons
7. Native permissions: mic + notifications (iOS `NSMicrophoneUsageDescription`, Android `RECORD_AUDIO`)
8. LiveKit RN SDK integration: `Room.connect`, track subscription, audio routing to speaker/earpiece
9. Deep-link handler on mobile: `redvoice://join/<id>` → Universal Links (iOS) + App Links (Android)
10. Push notifications when someone joins your owned room (stretch — needs FCM + APNs setup)
11. CI: GitHub Actions iOS build (requires macOS runners + signing) + Android build
12. **Code signing for iOS is mandatory** to install on real devices — Apple Developer account $99/year
13. Android APK can be sideloaded without signing; Play Store requires a signing key (free)
14. Publish: TestFlight for iOS (easier than App Store review), direct APK download for Android (or Play Store once stable)

## Non-goals for mobile v1

- Publishing screenshare from the phone (iOS doesn't make this easy; Android requires `MediaProjection` + foreground service + native module)
- Publishing webcam (possible — defer to v1.1)
- Text chat (inherit from Plan 5; should work cross-platform via LiveKit DataChannel)
- Rich push notifications (just audio ping + badge for v1)

## Acceptance criteria for "mobile v1 done"

- Install via TestFlight (iOS) and direct APK (Android)
- Log in with desktop credentials
- Join a room that's in progress
- Hear everyone's voice
- See remote screenshares in a tile, pinch-to-zoom to watch
- Mute self, leave cleanly
- Wakelock works so screen doesn't sleep during a call

---

## When to write the full plan

**Prerequisites:**
- Plan 5 shipped (installers + auto-update in production)
- Voice has been stable on desktop for ≥1 month of real usage
- A defined target iOS version (probably 17+) and Android minSdk (probably 26 / API level 26)
- User has decided: public TestFlight link and/or Play Store listing
- Apple Developer account set up if iOS is included in v1

When those are true, I'll decompose Plan 6 into the standard 15–20 subagent tasks.
