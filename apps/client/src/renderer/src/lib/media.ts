export interface DeviceInfo {
  deviceId: string;
  label: string;
}

async function enumerateByKind(kind: "audioinput" | "audiooutput"): Promise<DeviceInfo[]> {
  const md = globalThis.navigator?.mediaDevices;
  if (!md?.enumerateDevices) return [];
  const devices = await md.enumerateDevices();
  return devices
    .filter((d) => d.kind === kind)
    .map((d) => ({ deviceId: d.deviceId, label: d.label || "(unnamed device)" }));
}

export function listAudioInputs(): Promise<DeviceInfo[]> {
  return enumerateByKind("audioinput");
}

export function listAudioOutputs(): Promise<DeviceInfo[]> {
  return enumerateByKind("audiooutput");
}

/**
 * Subscribe to mic level from a MediaStream track. Returns a cleanup function.
 * `onLevel` is called ~30fps with a 0..1 amplitude estimate (RMS).
 */
export function subscribeMicLevel(
  stream: MediaStream,
  onLevel: (level: number) => void,
): () => void {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);

  const buf = new Uint8Array(analyser.fftSize);
  let rafId = 0;
  let cancelled = false;

  const tick = (): void => {
    if (cancelled) return;
    analyser.getByteTimeDomainData(buf);
    // RMS: convert 0..255 to -1..1, square, mean, sqrt
    let sum = 0;
    for (let i = 0; i < buf.length; i += 1) {
      const v = (buf[i]! - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    onLevel(Math.min(1, rms * 6));
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
    source.disconnect();
    void ctx.close();
  };
}

export interface MicProcessingOptions {
  noiseSuppression?: "off" | "low" | "high";
  echoCancellation?: boolean;
  autoGainControl?: boolean;
  /**
   * Linear input gain. 1.0 = unity. Anything other than 1 routes the mic
   * through a Web Audio GainNode pipeline; the AudioContext lives for the
   * stream's lifetime (no automatic cleanup, but small/cheap).
   */
  gain?: number;
}

/** Pref level → mapping the actual pipeline applies. */
function nsPolicy(level: "off" | "low" | "high" | undefined): {
  browserNs: boolean;
  rnnoise: boolean;
} {
  switch (level ?? "low") {
    case "off":
      return { browserNs: false, rnnoise: false };
    case "low":
      return { browserNs: true, rnnoise: false };
    case "high":
      // Browser NS handles AEC + DC drift; RNNoise on top kills steady noise
      // (fans, room hum, keyboard). Heavier CPU, materially better quality.
      return { browserNs: true, rnnoise: true };
  }
}

/**
 * Ask for mic access and return a stream from the given device. Throws on denial.
 * Processing options map onto Chromium's WebRTC audio constraints. "high" pushes
 * NS hard but stops short of bundling RNNoise — that's a future audio worklet job.
 */
export async function openMicStream(
  deviceId: string | undefined,
  options: MicProcessingOptions = {},
): Promise<MediaStream> {
  if (!globalThis.navigator?.mediaDevices?.getUserMedia) {
    throw new Error("mic unavailable");
  }
  const policy = nsPolicy(options.noiseSuppression);
  const audioConstraints: MediaTrackConstraints = {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    noiseSuppression: policy.browserNs,
    echoCancellation: options.echoCancellation ?? true,
    autoGainControl: options.autoGainControl ?? true,
  };
  const constraints: MediaStreamConstraints = {
    audio: audioConstraints,
    video: false,
  };
  let stream = await navigator.mediaDevices.getUserMedia(constraints);

  if (policy.rnnoise) {
    try {
      // Lazy-load so the ~1.5 MB WASM blob isn't pulled in for users who
      // never touch noise suppression "high".
      const { applyRnnoise } = await import("./rnnoise-stream.js");
      stream = await applyRnnoise(stream);
    } catch (err) {
      // RNNoise failed to set up (worklet/WASM load error) — fall back to
      // the browser-default mic stream rather than dropping mic entirely.
      // eslint-disable-next-line no-console
      console.warn("[mic] RNNoise unavailable, using browser-default NS:", err);
    }
  }

  const gain = options.gain ?? 1;
  if (gain === 1) return stream;
  return applyGain(stream, gain);
}

function applyGain(stream: MediaStream, gain: number): MediaStream {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const gainNode = ctx.createGain();
  gainNode.gain.value = gain;
  const dest = ctx.createMediaStreamDestination();
  source.connect(gainNode).connect(dest);
  return dest.stream;
}
