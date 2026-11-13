import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { PAGE_NARRATION } from "./scripts";

type VoiceStatus = "idle" | "speaking" | "muted" | "unsupported";

interface VoiceContextValue {
  status: VoiceStatus;
  enabled: boolean;
  hasStarted: boolean;
  ttsSupported: boolean;
  caption: string;
  start: () => void;
  toggleMute: () => void;
  speakNow: (text: string) => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function useVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used inside VoiceHostProvider");
  return ctx;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const preferred = [
    // Indian Hindi & English — highest priority
    "Microsoft Swara Online (Natural) - Hindi (India)",
    "Microsoft Madhur Online (Natural) - Hindi (India)",
    "Google हिन्दी",
    "Microsoft Heera - English (India)",
    "Microsoft Neerja Online (Natural) - English (India)",
    "Google Indian English",
    // Neutral US fallbacks
    "Microsoft Aria Online (Natural) - English (United States)",
    "Microsoft Jenny Online (Natural) - English (United States)",
    "Google US English",
    "Samantha",
  ];
  for (const name of preferred) {
    const v = voices.find((x) => x.name === name);
    if (v) return v;
  }
  // Prefer en-IN voices over any other English
  return (
    voices.find((v) => v.lang.toLowerCase() === "en-in") ??
    voices.find((v) => v.lang.toLowerCase().startsWith("en")) ??
    voices[0]
  );
}

