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
    "Google UK English Female",
    "Google US English",
    "Microsoft Aria Online (Natural) - English (United States)",
    "Microsoft Jenny Online (Natural) - English (United States)",
    "Samantha",
    "Karen",
    "Serena",
  ];
  for (const name of preferred) {
    const v = voices.find((x) => x.name === name);
    if (v) return v;
  }
  return voices.find((v) => v.lang.toLowerCase().startsWith("en")) ?? voices[0];
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
   * Speak `text` synchronously. Must be called from within a user-gesture
   * handler on the FIRST invocation (iOS Safari requirement). Subsequent
   * calls work freely once the engine is unlocked.
   */
  const speakNow = useCallback((text: string) => {
    if (!text) return;
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (mutedRef.current) return;

    // Cancel any in-flight speech before starting a new utterance.
    window.speechSynthesis.cancel();
    setCaption(text);

    const u = new SpeechSynthesisUtterance(text);
    // On iOS the voice list may not be populated yet on the very first tap.
    // Setting `u.voice = null` is fine; the browser uses its default voice.
    if (voiceRef.current) u.voice = voiceRef.current;
    u.rate = 0.95;
    u.pitch = 1;
    u.volume = 1;
    u.lang = voiceRef.current?.lang ?? "en-US";
    u.onstart = () => setStatus("speaking");
    u.onend = () => setStatus("idle");
    u.onerror = () => setStatus("idle");

    window.speechSynthesis.speak(u);
  }, []);

  // Route-change narration (after the engine is unlocked).
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (enabled && lastSpokenPathRef.current === currentPath) return;
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
      u.lang = voiceRef.current?.lang ?? "en-US";
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
