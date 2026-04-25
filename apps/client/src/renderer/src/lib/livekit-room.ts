import {
  Room,
  RoomEvent,
  DataPacket_Kind,
  type RemoteParticipant,
  type LocalParticipant,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import { startSystemAudioStream, stopSystemAudioStream } from "./system-audio-stream.js";

export interface RoomStateSnapshot {
  connected: boolean;
  local: LocalParticipant | null;
  remotes: RemoteParticipant[];
  error: string | null;
  /** True iff the local participant is publishing a screen_share_audio track. */
  screenShareAudioEnabled: boolean;
}

export type RoomStateListener = (state: RoomStateSnapshot) => void;

export interface ScreenShareQuality {
  /** Video resolution width (e.g. 1280, 1920). */
  width: number;
  /** Video resolution height (e.g. 720, 1080). */
  height: number;
  /** Frames per second (30 or 60). */
  frameRate: number;
  /** If true, also capture system audio alongside the screen video. */
  audio: boolean;
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
  // Cached snapshot — useSyncExternalStore compares by reference, so this must
  // stay stable between LiveKit events or React will loop forever.
  private cachedSnapshot: RoomStateSnapshot;
  // Auxiliary MediaStream backing a non-LiveKit-managed screen audio track
  // (Linux PipeWire monitor or Windows getDisplayMedia fallback). We keep the
  // stream so we can stop() its tracks when the user disables audio share.
  private screenAudioAuxStream: MediaStream | null = null;

  constructor() {
    // dynacast disabled — it changes simulcast layer counts at runtime and
    // has been the source of "BUNDLE codec collision PT=111" failures with
    // some server versions. adaptiveStream is fine (purely receive-side).
    this.room = new Room({
      adaptiveStream: true,
      dynacast: false,
    });
    this.cachedSnapshot = this.computeSnapshot();

    this.room.on(RoomEvent.Connected, () => {
      this.connected = true;
      this.err = null;
      this.emit();
    });
    this.room.on(RoomEvent.Disconnected, () => {
      this.connected = false;
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
    };
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
        await this.room.localParticipant.setScreenShareEnabled(true, {
          resolution: { width: q.width, height: q.height, frameRate: q.frameRate },
          audio: false,
          contentHint: "motion",
        });
        if (q.audio) {
          await this.enableScreenShareAudio();
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
   * `linuxIncludeProcessId` (optional) restricts Linux capture to a single
   * app's audio. Omit for system-wide-minus-RedVoice.
   */
  async enableScreenShareAudio(linuxIncludeProcessId?: string): Promise<boolean> {
    if (this.room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio)) {
      return true;
    }

    const platform = window.redvoice?.platform();

    let track: MediaStreamTrack | null = null;
    let auxStream: MediaStream | null = null;

    // 1. Native WASAPI filter
    try {
      const stream = await startSystemAudioStream();
      track = stream?.getAudioTracks()[0] ?? null;
    } catch { /* */ }
    if (track) {
      // eslint-disable-next-line no-console
      console.log("[screenshare] system audio filtered via native helper (your voice excluded)");
    }

    // 2. Linux: ask main to set up a virtual sink that excludes RedVoice's
    //    playback, then capture from its monitor. Falls back to the full
    //    system-mix monitor if pactl isn't available.
    if (!track && platform === "linux") {
      let preferLabel: string | undefined;
      let routingEnabled = false;
      try {
        const routing = await window.redvoice.enableLinuxAudioRouting(
          linuxIncludeProcessId ? { includeProcessId: linuxIncludeProcessId } : undefined,
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
    await this.room.localParticipant.publishTrack(track, {
      source: Track.Source.ScreenShareAudio,
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
