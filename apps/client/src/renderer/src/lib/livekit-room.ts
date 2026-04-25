import {
  Room,
  RoomEvent,
  DataPacket_Kind,
  AudioPresets,
  DisconnectReason,
  ExternalE2EEKeyProvider,
  type RemoteParticipant,
  type LocalParticipant,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
// Vite ?worker suffix produces a Worker constructor that's bundled separately.
// The E2EE worker is where SFrame encryption/decryption runs off the main thread.
import E2eeWorker from "livekit-client/e2ee-worker?worker";
import { startSystemAudioStream, stopSystemAudioStream } from "./system-audio-stream.js";

export type DisconnectKind =
  | "removed-by-owner"
  | "room-deleted"
  | "server-shutdown"
  | "duplicate-identity"
  | "other";

export interface RoomStateSnapshot {
  connected: boolean;
  local: LocalParticipant | null;
  remotes: RemoteParticipant[];
  error: string | null;
  /** True iff the local participant is publishing a screen_share_audio track. */
  screenShareAudioEnabled: boolean;
  /** Set when the SFU disconnected us with a meaningful reason (removed/deleted). */
  disconnectKind: DisconnectKind | null;
  /** True iff E2EE is currently active (room key has been set on the provider). */
  e2eeEnabled: boolean;
}

export type RoomStateListener = (state: RoomStateSnapshot) => void;

export interface ScreenShareQuality {
  /** Video resolution width (e.g. 1280, 1920). */
  width: number;
  /** Video resolution height (e.g. 720, 1080). */
  height: number;
  /** Frames per second (30 or 60). */
  frameRate: number;
  /**
   * Audio source to share alongside video:
   *   null  → silent share
   *   "all" → every app's audio except RedVoice's own
   *   "<pid>" → only this process's audio
   */
  audioSource: null | "all" | string;
}

export interface JoinOptions {
  wsUrl: string;
  token: string;
  /** Optional pre-opened MediaStream to publish as mic track. */
  micStream?: MediaStream;
  /** If false (default), do not publish mic audio at all. Set true to publish. */
  publishAudio?: boolean;
  /** If true, ask LiveKit to also acquire a screenshare track on connect. */
  publishScreen?: boolean;
  /** Quality settings for the screenshare publish. Used when publishScreen is true. */
  screenQuality?: ScreenShareQuality;
}

function mapDisconnectReason(reason: DisconnectReason | undefined): DisconnectKind | null {
  switch (reason) {
    case DisconnectReason.PARTICIPANT_REMOVED:
      return "removed-by-owner";
    case DisconnectReason.ROOM_DELETED:
      return "room-deleted";
    case DisconnectReason.SERVER_SHUTDOWN:
      return "server-shutdown";
    case DisconnectReason.DUPLICATE_IDENTITY:
      return "duplicate-identity";
    case DisconnectReason.CLIENT_INITIATED:
    case undefined:
      // User-initiated leave isn't an "interesting" disconnect; surface as null.
      return null;
    default:
      return "other";
  }
}

/**
 * Conservative max bitrate for screenshare publish. Keeps the sender from
 * overshooting typical home upload bandwidth (~5–10 Mbps) — encoder degrades
 * quality smoothly under cap instead of dropping frames.
 */
function computeScreenShareBitrate(width: number, height: number, fps: number): number {
  const pixels = width * height;
  let base: number;
  // Conservative tiers — sized for ~10 Mbps typical home upload after
  // overhead, reserving headroom for mic + signaling. If you've got
  // gigabit fiber and want max quality, future setting toggle goes here.
  if (pixels >= 3840 * 2160) base = 3_000_000; // 4K
  else if (pixels >= 2560 * 1440) base = 2_000_000; // 1440p
  else if (pixels >= 1920 * 1080) base = 1_200_000; // 1080p
  else base = 600_000; // 720p and below
  // 60 fps adds ~50% to motion-area cost.
  const fpsScale = fps > 30 ? 1.5 : 1;
  return Math.round(base * fpsScale);
}

/**
 * Linux: capture screenshare audio. Two paths:
 *
 * 1. If `preferLabelContains` matches a virtual venmic device (e.g.
 *    "vencord-screen-share") — capture that. Excludes RedVoice's own playback.
 * 2. Otherwise fall back to a PulseAudio/PipeWire "Monitor of …" source
 *    (full system mix; will echo unless user wears headphones).
 */
async function captureLinuxMonitorSource(
  preferLabelContains?: string,
): Promise<MediaStream | null> {
  try {
    let devices = await navigator.mediaDevices.enumerateDevices();
    if (devices.every((d) => d.label === "")) {
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
        probe.getTracks().forEach((t) => t.stop());
      } catch { return null; }
      devices = await navigator.mediaDevices.enumerateDevices();
    }

    let target: MediaDeviceInfo | undefined;
    if (preferLabelContains) {
      const needle = preferLabelContains.toLowerCase();
      target = devices.find(
        (d) => d.kind === "audioinput" && d.label.toLowerCase().includes(needle),
      );
    }
    if (!target) {
      // Fallback: any monitor source.
      const monitors = devices.filter(
        (d) => d.kind === "audioinput" && /monitor/i.test(d.label),
      );
      if (monitors.length === 0) return null;
      target = monitors.find((m) => /default/i.test(m.label)) ?? monitors[0]!;
    }

    return await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: target.deviceId },
        // venmic's virtual device delivers raw PCM at 48 kHz stereo. Disable
        // browser audio processing so we don't double-process.
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false,
        channelCount: 2,
        sampleRate: 48000,
      },
    });
  } catch {
    return null;
  }
}

