import {
  Room,
  RoomEvent,
  DataPacket_Kind,
  type RemoteParticipant,
  type LocalParticipant,
  Track,
  type LocalTrackPublication,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import { startSystemAudioStream, stopSystemAudioStream } from "./system-audio-stream.js";

export interface RoomStateSnapshot {
  connected: boolean;
  local: LocalParticipant | null;
  remotes: RemoteParticipant[];
  error: string | null;
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

export class LiveKitRoom {
  readonly room: Room;
  private listeners = new Set<RoomStateListener>();
  private connected = false;
  private err: string | null = null;
  // Cached snapshot — useSyncExternalStore compares by reference, so this must
  // stay stable between LiveKit events or React will loop forever.
  private cachedSnapshot: RoomStateSnapshot;
  // Publication for the filtered screenshare-audio track, when the native
  // filter is in use. Held so we can unpublish it on leave.
  private filteredScreenAudioPub: LocalTrackPublication | null = null;

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
    // Publish screenshare
    if (options.publishScreen) {
      const q = options.screenQuality;
      if (q) {
        // When the user wants system audio along with the share, try the
        // native filtered capture first (Windows + helper available). It
        // captures the system mix EXCLUDING our own process tree, so
        // remote voices we're playing back don't bleed into the share.
        // Fall back to the browser's getDisplayMedia({audio:true}) when
        // the helper isn't available.
        let filteredAudio: MediaStreamTrack | null = null;
        if (q.audio) {
          try {
            const stream = await startSystemAudioStream();
            filteredAudio = stream?.getAudioTracks()[0] ?? null;
          } catch {
            filteredAudio = null;
          }
          // Surface in DevTools so it's easy to confirm the filter activated.
          // eslint-disable-next-line no-console
          console.log(
            filteredAudio
              ? "[screenshare] system audio filtered via native helper (your voice excluded)"
              : "[screenshare] system audio NOT filtered — others may hear themselves; use headphones",
          );
        }

        await this.room.localParticipant.setScreenShareEnabled(true, {
          resolution: { width: q.width, height: q.height, frameRate: q.frameRate },
          // If we got a filtered audio track, capture video only and we'll
          // publish the audio separately below. Otherwise let the browser
          // capture system audio inline (the existing path).
          audio: q.audio && !filteredAudio,
          systemAudio: q.audio && !filteredAudio ? "include" : "exclude",
          contentHint: "motion",
        });

        if (filteredAudio) {
          this.filteredScreenAudioPub = await this.room.localParticipant.publishTrack(
            filteredAudio,
            { source: Track.Source.ScreenShareAudio },
          );
        }
      } else {
        await this.room.localParticipant.setScreenShareEnabled(true);
      }
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    await this.room.localParticipant.setMicrophoneEnabled(!muted);
    this.emit();
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
    if (this.filteredScreenAudioPub?.track) {
      try { await this.room.localParticipant.unpublishTrack(this.filteredScreenAudioPub.track); } catch { /* */ }
      this.filteredScreenAudioPub = null;
    }
    await stopSystemAudioStream();
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
