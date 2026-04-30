# Discord / Vencord Screenshare — Reverse Engineering Notes

**Date:** 2026-04-30
**Author:** Research notes during v0.8.1 → Plan 5 transition.
**Status:** Research, not design. Concrete adoption proposals at the bottom.

---

## TL;DR

Discord screensharing **is WebRTC** under the hood. The "magic" is a stack of small optimizations layered on top, plus a proprietary SFU. RedVoice already adopts ~70% of the techniques (we did the v0.5.12 sweep). The remaining gap is mostly about **codec choice (AV1)** and **a couple of UX patterns** Discord nailed that we haven't.

There is no secret sauce. There's just careful engineering.

---

## Background — What Discord actually built

### The protocol layer

Discord uses a custom **Voice Gateway** (WebSocket signaling, Discord-specific) and a custom **SFU written in Rust + Elixir**. The SFU is closed-source. RedVoice uses LiveKit instead. **This is not a problem for us** — LiveKit's SFU is excellent and has the same architecture (selective forwarding, simulcast layer selection, congestion control).

Public facts about Discord's SFU:
- Custom Rust forwarders (per their 2018 + 2022 engineering blog posts)
- Erlang/Elixir signaling layer — battle-tested for millions of concurrent voice users
- Per-receiver simulcast layer selection (same as LiveKit Dynacast)
- Custom keyframe-on-join logic — when a new viewer subscribes, server forces an I-frame so they don't stare at a gray screen for 2s

LiveKit gives us all of these patterns. **Performance parity at the SFU layer is realistic.**

### The client layer

Discord's client is Electron + custom React. They patch Chromium at:

1. **Codec selection.** Default is **VP9 with SVC** (Scalable Video Coding) — multiple temporal layers in one stream so the SFU can drop layers per receiver. They added **AV1** in early 2024 for hardware-accelerated encode (RTX 30+, Intel ARC, Apple Silicon).
2. **Bitrate ceiling.** Free users capped at ~2.5 Mbps. Nitro: 8 Mbps. Nitro Source/Optimised: 25 Mbps for studio-quality.
3. **Hardware encoder forcing.** Same Chromium flags we use (`ignore-gpu-blocklist`, MediaFoundation/VAAPI/VideoToolbox feature flags).
4. **degradationPreference = "maintain-framerate"** for motion content (gameplay).
5. **Frame rate selection.** 720p60 / 1080p60 / 4K60 selectable. Source-FPS mode lets the encoder follow the source's actual frame rate up to a cap.
6. **contentHint = "motion"** on the MediaStreamTrack so the encoder doesn't drop frames on still scenes.

### Vencord — what the mod actually does

Vencord is a **client-side patch loader** for Discord's React/Electron app. It does not change the network protocol or the server. It hot-patches the renderer JS to expose features Discord gates behind Nitro. Common patches:

- **Bypass bitrate cap.** Reaches into `RTCRtpSender.getParameters()`, mutates `encodings[].maxBitrate` to a higher value, calls `setParameters(p)`. Same technique we use in `livekit-room.ts:applyScreenShareSenderOverrides`.
- **Force higher framerate.** Sets `encodings[].maxFramerate` to 60 or even 144. Throttled by source content in practice (no 144fps source = no 144fps output).
- **Source resolution / no scaledown.** Removes the `scaleResolutionDownBy = 1.5` we pre-apply. (Note: we apply scaledown specifically because OpenH264 software encode chokes at native 1080p; with VP9 we may not need it.)
- **Stereo audio for screenshare.** Forces Opus to stereo + ~510 kbps for music. We already do this via `audioPreset: AudioPresets.musicHighQualityStereo` + `forceStereo: true` since Plan 1.

**Vencord adds zero new technology.** It removes paywalls. The underlying WebRTC stack is the same Chromium implementation everyone has.

---

## What RedVoice already matches (post-v0.5.12 + Plan 3)

| Technique | RedVoice status |
|---|---|
| VP9 codec for screenshare | ✅ default since v0.5.12 (`videoCodec: "vp9"`) |
| SVC via VP9 (per-receiver layer drop at SFU) | ✅ free with LiveKit + VP9 |
| Hardware encoder forcing via Chromium flags | ✅ `main/index.ts` lines 46–71 |
| `contentHint = "motion"` | ✅ applied at publish + via livekit-client SVC default |
| `degradationPreference = "maintain-framerate"` | ✅ via independent `setParameters` (v0.5.12 fix) |
| `networkPriority = "high"` on screenshare encoding | ✅ same |
| `scaleResolutionDownBy = 1.5` for 1080p+ sources | ✅ same |
| Stereo Opus + music preset for screenshare audio | ✅ Plan-1 era |
| Per-publisher and per-receiver `getStats()` sampling | ✅ Plan-1 era |
| ICE candidate pair logging (host/srflx/relay) | ✅ Plan-1 era |
| Auto-mark-read on thread open | ✅ Plan 3 |
| Per-thread mute / DND | ✅ Plan 3 |

We are not behind on the WebRTC fundamentals. The v0.5.12 audit caught the things that mattered.

---

## What we could realistically adopt

Ranked by **impact / effort** ratio.

### Tier 1 — high-impact, low-effort (good Plan 5 candidates)

#### 1. **AV1 codec when supported** — biggest single bitrate win available

LiveKit added `videoCodec: "av1"` in livekit-client 2.x. AV1 hardware encode is supported on:
- NVIDIA RTX 30 series and newer (NVENC)
- Intel Arc + 12th gen+ iGPUs (Quick Sync)
- Apple Silicon M3+
- AMD RDNA3+ (RX 7000+)

Bitrate savings: ~40% vs VP9 at the same quality. So a 4 Mbps VP9 stream becomes ~2.5 Mbps AV1 — exactly the threshold where shaky home upload links start working.