export class LiveKitRoom {
  readonly room: Room;
  private listeners = new Set<RoomStateListener>();
  private connected = false;
  private err: string | null = null;
  private disconnectKind: DisconnectKind | null = null;
  private keyProvider: ExternalE2EEKeyProvider;
  private e2eeEnabled = false;
  // Cached snapshot — useSyncExternalStore compares by reference, so this must
  // stay stable between LiveKit events or React will loop forever.
  private cachedSnapshot: RoomStateSnapshot;
  // Auxiliary MediaStream backing a non-LiveKit-managed screen audio track
  // (Linux PipeWire monitor or Windows getDisplayMedia fallback). We keep the
  // stream so we can stop() its tracks when the user disables audio share.
  private screenAudioAuxStream: MediaStream | null = null;

  constructor() {
    // E2EE is wired up at room construction. The provider doesn't apply any
    // encryption until setRoomKey() is called — when no key is set the room
    // publishes plaintext, exactly like a non-E2EE setup. Toggle is purely
    // a function of "has a key been set".
    this.keyProvider = new ExternalE2EEKeyProvider();
    // dynacast disabled — it changes simulcast layer counts at runtime and
    // has been the source of "BUNDLE codec collision PT=111" failures with
    // some server versions. adaptiveStream is fine (purely receive-side).
    this.room = new Room({
      adaptiveStream: true,
      dynacast: false,
      e2ee: {
        keyProvider: this.keyProvider,
        worker: new E2eeWorker(),
      },
      // Belt-and-suspenders: some livekit-client versions ignore the
      // 3rd arg of setScreenShareEnabled. Setting these as room-wide
      // defaults guarantees the screen track gets the right encoding
      // regardless of which path constructs it.
      publishDefaults: {
        // VP8 is broadly hardware-accelerated on Intel/AMD/Apple silicon —
        // VP9 (LiveKit's default) is CPU-heavy and the most common cause of
        // "choppy on receivers, fine locally" complaints once bitrate
        // caps are sane. AV1 looks great but is even slower to encode.
        screenShareEncoding: {
          maxBitrate: 1_500_000,
          maxFramerate: 30,
        },
        videoCodec: "vp8",
      },
    });
    this.cachedSnapshot = this.computeSnapshot();

    this.room.on(RoomEvent.Connected, () => {
      this.connected = true;
      this.err = null;
      this.emit();
    });
    this.room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      this.connected = false;
      this.disconnectKind = mapDisconnectReason(reason);
      this.emit();
    });
    this.room.on(RoomEvent.ParticipantConnected, () => this.emit());
    this.room.on(RoomEvent.ParticipantDisconnected, () => this.emit());
    this.room.on(RoomEvent.TrackSubscribed, () => this.emit());
    this.room.on(RoomEvent.TrackUnsubscribed, () => this.emit());
    this.room.on(RoomEvent.ActiveSpeakersChanged, () => this.emit());
    this.room.on(RoomEvent.LocalTrackPublished, () => this.emit());
    this.room.on(RoomEvent.LocalTrackUnpublished, () => this.emit());
    this.room.on(RoomEvent.ConnectionStateChanged, () => this.emit());
    this.room.on(RoomEvent.ConnectionQualityChanged, () => this.emit());
  }

  subscribe(listener: RoomStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  snapshot(): RoomStateSnapshot {
    return this.cachedSnapshot;
  }

  private computeSnapshot(): RoomStateSnapshot {
    return {
      connected: this.connected,
      local: this.room.localParticipant,
      remotes: Array.from(this.room.remoteParticipants.values()),
      error: this.err,
      screenShareAudioEnabled: this.room.localParticipant.getTrackPublication(
        Track.Source.ScreenShareAudio,
      ) != null,
      disconnectKind: this.disconnectKind,
      e2eeEnabled: this.e2eeEnabled,
    };
  }

  /**
   * Set the shared E2EE key for this room. Once set, all subsequently-
   * published frames are SFrame-encrypted, and incoming frames are
   * decrypted with the same key. Pass an ArrayBuffer of 32 random bytes
   * for HKDF-derived keys (recommended).
   */
  async setRoomKey(rawKey: ArrayBuffer): Promise<void> {
    await this.keyProvider.setKey(rawKey);
    await this.room.setE2EEEnabled(true);
    this.e2eeEnabled = true;
    this.emit();
  }

  /** Disable E2EE on this room (revert to plaintext). */
  async clearRoomKey(): Promise<void> {
    if (!this.e2eeEnabled) return;
    await this.room.setE2EEEnabled(false);
    this.e2eeEnabled = false;
    this.emit();
  }

  private emit(): void {
    this.cachedSnapshot = this.computeSnapshot();
    for (const l of this.listeners) l(this.cachedSnapshot);
  }

  async join(options: JoinOptions): Promise<void> {
    try {
      await this.room.connect(options.wsUrl, options.token);
    } catch (err) {
      this.err = err instanceof Error ? err.message : "failed to connect";
      this.connected = false;
      this.emit();
      throw err;
    }
    // Publish mic only if explicitly requested (voice deferred to Plan 4
    // pending codec-collision investigation with livekit-client 2.x).
    if (options.publishAudio) {
      if (options.micStream) {
        const [micTrack] = options.micStream.getAudioTracks();
        if (micTrack) {
          await this.room.localParticipant.publishTrack(micTrack, { source: Track.Source.Microphone });
        }
      } else {
        await this.room.localParticipant.setMicrophoneEnabled(true);
      }
    }
    // Publish screenshare. We always start the video share with audio:false
    // and route audio through enableScreenShareAudio() so the toggle works
    // uniformly whether requested at join time or flipped mid-room.
    if (options.publishScreen) {
      const q = options.screenQuality;
      if (q) {
        await this.room.localParticipant.setScreenShareEnabled(
          true,
          {
            resolution: { width: q.width, height: q.height, frameRate: q.frameRate },
            audio: false,
            contentHint: "motion",
          },
          {
            // Per-publish overrides (room defaults provide the fallback).
            // Cap encoder bitrate so we don't overshoot the user's upload
            // budget. LiveKit's default for screenshare is ~3 Mbps at
            // 1080p30 / ~4.5 Mbps at 60 fps which causes packet drops on
            // typical home upload links — choppy playback for everyone
            // else. Tighter cap → encoder degrades quality smoothly via
            // WebRTC bandwidth estimation instead of dropping frames.
            screenShareEncoding: {
              maxBitrate: computeScreenShareBitrate(q.width, q.height, q.frameRate),
              maxFramerate: q.frameRate,
            },
            videoCodec: "vp8",
          },
        );
        if (q.audioSource !== null) {
          await this.enableScreenShareAudio(
            q.audioSource === "all" ? undefined : q.audioSource,
          );
        }
      } else {
        await this.room.localParticipant.setScreenShareEnabled(true);
      }
    }
  }

  /**
   * Publish a screen_share_audio track. Capture order:
   *   1. Native WASAPI filter (Windows 11+, excludes RedVoice's own playback)
   *   2. Linux PipeWire venmic device (per-app or system-mix-minus-self)
   *   3. getDisplayMedia({audio:true, video:false}) — Windows fallback
   *
   * `includeProcessId` restricts capture to a single app: a process.id
   * string for Linux/venmic, or a numeric PID (as string) on Windows for
   * the WASAPI helper's --include-pid mode.
   */
  async enableScreenShareAudio(includeProcessId?: string): Promise<boolean> {
    if (this.room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio)) {
      return true;
    }

    const platform = window.redvoice?.platform();

    let track: MediaStreamTrack | null = null;
    let auxStream: MediaStream | null = null;

    // 1. Native WASAPI filter
    if (platform === "win32") {
      try {
        const winPid = includeProcessId ? Number.parseInt(includeProcessId, 10) : undefined;
        const stream = await startSystemAudioStream(
          Number.isFinite(winPid) ? { includePid: winPid as number } : {},
        );
        track = stream?.getAudioTracks()[0] ?? null;
      } catch { /* */ }
      if (track) {
        // eslint-disable-next-line no-console
        console.log(
          includeProcessId
            ? `[screenshare] capturing PID ${includeProcessId} via WASAPI`
            : "[screenshare] system audio filtered via native helper (your voice excluded)",
        );
      }
    }

    // 2. Linux: ask main to set up a virtual sink that excludes RedVoice's
    //    playback, then capture from its monitor. Falls back to the full
    //    system-mix monitor if pactl isn't available.
    if (!track && platform === "linux") {
      let preferLabel: string | undefined;
      let routingEnabled = false;
      try {
        const routing = await window.redvoice.enableLinuxAudioRouting(
          includeProcessId ? { includeProcessId } : undefined,
        );
        if (routing) {
          preferLabel = routing.monitorDeviceDescription;
          routingEnabled = true;
        }
      } catch { /* */ }

      auxStream = await captureLinuxMonitorSource(preferLabel);
      track = auxStream?.getAudioTracks()[0] ?? null;
      if (track) {
        // eslint-disable-next-line no-console
        console.log(
          routingEnabled
            ? "[screenshare] linux: capturing redvoice_share.monitor — RedVoice playback excluded"
            : "[screenshare] linux: capturing default monitor (system mix; use headphones to avoid echo)",
        );
      } else if (routingEnabled) {
        // Capture failed even though routing was set up — tear it down so
        // we don't leave the user's audio rerouted.
        try { await window.redvoice.disableLinuxAudioRouting(); } catch { /* */ }
      }
    }

    // 3. Windows fallback dialog
    if (!track) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: false,
        } as DisplayMediaStreamOptions);
        track = stream.getAudioTracks()[0] ?? null;
        stream.getVideoTracks().forEach((t) => t.stop());
        if (track) {
          auxStream = stream;
          // eslint-disable-next-line no-console
          console.log("[screenshare] system audio NOT filtered — others may hear themselves; use headphones");
        }
      } catch {
        return false;
      }
    }

    if (!track) return false;

    this.screenAudioAuxStream = auxStream;
    // High-quality stereo Opus for screenshare audio. The LiveKit default
    // is a speech preset (~24 kbps mono) which butchers music/game audio.
    // dtx (discontinuous transmission) drops silent frames — fine for voice,
    // but it kills tail/decay on music. red (redundant encoding) adds
    // latency, also undesirable here. forceStereo keeps both channels.
    await this.room.localParticipant.publishTrack(track, {
      source: Track.Source.ScreenShareAudio,
      audioPreset: AudioPresets.musicHighQualityStereo,
      dtx: false,
      red: false,
      forceStereo: true,
    });
    this.emit();
    return true;
  }

  /** Unpublish the active screen_share_audio track and release the source. */
  async disableScreenShareAudio(): Promise<void> {
    const pub = this.room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
    if (pub?.track) {
      try { await this.room.localParticipant.unpublishTrack(pub.track); } catch { /* */ }
    }
    if (this.screenAudioAuxStream) {
      this.screenAudioAuxStream.getTracks().forEach((t) => t.stop());
      this.screenAudioAuxStream = null;
    }
    await stopSystemAudioStream();
    try { await window.redvoice?.disableLinuxAudioRouting?.(); } catch { /* */ }
    this.emit();
  }

  async setMuted(muted: boolean): Promise<void> {
    await this.room.localParticipant.setMicrophoneEnabled(!muted);
    this.emit();
  }

  /**
   * Pull network stats for the local mic track from the underlying RTCPeerConnection.
   * roundTripTime is the RTT in ms reported by the receiver (server) → roughly 2× the
   * one-way audio latency. jitter and packetsLost help diagnose stalls; with multi-second
   * voice delay, jitter buffer ramp-up from packet loss is the usual cause.
   *
   * Returns null if no stats are available (no track / not connected yet).
   */
  async getNetworkStats(): Promise<{
    rttMs: number | null;
    jitterMs: number | null;
    packetsLost: number | null;
    bitrateKbps: number | null;
  } | null> {
    const audioPub = Array.from(this.room.localParticipant.audioTrackPublications.values()).find(
      (p) => p.source === Track.Source.Microphone,
    );
    if (!audioPub?.track) return null;
    const report = await audioPub.track.getRTCStatsReport();
    if (!report) return null;

    let rttMs: number | null = null;
    let jitterMs: number | null = null;
    let packetsLost: number | null = null;
    let bitrateKbps: number | null = null;

    report.forEach((stat: { type: string; [k: string]: unknown }) => {
      if (stat.type === "remote-inbound-rtp") {
        const rtt = stat["roundTripTime"];
        if (typeof rtt === "number") rttMs = rtt * 1000;
        const jit = stat["jitter"];
        if (typeof jit === "number") jitterMs = jit * 1000;
        const lost = stat["packetsLost"];
        if (typeof lost === "number") packetsLost = lost;
      }
      if (stat.type === "outbound-rtp") {
        const br = stat["targetBitrate"];
        if (typeof br === "number") bitrateKbps = br / 1000;
      }
    });

    return { rttMs, jitterMs, packetsLost, bitrateKbps };
  }

  async setScreenShare(enabled: boolean): Promise<void> {
    await this.room.localParticipant.setScreenShareEnabled(enabled);
    this.emit();
  }

  async setCamera(enabled: boolean): Promise<void> {
    await this.room.localParticipant.setCameraEnabled(enabled);
    this.emit();
  }

  async leave(): Promise<void> {
    await this.disableScreenShareAudio();
    await this.room.disconnect();
    this.connected = false;
    this.emit();
  }

  /**
   * Send a chat message to every other participant via DataChannel.
   * Reliable delivery; ephemeral (no server-side persistence).
   */
  async sendChat(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    const payload = new TextEncoder().encode(
      JSON.stringify({ kind: "chat", text: trimmed, ts: Date.now() }),
    );
    await this.room.localParticipant.publishData(payload, { reliable: true });
  }

  /**
   * Subscribe to incoming chat messages. Returns unsubscribe.
   * `from` is the participant identity; `local` denotes self-echo.
   */
  onChat(
    cb: (msg: { from: string; fromName: string; text: string; ts: number; local: boolean }) => void,
  ): () => void {
    const handler = (
      payload: Uint8Array,
      participant?: RemoteParticipant,
      _kind?: DataPacket_Kind,
    ): void => {
      try {
        const obj = JSON.parse(new TextDecoder().decode(payload)) as {
          kind?: string;
          text?: string;
          ts?: number;
        };
        if (obj.kind !== "chat" || typeof obj.text !== "string") return;
        if (!participant) return;
        cb({
          from: participant.identity,
          fromName: participant.name || participant.identity,
          text: obj.text,
          ts: typeof obj.ts === "number" ? obj.ts : Date.now(),
          local: false,
        });
      } catch {
        /* drop malformed payloads */
      }
    };
    this.room.on(RoomEvent.DataReceived, handler);
    return () => {
      this.room.off(RoomEvent.DataReceived, handler);
    };
  }

  /**
   * Attach every subscribed remote audio track to a DOM element for playback.
   * Call once per remote audio track, idempotently. Returns detach function.
   */
  attachRemoteAudio(
    track: RemoteTrack,
    _pub: RemoteTrackPublication,
    _participant: RemoteParticipant,
  ): HTMLAudioElement {
    const element = track.attach() as HTMLAudioElement;
    element.autoplay = true;
    (element as HTMLElement & { playsInline?: boolean }).playsInline = true;
    return element;
  }
}

// Re-export LiveKit types the UI layer needs directly.
export type { RemoteParticipant, LocalParticipant, RemoteTrack, RemoteTrackPublication } from "livekit-client";
export { Track, RoomEvent } from "livekit-client";
