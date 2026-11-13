import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import kunafaCheese from "../assets/hero/kunafa-cheese-pull.jpg";
import baklavaPistachio from "../assets/hero/baklava-pistachio-box.jpg";
import kunafaBounty from "../assets/hero/kunafa-bounty-cut.jpg";
import baklavaNutella from "../assets/hero/baklava-nutella-box.jpg";

const SLIDE_MS = 6000;

const SLIDES = [
  {
    to: "/kunafa" as const,
    title: "Cream cheese kunafa",
    tagline: "Crisp kataifi, a soft cheese pull.",
    image: kunafaCheese,
    position: "50% 50%",
    mobilePosition: "62% 50%",
    alt: "A slice of Mithara cream cheese kunafa being lifted from the plate, with melted white cheese stretching out from golden crisp kataifi under a heap of crushed pistachios.",
  },
  {
    to: "/baklava" as const,
    title: "Pistachio baklava",
    tagline: "Twelve pieces in a starlit box.",
    image: baklavaPistachio,
    position: "58% 50%",
    mobilePosition: "100% 50%",
    alt: "An open navy Mithara gift box with a gold star on the lid, beside a gold tray of twelve golden pistachio baklava squares, with lanterns and red velvet behind.",
  },
  {
    to: "/kunafa" as const,
    title: "Bounty kunafa",
    tagline: "Coconut, milk chocolate, golden strands.",
    image: kunafaBounty,
    position: "42% 50%",
    mobilePosition: "50% 50%",
    alt: "A hand slicing a round of kunafa topped with coconut-filled chocolate bars and a chocolate drizzle, on a speckled plate with dates, pistachios and a Mithara box nearby.",
  },
  {
    to: "/baklava" as const,
    title: "Nutella nest baklava",
    tagline: "Hazelnut chocolate over kataifi nests.",
    image: baklavaNutella,
    position: "58% 50%",
    mobilePosition: "100% 50%",
    alt: "An open navy Mithara box holding twelve kataifi nests swirled with Nutella, set on red velvet between brass lanterns.",
  },
];

/**
 * Hero image slideshow. Each new photo opens like a lens from the centre of the arch while
 * slowly settling in. Progress is a CSS animation on the active dot; when it ends we advance,
 * so pausing (hover, focus, or the pause button) freezes the timer exactly where it is.
 */
export function HeroSlideshow() {
  const [{ cur, prev }, setState] = React.useState({ cur: 0, prev: -1 });
  const [userPaused, setUserPaused] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [reduced, setReduced] = React.useState(false);
  const touchX = React.useRef<number | null>(null);

  const running = !userPaused && !hovered && !focused;

  const goTo = React.useCallback(
    (i: number) => setState((s) => (i === s.cur ? s : { cur: i, prev: s.cur })),
    [],
  );
  const next = React.useCallback(
    () => setState((s) => ({ cur: (s.cur + 1) % SLIDES.length, prev: s.cur })),
    [],
  );

  React.useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // With reduced motion the progress animation is off, so a plain timer drives a gentle crossfade.
  React.useEffect(() => {
    if (!reduced || !running) return;
    const id = window.setTimeout(next, SLIDE_MS + 1000);
    return () => window.clearTimeout(id);
  }, [reduced, running, cur, next]);

  const onTouchEnd = (x: number) => {
    if (touchX.current === null) return;
    const dx = x - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 40) return;
    goTo(dx < 0 ? (cur + 1) % SLIDES.length : (cur - 1 + SLIDES.length) % SLIDES.length);
  };

  const slide = SLIDES[cur];

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label="Mithara desserts"
      className="hshow-root absolute inset-0"
      data-running={running}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => onTouchEnd(e.changedTouches[0].clientX)}
      style={{ "--hshow-ms": `${SLIDE_MS}ms`, touchAction: "pan-y" } as React.CSSProperties}
    >
      {SLIDES.map((s, i) => (
        <div
          key={s.image}
          className="hshow-slide"
          data-state={i === cur ? "active" : i === prev ? "prev" : "idle"}
          aria-hidden={i !== cur}
        >
          <img
            src={s.image}
            alt={s.alt}
            width={1200}
            height={1200}
            decoding="async"
            fetchPriority={i === 0 ? "high" : "auto"}
            className="hshow-img h-full w-full object-cover"
            style={{ "--pos": s.position, "--pos-m": s.mobilePosition } as React.CSSProperties}
          />
        </div>
      ))}

      {/* Dark base so the caption always reads, whatever photo is showing */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-3/5 bg-gradient-to-t from-[#1c1733]/95 via-[#1c1733]/55 to-transparent md:h-2/5 md:from-[#1c1733]/90 md:via-[#1c1733]/40" />

      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 p-4 pb-5 text-center sm:p-6 sm:pb-7 md:items-end md:text-right">
        <Link
          key={cur}
          to={slide.to}
          aria-label={`Explore ${slide.to === "/kunafa" ? "kunafa" : "baklava"}: ${slide.title}`}
          className="hshow-caption group max-w-[80%] rounded-md md:max-w-[62%] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <span className="block font-serif text-xl font-light leading-tight text-gold-light sm:text-2xl">
            {slide.title}
            <ArrowUpRight className="ml-1 inline h-4 w-4 -translate-y-0.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-1 sm:h-5 sm:w-5" />
          </span>
          <span className="mt-1 hidden text-sm text-foreground/80 sm:block">{slide.tagline}</span>
        </Link>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            {SLIDES.map((s, i) => (
              <button
                key={s.title}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Show ${s.title}`}
                aria-current={i === cur}
                className="hshow-dot group flex h-6 w-6 items-center sm:w-8"
              >
                <span className="relative block h-[3px] w-full overflow-hidden rounded-full bg-foreground/30 transition-colors group-hover:bg-foreground/50">
                  {i === cur && (
                    <span
                      key={`fill-${cur}`}
                      className="hshow-fill absolute inset-0 origin-left rounded-full bg-gradient-gold"
                      onAnimationEnd={next}
                    />
                  )}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setUserPaused((p) => !p)}
            aria-label={userPaused ? "Play slideshow" : "Pause slideshow"}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-foreground/30 text-foreground/80 transition-colors hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {userPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          </button>
        </div>
      </div>

      <p className="sr-only" aria-live={running ? "off" : "polite"}>
        {`Showing ${slide.title}, ${cur + 1} of ${SLIDES.length}`}
      </p>
    </div>
  );
}