**Concern:** decoder support. Receivers need AV1 decode. Software decode of AV1 is doable on modern CPUs but still expensive. We'd need a runtime feature-detection step: probe both ends, fall back to VP9 if any participant can't decode AV1.

**Estimate:** 1–2 days. Existing `livekit-room.ts` already plumbs codec choice; just needs a capability negotiation.

#### 2. **Per-remote video-quality picker** (Discord-style)

Currently each remote screenshare track is consumed at whatever the publisher sent. LiveKit supports `participant.setVideoQuality(VideoQuality.LOW | MEDIUM | HIGH)` per remote — the SFU then forwards the appropriate SVC/simulcast layer to that receiver. Discord exposes this as right-click → "Stream quality" → `Auto / 720p / 1080p / Source`.

For someone on a phone tether watching their friend's 4K stream, this is the difference between watching at all and not.

**Estimate:** 0.5 day. Add a context-menu item + `setVideoQuality` call.

#### 3. **Keyframe-on-join (PLI request)**

When a new viewer subscribes to a stream mid-broadcast, they need an I-frame to start decoding. WebRTC normally inserts I-frames on a 2–5s cadence — so newcomers stare at a gray frame until the next one. LiveKit DOES auto-request a PLI on subscribe, but it's worth verifying with the receiver-side stats sampler (look for `firCount`/`pliCount` going up immediately on subscribe).

**Estimate:** 0.5 day to verify; if missing, add `track.requestKeyFrame()` (LiveKit RemoteVideoTrack API).

#### 4. **"Source" / no-downscale toggle** for HiDPI users

We force `scaleResolutionDownBy = 1.5` on 1080p+ sources because that helped OpenH264 software encode. With VP9 (or AV1), modern CPUs can encode native 1080p smoothly. Add a "Source quality" preset that sets `scaleResolutionDownBy = 1.0` and a higher `maxBitrate`.

**Estimate:** 1 day. Add a fourth preset to the PreJoinScreen + plumb through to `applyScreenShareSenderOverrides`.

### Tier 2 — moderate effort, situational benefit

#### 5. **Receiver-side bandwidth probe + adaptive layer**

Discord's client measures the receiver's downlink and tells the SFU "I can take medium quality, not source." LiveKit's `adaptiveStream` flag does this automatically (we already enable it in `livekit-room.ts:206`). Worth verifying it actually fires under throttled conditions. The receiver-side stats sampler logs `framesPerSecond` + `bytesReceived` — a follow-up could detect quality drops and surface them to the user as "your network is dropping quality" so they know it's not the publisher's fault.

**Estimate:** 1–2 days for the diagnostic UI. Underlying mechanism already works.

#### 6. **Per-stream chat overlay** (during fullscreen viewing)

Discord shows the room's text chat in a small overlay when you're fullscreen-viewing someone's stream. We have RoomChatPanel — could mount it as a slide-in over the InRoomScreen tile.

**Estimate:** 1 day. Pure UI integration.

### Tier 3 — proprietary or massive scope (skip)

These are theoretically adoptable but the ROI doesn't justify the work for a self-hosted Discord alternative:

- **Custom packet pacer.** libwebrtc's default is fine. Discord's custom one shaves ~10ms off jitter at scale. Not worth a year of work.
- **Custom SFU.** LiveKit is excellent. Don't reinvent.
- **Studio-quality 25 Mbps mode.** We already cap at ~12 Mbps for 4K (`computeScreenShareBitrate`). 25 Mbps mostly serves bragging rights for screen-recording streamers, not normal home use.
- **Discord Voice Gateway protocol.** Not a useful target — it's tied to Discord's auth/permissions model.

---

## What's "secret sauce" but actually not

Things people on Reddit / forums claim Discord does that they don't actually do:

- ❌ "Discord uses a custom video codec." No — VP9 + AV1, same as everyone.
- ❌ "Discord has lower latency because it's not WebRTC." It IS WebRTC. They use libwebrtc with patches, but RTP/SRTP/DTLS/ICE all standard.
- ❌ "Vencord changes the protocol." No — it's a UI/client-config patcher.
- ❌ "Discord pays Cloudflare for a special edge network." They use Cloudflare for HTTPS/CDN like everyone else; voice traffic goes peer→SFU→peer over their own infra.

---

## Recommended Plan 5 (screensharing parity)

Bundle Tier 1 into a single sub-project. Skip Tier 2 unless real users complain. Skip Tier 3 entirely.

**Order:**
1. AV1 codec with capability negotiation (1–2 days, biggest impact)
2. Keyframe-on-join verification + fix if missing (0.5 day)
3. Per-remote video-quality picker (0.5 day)
4. "Source" no-downscale preset (1 day)
5. Per-stream chat overlay (1 day, UX polish)

**Total estimate:** 3–5 days for Plan 5.

End state: RedVoice screensharing is functionally indistinguishable from Discord Nitro for the average user, and **better** in the only way that matters — open source, self-hostable, no paywall, no Nitro upsell. The screenshare bitrate cap problem (Discord-free's 2.5 Mbps) doesn't exist for us at all.

---

## Sources

This is synthesized from:
- Discord's engineering blog (2018 voice rewrite, 2022 SFU rewrite, 2024 AV1 announcement)
- Vencord source (`Vencord/src/plugins/experiments` and similar plugins that patch RTC behavior)
- libwebrtc + LiveKit source for what's already exposed at the standard API layer
- Direct observation of `chrome://webrtc-internals` traces from a Discord call vs. a RedVoice call
- The v0.5.12 work that did the same audit pass for our codebase

No proprietary code was reverse-engineered. Everything cited is observable from public sources or from running both clients with WebRTC introspection enabled.
