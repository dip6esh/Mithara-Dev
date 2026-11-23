/**
 * New-order sound for the admin console.
 *
 * Synthesised with the Web Audio API (no audio file to host): a bright kitchen-bell phrase built from
 * bell-like partials, pushed through a compressor so it is far louder than a plain beep without
 * distorting. While an order is waiting it repeats until the popup is dismissed.
 *
 * Browsers only allow sound after the person has clicked or tapped the page once, so `unlockAudio()`
 * is called from the first interaction and from the sound toggle.
 */
import { useSyncExternalStore } from "react";

const KEY = "mithara-admin-order-sound";
const RING_EVERY_MS = 4500;
/** The bell rings this many times (about 14 seconds) and then goes quiet; the popup stays until dismissed. */
const MAX_RINGS = 3;

let ctx: AudioContext | null = null;
let enabled: boolean | null = null;
const subs = new Set<() => void>();

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  return ctx;
}

/** Call from any click / tap / key press so the browser allows sound later. */
export function unlockAudio() {
  const c = getCtx();
  if (c && c.state === "suspended") void c.resume().catch(() => {});
}

/** true while the browser is still blocking sound (nobody has interacted with the page yet). */
export function isAudioBlocked(): boolean {
  return !ctx || ctx.state !== "running";
}

function readEnabled(): boolean {
  if (enabled !== null) return enabled;
  try {
    enabled = window.localStorage.getItem(KEY) !== "off";
  } catch {
    enabled = true;
  }
  return enabled;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable: the choice lasts for this visit only */
  }
  if (!on) stopRinging();
  subs.forEach((l) => l());
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(
    (l) => {
      subs.add(l);
      return () => subs.delete(l);
    },
    readEnabled,
    () => true,
  );
}

/** One ring: rising three-note run, then a full, long chord, played twice. Returns false if sound is unavailable. */
export function playOrderChime(): boolean {
  const c = getCtx();
  if (!c) return false;
  if (c.state === "suspended") void c.resume().catch(() => {});

  const master = c.createGain();
  master.gain.value = 0.85;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -22;
  comp.knee.value = 8;
  comp.ratio.value = 8;
  comp.attack.value = 0.002;
  comp.release.value = 0.22;
  master.connect(comp);
  comp.connect(c.destination);

  const base = c.currentTime + 0.03;
  // ratio to the fundamental, relative loudness: gives the metallic "bell" colour
  const partials: Array<[number, number]> = [
    [1, 1],
    [2.01, 0.55],
    [2.76, 0.35],
    [4.07, 0.2],
    [5.4, 0.12],
  ];

  const bell = (freq: number, at: number, dur: number, vol: number) => {
    partials.forEach(([ratio, amp], i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = i === 0 ? "triangle" : "sine";
      osc.frequency.value = freq * ratio;
      const t = base + at;
      const d = dur / (1 + i * 0.6);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * amp), t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + d);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + d + 0.05);
    });
  };

  const phrase = (offset: number) => {
    bell(784, offset, 0.8, 0.5); // G5
    bell(1047, offset + 0.16, 0.8, 0.5); // C6
    bell(1319, offset + 0.32, 0.8, 0.5); // E6
    [1047, 1319, 1568, 2093].forEach((f) => bell(f, offset + 0.52, 1.5, 0.4)); // full C-major chord
  };
  phrase(0);
  phrase(1.9);
  return true;
}

let ringTimer: ReturnType<typeof setInterval> | null = null;
/** Which set of waiting orders we have already rung for, so moving between admin pages never re-rings. */
let rangFor: string | null = null;

function endTimer() {
  if (ringTimer) {
    clearInterval(ringTimer);
    ringTimer = null;
  }
}

/**
 * Rings MAX_RINGS times for the given batch of waiting orders, then stays silent.
 * Calling again with the same `batch` key does nothing; a new order changes the key and rings again.
 */
export function startRinging(batch: string) {
  if (typeof window === "undefined" || !readEnabled() || rangFor === batch) return;
  endTimer();
  rangFor = batch;
  let rings = 0;
  const tick = () => {
    if (!readEnabled() || rings >= MAX_RINGS) {
      endTimer();
      return;
    }
    rings += 1;
    playOrderChime();
  };
  tick();
  ringTimer = setInterval(tick, RING_EVERY_MS);
}

/** Silences the bell immediately and forgets the batch (call when the popup is dismissed). */
export function stopRinging() {
  endTimer();
  rangFor = null;
}
