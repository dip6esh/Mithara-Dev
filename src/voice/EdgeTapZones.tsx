import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MAIN_ROUTES, type MainRoute } from "./scripts";
import { useVoice } from "./VoiceHostProvider";

/**
 * Edge tap zones for page navigation.
 *
 * Two narrow, real <button> elements pinned to the left and right screen
 * edges. Real buttons (not coordinate-based tap detection) so VoiceOver
 * and TalkBack work correctly: single-tap selects, double-tap activates.
 *
 * Also handles Alt+Arrow keyboard shortcuts.
 */

const DEBOUNCE_MS = 400;

function nextRoute(current: string, dir: 1 | -1): MainRoute {
  let idx = MAIN_ROUTES.findIndex((r) =>
    r === "/" ? current === "/" : current.startsWith(r),
  );
  if (idx === -1) idx = 0;
  const len = MAIN_ROUTES.length;
  const nextIdx = (idx + dir + len) % len;
  return MAIN_ROUTES[nextIdx];
}

export function EdgeTapZones() {
  const navigate = useNavigate();
  const { hasStarted, speakNow } = useVoice();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const lastNavRef = useRef(0);

  const go = (dir: 1 | -1) => {
    const now = Date.now();
    if (now - lastNavRef.current < DEBOUNCE_MS) return;
    lastNavRef.current = now;
    speakNow(dir === 1 ? "Next page" : "Going back");
    const target = nextRoute(currentPath, dir);
    navigate({ to: target });
  };

  useEffect(() => {
    if (!hasStarted) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStarted, currentPath]);

  if (!hasStarted) return null;

  const baseClass =
    "group fixed top-0 z-40 flex h-screen w-14 items-center justify-center " +
    "bg-transparent transition-colors duration-300 hover:bg-accent/10 " +
    "focus-visible:bg-accent/15 focus-visible:outline-none";

  return (
    <>
      <button
        type="button"
        aria-label="Previous page"
        onClick={() => go(-1)}
        className={`${baseClass} left-0`}
      >
        <ChevronLeft
          aria-hidden="true"
          className="h-6 w-6 text-accent opacity-0 transition-opacity duration-300 group-hover:opacity-70 group-focus-visible:opacity-90"
        />
      </button>
      <button
        type="button"
        aria-label="Next page"
        onClick={() => go(1)}
        className={`${baseClass} right-0`}
      >
        <ChevronRight
          aria-hidden="true"
          className="h-6 w-6 text-accent opacity-0 transition-opacity duration-300 group-hover:opacity-70 group-focus-visible:opacity-90"
        />
      </button>
    </>
  );
}
