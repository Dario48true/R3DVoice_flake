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

/** Ask for mic access and return a stream from the given device. Throws on denial. */
export async function openMicStream(deviceId: string | undefined): Promise<MediaStream> {
  if (!globalThis.navigator?.mediaDevices?.getUserMedia) {
    throw new Error("mic unavailable");
  }
  const constraints: MediaStreamConstraints = {
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    video: false,
  };
  return navigator.mediaDevices.getUserMedia(constraints);
}
