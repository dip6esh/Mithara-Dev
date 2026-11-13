import * as React from "react";
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
      className="fixed inset-0 z-[100] flex overflow-hidden flex-col items-center justify-center bg-gradient-warm px-6 text-center cursor-pointer w-full h-full border-0"
    >
      <div aria-hidden="true" className="bg-pattern fade-mask absolute inset-0" />
      <div aria-hidden="true" className="float absolute left-1/2 top-1/2 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/20 blur-[120px]" />
      <div className="relative flex flex-col items-center">
        <p className="hero-in text-sm tracking-[0.3em] text-accent" style={{ "--d": "100ms" } as React.CSSProperties}>A premium dessert house</p>
        <h1 id="welcome-title" className="mt-3 font-serif text-7xl font-light md:text-9xl">
          <span className="rise"><span style={{ "--d": "250ms" } as React.CSSProperties}>Mithara</span></span>
        </h1>
        <p id="welcome-desc" className="hero-in mt-5 max-w-xl text-lg text-muted-foreground md:text-xl" style={{ "--d": "600ms" } as React.CSSProperties}>
          {ttsSupported
            ? "A voice guide will read each page aloud. Tap anywhere or press any key to begin."
            : "Your browser does not support voice output, but the site remains fully accessible by keyboard."}
        </p>
        <span className="btn-gold hero-in animate-pulse-gold mt-9 inline-flex items-center rounded-full bg-gradient-gold px-10 py-5 font-serif text-2xl text-gold-foreground shadow-elegant" style={{ "--d": "850ms" } as React.CSSProperties}>
          Enter Mithara
        </span>
        <ul className="hero-in mt-10 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-muted-foreground" style={{ "--d": "1100ms" } as React.CSSProperties}>
          <li>Tap the screen edges to change page</li>
          <li>Alt + ← → on a keyboard</li>
          <li>Press M to mute</li>
        </ul>
      </div>
    </button>
  );
}
