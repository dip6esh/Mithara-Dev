import { useEffect, useRef } from "react";
import { useVoice } from "./VoiceHostProvider";

/**
 * Full-screen welcome overlay shown on first load.
 * A single tap/click/keypress starts the voice guide.
 *
 * iOS NOTE: speechSynthesis.speak() must be called from a `click` or
 * `touchend` handler — `pointerdown` is NOT a reliable unlock gesture on
 * iOS Safari. We use `click` (which fires for both mouse and touch taps)
 * plus a keyboard fallback. Using a single handler avoids the double-fire
 * cancel bug we previously hit.
 */
export function VoiceWelcomeOverlay() {
  const { hasStarted, start, ttsSupported } = useVoice();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firedRef = useRef(false);

  const fire = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    start();
  };

  useEffect(() => {
    if (hasStarted) return;
    buttonRef.current?.focus();

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Tab") return;
      fire();
    };

    window.addEventListener("keydown", keyHandler);
    return () => window.removeEventListener("keydown", keyHandler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStarted]);

  if (hasStarted) return null;

  return (
    <button
      type="button"
      ref={buttonRef}
      onClick={fire}
      aria-label="Tap anywhere to enter Mithara and start the voice guide"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-warm px-6 text-center cursor-pointer w-full h-full border-0"
    >
      <p className="mb-3 text-sm uppercase tracking-[0.4em] text-accent">A premium dessert house</p>
      <h1 id="welcome-title" className="font-serif text-6xl md:text-8xl text-foreground">
        Mithara
      </h1>
      <p
        id="welcome-desc"
        className="mt-6 max-w-xl text-lg md:text-xl text-muted-foreground"
      >
        {ttsSupported
          ? "Tap anywhere or press any key to begin."
          : "Your browser does not support voice output, but the site remains fully accessible by keyboard."}
      </p>

      <span
        className="mt-10 inline-flex items-center justify-center rounded-full bg-gradient-gold px-10 py-5 font-serif text-2xl text-gold-foreground shadow-elegant animate-pulse-gold"
      >
        Enter Mithara
      </span>
    </button>
  );
}
