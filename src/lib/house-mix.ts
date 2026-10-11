export type MixMode = "premiere" | "night" | "dialogue" | "flat";

export type MixSettings = {
  threshold: number;
  knee: number;
  ratio: number;
  attack: number;
  release: number;
  makeup: number;
  presence: number;
  low: number;
  mid: number;
  high: number;
  hpf: number;
  lpf: number;
  gate: number;
};

export type EqOffset = { low: number; mid: number; high: number };

const MODES = new Set<MixMode>(["premiere", "night", "dialogue", "flat"]);

export function mixMode(value: unknown): MixMode {
  return typeof value === "string" && MODES.has(value as MixMode) ? (value as MixMode) : "premiere";
}

export function clampEq(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-6, Math.min(6, Math.round(n * 2) / 2));
}

/** Compressor, equalizer, and noise gate. Premiere stays open. Night holds peaks and hiss. Dialogue lifts speech. */
export function mixSettings(mode: MixMode): MixSettings {
  if (mode === "night") {
    return { threshold: -30, knee: 20, ratio: 8, attack: 0.008, release: 0.28, makeup: 1.35, presence: 2, low: -2, mid: 1, high: -1.5, hpf: 100, lpf: 14000, gate: 0.02 };
  }
  if (mode === "dialogue") {
    return { threshold: -24, knee: 10, ratio: 3.5, attack: 0.004, release: 0.16, makeup: 1.2, presence: 4.5, low: -1.5, mid: 2, high: 0.5, hpf: 90, lpf: 16000, gate: 0.015 };
  }
  if (mode === "flat") {
    return { threshold: 0, knee: 0, ratio: 1, attack: 0.003, release: 0.05, makeup: 1, presence: 0, low: 0, mid: 0, high: 0, hpf: 20, lpf: 20000, gate: 0 };
  }
  return { threshold: -18, knee: 24, ratio: 2, attack: 0.02, release: 0.32, makeup: 1.06, presence: 1.4, low: 1.2, mid: 0.4, high: 1, hpf: 70, lpf: 17000, gate: 0.012 };
}

export function shapedMix(mode: MixMode, offset: EqOffset, denoise: boolean): MixSettings {
  const base = mixSettings(mode);
  return {
    ...base,
    low: base.low + offset.low,
    mid: base.mid + offset.mid,
    high: base.high + offset.high,
    hpf: denoise ? base.hpf : 20,
    lpf: denoise ? base.lpf : 20000,
    gate: denoise ? base.gate : 0,
  };
}

export function noiseLevel(samples: Float32Array) {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, samples.length));
}

/** Soft gate. Quiet noise drops. Speech at the threshold stays open. */
export function gateGain(level: number, openAt: number) {
  if (openAt <= 0 || level >= openAt) return 1;
  const floor = openAt * 0.45;
  if (level <= floor) return 0.08;
  return 0.08 + ((level - floor) / (openAt - floor)) * 0.92;
}

export function mixForTheme(theme: string): MixMode {
  if (theme === "ember" || theme === "grove") return "night";
  if (theme === "ink") return "dialogue";
  return "premiere";
}

/** Average a frame, skipping near-black so the letterbox does not paint the room black. */
export function averageColor(data: Uint8ClampedArray): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 16) {
    const red = data[i] ?? 0;
    const green = data[i + 1] ?? 0;
    const blue = data[i + 2] ?? 0;
    if (red + green + blue < 28) continue;
    r += red;
    g += green;
    b += blue;
    n += 1;
  }
  if (!n) return [10, 14, 22];
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}
