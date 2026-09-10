import { useVoice } from "./VoiceHostProvider";
import { Volume2, VolumeX } from "lucide-react";

/**
 * Minimal mute/unmute pill for the voice guide.
 */
export function VoiceStatusBar() {
  const { status, hasStarted, caption, toggleMute } = useVoice();

  if (!hasStarted) return null;

  const isMuted = status === "muted";
  const label = isMuted
    ? "Voice guide muted"
    : status === "speaking"
      ? "Voice guide speaking"
      : status === "unsupported"
        ? "Voice not supported"
        : "Voice guide on";

  return (
    <>
      {/* Live region for screen readers */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {caption}
      </div>

      <div className="fixed bottom-4 right-4 z-50">
        <button
          type="button"
          onClick={toggleMute}
          className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 text-sm font-medium text-card-foreground shadow-elegant backdrop-blur transition-colors hover:bg-secondary"
          aria-label={isMuted ? "Unmute voice guide (M)" : "Mute voice guide (M)"}
          title="Mute / unmute (M)"
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              status === "speaking"
                ? "bg-accent animate-pulse-gold"
                : isMuted
                  ? "bg-muted-foreground"
                  : "bg-accent/60"
            }`}
            aria-hidden="true"
          />
          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          <span className="sr-only">{label}</span>
        </button>
      </div>
    </>
  );
}