export function VoiceHostProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const [enabled, setEnabled] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [caption, setCaption] = useState("");
  const [ttsSupported, setTtsSupported] = useState(true);

  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const enabledRef = useRef(false);
  const mutedRef = useRef(false);
  const lastSpokenPathRef = useRef<string | null>(null);
  const speakTimerRef = useRef(0);
  // Newest speak request wins. Late events from older, cancelled utterances are ignored.
  const speakIdRef = useRef(0);
  // Keep a live reference to the utterance being spoken. Chrome can garbage-collect an utterance
  // that nothing references, which silently stops the speech (and its onend never fires).
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tts = !!window.speechSynthesis;
    setTtsSupported(tts);
    if (!tts) {
      setStatus("unsupported");
      return;
    }
    window.speechSynthesis.cancel();
    const load = () => {
      voiceRef.current = pickVoice();
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        window.speechSynthesis.cancel();
      }
    };
    const onUnload = () => window.speechSynthesis.cancel();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onUnload);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onUnload);
      window.removeEventListener("beforeunload", onUnload);
      window.speechSynthesis.cancel();
    };
  }, []);

  /**
   * Speak `text`, replacing whatever is playing. The newest call always wins.
   *
   * Why this is not just `cancel(); speak()`: Chrome and Edge drop a speak() that arrives while
   * the engine is still tearing down the previous utterance. Network voices (Edge "Online
   * (Natural)", Google voices) take well over 80 ms to tear down, so a fixed delay is a guess.
   * The tap that interrupted something did nothing, and the next tap (engine now idle) worked.
   *
   * So: if the engine is idle, speak immediately (inside the tap, which iOS likes). If it is busy,
   * cancel and wait until it reports idle, then speak. If the engine still never starts, cancel
   * and retry once.
   */
  const speakNow = useCallback((text: string) => {
    if (!text) return;
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (mutedRef.current) return;
    const synth = window.speechSynthesis;

    const id = ++speakIdRef.current;
    window.clearTimeout(speakTimerRef.current);
    setCaption(text);
    setStatus("speaking"); // instant feedback: the tap was received, even if the voice is slow to start

    const isCurrent = () => id === speakIdRef.current;

    const attempt = (tries: number) => {
      if (!isCurrent()) return;
      let started = false;
      const u = new SpeechSynthesisUtterance(text);
      if (voiceRef.current) u.voice = voiceRef.current;
      u.rate = 0.95;
      u.pitch = 1;
      u.volume = 1;
      u.lang = voiceRef.current?.lang ?? "en-IN";
      u.onstart = () => {
        started = true;
        if (isCurrent()) setStatus("speaking");
      };
      u.onend = () => {
        if (isCurrent() && utteranceRef.current === u) setStatus("idle");
      };
      u.onerror = () => {
        if (isCurrent() && utteranceRef.current === u) setStatus("idle");
      };
      utteranceRef.current = u;

      try {
        synth.resume();
      } catch {
        /* ignore */
      }
      synth.speak(u);

      // Watchdog: if the engine swallowed the utterance, reset it and try once more.
      speakTimerRef.current = window.setTimeout(() => {
        if (!isCurrent() || started || utteranceRef.current !== u) return;
        if (tries < 1) {
          synth.cancel();
          speakTimerRef.current = window.setTimeout(() => attempt(tries + 1), 150);
        } else {
          setStatus("idle");
        }
      }, 1200);
    };

    if (synth.speaking || synth.pending) {
      synth.cancel();
      const t0 = performance.now();
      const waitForIdle = () => {
        if (!isCurrent()) return;
        const idle = !synth.speaking && !synth.pending;
        if (idle || performance.now() - t0 > 500) attempt(0);
        else speakTimerRef.current = window.setTimeout(waitForIdle, 25);
      };
      speakTimerRef.current = window.setTimeout(waitForIdle, 25);
    } else {
      attempt(0);
    }
  }, []);

  // Route-change narration (after the engine is unlocked).
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (enabled && lastSpokenPathRef.current === currentPath) return;
    window.clearTimeout(speakTimerRef.current); // drop a card narration still waiting to start
    window.speechSynthesis.cancel();
    setCaption("");
    setStatus(muted ? "muted" : "idle");

    if (!enabled || muted) return;
    const text = PAGE_NARRATION[currentPath];
    if (!text) return;

    lastSpokenPathRef.current = currentPath;
    const t = window.setTimeout(() => speakNow(text), 150);
    return () => {
      window.clearTimeout(t);
      window.speechSynthesis.cancel();
    };
  }, [currentPath, enabled, muted, speakNow]);

  /**
   * Called from a real user gesture (tap/click/keydown) on the welcome
   * overlay. Speaks SYNCHRONOUSLY so iOS Safari accepts the speech.
   */
  const start = useCallback(() => {
    if (enabledRef.current) return;
    enabledRef.current = true;
    setEnabled(true);
    setHasStarted(true);

    // iOS unlock: a synchronous .speak() inside the gesture is what
    // unlocks the speech engine. Do NOT wrap in setTimeout.
    const path = router.state.location.pathname;
    const text = PAGE_NARRATION[path] ?? PAGE_NARRATION["/"];
    lastSpokenPathRef.current = path;

    if (typeof window !== "undefined" && window.speechSynthesis) {
      // Some iOS versions need a tiny resume()+cancel() priming.
      try {
        window.speechSynthesis.resume();
      } catch {
        /* ignore */
      }
      window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(text);
      if (voiceRef.current) u.voice = voiceRef.current;
      u.rate = 0.95;
      u.pitch = 1;
      u.volume = 1;
      u.lang = voiceRef.current?.lang ?? "en-IN";
      u.onstart = () => setStatus("speaking");
      u.onend = () => setStatus("idle");
      u.onerror = () => setStatus("idle");
      setCaption(text);
      window.speechSynthesis.speak(u);
    }
  }, [router]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (next) {
        if (typeof window !== "undefined") window.speechSynthesis?.cancel();
        setStatus("muted");
      } else {
        setStatus("idle");
      }
      return next;
    });
  }, []);

  // Keyboard: M = toggle mute
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        toggleMute();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, toggleMute]);

  const value = useMemo<VoiceContextValue>(
    () => ({
      status: muted ? "muted" : status,
      enabled,
      hasStarted,
      ttsSupported,
      caption,
      start,
      toggleMute,
      speakNow,
    }),
    [caption, enabled, hasStarted, muted, start, status, toggleMute, ttsSupported, speakNow],
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}
