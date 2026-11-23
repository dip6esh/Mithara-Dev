import * as React from "react";

const prefersReduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/* -------------------------------------------------------------------------- */
/*  Smooth (inertial) page scroll                                              */
/* -------------------------------------------------------------------------- */

/** How long the page takes to catch up with the wheel (ms). Higher = longer, floatier glide. */
const SCROLL_TAU = 135;
/** Scale wheel distance. 1 = same distance the browser would normally travel. */
const WHEEL_MULTIPLIER = 1;

let smoothScrollOn = false;

/**
 * Scroll-linked effects (reveal, parallax, marquee, words) ease themselves toward the scroll
 * position. Once the page scroll itself glides, they only need a light touch of easing on top,
 * otherwise the two smoothings stack and everything feels like it is trailing behind.
 */
const tauScale = () => (smoothScrollOn ? 0.4 : 1);

const scrollEngine = (() => {
  let target = 0;
  let current = 0;
  let lastSet = 0;
  let raf = 0;
  let last = 0;
  let active = false;

  const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

  const set = (y: number) => {
    lastSet = y;
    // "instant" so the CSS `scroll-behavior: smooth` on <html> never fights our own easing.
    window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
  };

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  };

  const frame = (t: number) => {
    raf = 0;
    const dt = last ? Math.min(64, t - last) : 16;
    last = t;
    target = Math.min(target, maxScroll()); // page may have shrunk (route change, resize)
    current += (target - current) * (1 - Math.exp(-dt / SCROLL_TAU));
    if (Math.abs(target - current) < 0.35) {
      current = target;
      set(current);
      last = 0;
      return;
    }
    set(current);
    raf = requestAnimationFrame(frame);
  };

  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };

  /** True if the wheel should scroll something *inside* the page (drawer, textarea…) instead. */
  const scrollsInside = (start: EventTarget | null, dy: number) => {
    let el = start instanceof Element ? start : null;
    while (el && el !== document.body && el !== document.documentElement) {
      if (el instanceof HTMLElement) {
        if (el.hasAttribute("data-native-scroll")) return true;
        const cs = getComputedStyle(el);
        const oy = cs.overflowY;
        if ((oy === "auto" || oy === "scroll" || oy === "overlay") && el.scrollHeight > el.clientHeight + 1) {
          const atTop = el.scrollTop <= 0;
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
          if ((dy < 0 && !atTop) || (dy > 0 && !atBottom)) return true;
          if (cs.overscrollBehaviorY !== "auto") return true; // contained: don't chain to the page
        }
      }
      el = el.parentElement;
    }
    return false;
  };

  const locked = () =>
    document.body.hasAttribute("data-scroll-locked") ||
    getComputedStyle(document.body).overflowY === "hidden" ||
    getComputedStyle(document.documentElement).overflowY === "hidden";

  const onWheel = (e: WheelEvent) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey) return; // pinch-zoom / browser zoom
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // horizontal gesture
    if (!e.deltaY || locked()) return;

    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16; // lines → px
    else if (e.deltaMode === 2) dy *= window.innerHeight; // pages → px

    if (scrollsInside(e.target, dy)) return;

    // Start from where the page really is whenever we were idle (covers keyboard, scrollbar
    // drags, anchor jumps and route changes that happened since the last wheel event).
    if (!raf) {
      current = window.scrollY;
      target = current;
    }
    const next = Math.min(maxScroll(), Math.max(0, target + dy * WHEEL_MULTIPLIER));
    if (next === target) return; // already at the top / bottom: let the browser handle it
    e.preventDefault();
    target = next;
    kick();
  };

  // Anything that moves the page without us (scrollbar drag, keys, native anchors) → re-sync.
  const onScroll = () => {
    if (Math.abs(window.scrollY - lastSet) > 2) {
      stop();
      current = target = lastSet = window.scrollY;
    }
  };

  const onResize = () => {
    target = Math.min(target, maxScroll());
    if (!raf) current = target = window.scrollY;
  };

  return {
    start() {
      if (active) return;
      active = true;
      current = target = lastSet = window.scrollY;
      window.addEventListener("wheel", onWheel, { passive: false });
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onResize);
    },
    end() {
      if (!active) return;
      active = false;
      stop();
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    },
    /** Glide to a position with the same easing as wheel scrolling. */
    to(y: number) {
      if (!active) return false;
      if (!raf) current = window.scrollY;
      target = Math.min(maxScroll(), Math.max(0, y));
      kick();
      return true;
    },
  };
})();

/** Scroll to a Y position: eased like the wheel when smooth scroll is on, native smooth otherwise. */
export function smoothScrollTo(y: number) {
  if (!scrollEngine.to(y)) window.scrollTo({ top: y, behavior: prefersReduced() ? "auto" : "smooth" });
}

/**
 * Mount once. Gives mouse-wheel / trackpad scrolling a smooth glide that eases to a stop instead
 * of halting instantly. Touch devices keep their native momentum scrolling, and users who prefer
 * reduced motion keep the browser's normal scrolling. Add `data-native-scroll` to any element that
 * should always scroll natively.
 */
export function SmoothScroll() {
  React.useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (fine.matches && !reduce.matches) {
        scrollEngine.start();
        smoothScrollOn = true;
      } else {
        scrollEngine.end();
        smoothScrollOn = false;
      }
    };
    sync();
    fine.addEventListener("change", sync);
    reduce.addEventListener("change", sync);
    return () => {
      fine.removeEventListener("change", sync);
      reduce.removeEventListener("change", sync);
      scrollEngine.end();
      smoothScrollOn = false;
    };
  }, []);
  // Flags <html data-scrolling="true"> while the page is moving, so decorative looping animations
  // (hero slideshow, spinning badge) can pause and leave the frame budget to the scroll itself.
  React.useEffect(() => {
    const root = document.documentElement;
    let t = 0;
    const onScroll = () => {
      if (root.dataset.scrolling !== "true") root.dataset.scrolling = "true";
      window.clearTimeout(t);
      t = window.setTimeout(() => root.removeAttribute("data-scrolling"), 160);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(t);
      root.removeAttribute("data-scrolling");
    };
  }, []);
  return null;
}

/**
 * Eases a value toward a moving target instead of jumping to it. `compute` returns the target
 * (read from the current scroll position), `apply` writes the eased value. The loop only runs
 * while the value is still catching up, so it costs nothing when the page is idle.
 */
function makeSmoother(
  compute: () => number,
  apply: (v: number) => void,
  { tau = 120, eps = 0.001 }: { tau?: number; eps?: number } = {},
) {
  let cur = compute();
  apply(cur);
  let raf = 0;
  let last = 0;
  const frame = (t: number) => {
    raf = 0;
    const dt = last ? Math.min(64, t - last) : 16;
    last = t;
    const target = compute();
    cur += (target - cur) * (1 - Math.exp(-dt / (tau * tauScale())));
    if (Math.abs(target - cur) <= eps) {
      cur = target;
      apply(cur);
      last = 0;
      return;
    }
    apply(cur);
    raf = requestAnimationFrame(frame);
  };
  return {
    kick() {
      if (!raf) raf = requestAnimationFrame(frame);
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf);
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Reveal: scroll-linked fade / slide, shared by every <Reveal> on the page    */
/* -------------------------------------------------------------------------- */

type RevealItem = { el: HTMLElement; delayPx: number; cur: number; written: number; done: boolean };

const revealItems = new Set<RevealItem>();
let revealRaf = 0;
let revealLast = 0;
let revealBound = false;

function revealFrame(t: number) {
  revealRaf = 0;
  const dt = revealLast ? Math.min(64, t - revealLast) : 16;
  revealLast = t;
  const vh = window.innerHeight;
  const sy = window.scrollY;
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
  const startLine = vh * 0.96; // an element starts appearing as its top edge enters the screen
  const span = Math.min(vh * 0.34, 320); // and finishes after travelling this far up the screen
  const k = 1 - Math.exp(-dt / (150 * tauScale())); // ~150ms catch-up (lighter once the page scroll itself glides)

  const items = Array.from(revealItems);
  const tops = items.map((it) => it.el.getBoundingClientRect().top); // read everything first…
  let busy = false;

  items.forEach((it, i) => {
    const top = tops[i];
    const line = startLine - it.delayPx;
    // Blocks near the bottom of the page can never scroll very far up the screen, so shrink their
    // travel distance until they can still reach fully visible at the end of the page.
    const minTop = top + sy - maxScroll;
    const avail = Math.min(span, Math.max(24, line - minTop - 4));
    const target = clamp01((line - top) / avail);

    it.cur += (target - it.cur) * k;
    if (Math.abs(target - it.cur) < 0.002) it.cur = target;
    else busy = true;

    // …then write.
    const eased = it.cur * it.cur * (3 - 2 * it.cur); // smoothstep
    if (Math.abs(eased - it.written) > 0.0005) {
      it.written = eased;
      it.el.style.setProperty("--rp", eased.toFixed(4));
    }
    const done = it.cur >= 0.999;
    if (done !== it.done) {
      it.done = done;
      it.el.dataset.done = done ? "true" : "false";
    }
  });

  if (busy) revealRaf = requestAnimationFrame(revealFrame);
  else revealLast = 0;
}

function kickReveal() {
  if (!revealRaf) revealRaf = requestAnimationFrame(revealFrame);
}

function registerReveal(it: RevealItem) {
  revealItems.add(it);
  if (!revealBound) {
    revealBound = true;
    window.addEventListener("scroll", kickReveal, { passive: true });
    window.addEventListener("resize", kickReveal);
  }
  kickReveal();
}

function unregisterReveal(it: RevealItem) {
  revealItems.delete(it);
  if (revealItems.size === 0 && revealBound) {
    revealBound = false;
    window.removeEventListener("scroll", kickReveal);
    window.removeEventListener("resize", kickReveal);
    if (revealRaf) cancelAnimationFrame(revealRaf);
    revealRaf = 0;
    revealLast = 0;
  }
}

/**
 * Reveal on scroll. The block fades and slides in gradually as it travels up the screen, and eases
 * back out the same way if you scroll up. Nothing switches on or off at a fixed line, so there is
 * no flicker. `delay` (ms) staggers neighbours by starting them slightly later.
 */
export function Reveal({
  children,
  variant = "up",
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  variant?: "up" | "scale" | "left" | "right" | "clip" | "from-left" | "from-right";
  delay?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReduced()) {
      el.style.setProperty("--rp", "1");
      el.dataset.done = "true";
      return;
    }
    const item: RevealItem = { el, delayPx: delay * 0.15, cur: 0, written: -1, done: false };
    registerReveal(item);
    return () => unregisterReveal(item);
  }, [delay]);
  return (
    <div ref={ref} data-reveal={variant} data-done="false" className={className}>
      {children}
    </div>
  );
}

/**
 * Moves children slightly slower than the page scroll. Driven by a CSS scroll timeline (see
 * `.parallax-inner` in styles.css), so the browser updates it on the compositor in lock-step with
 * the scroll. No JS runs per frame, so it can't lag behind or fight the page scroll. Browsers
 * without scroll timelines simply show the content still.
 */
export function Parallax({
  speed = 0.1,
  className = "",
  children,
}: {
  speed?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <div className="parallax-inner" style={{ "--parallax": speed } as React.CSSProperties}>
        {children}
      </div>
    </div>
  );
}

/** 3D tilt + moving gold glare on mouse hover. Inert on touch / reduced motion. */
export function Tilt({
  children,
  className = "",
  max = 6,
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || prefersReduced() || !ref.current) return;
    // Keep the card still while the pointer is over a small nested control, so it doesn't drift away.
    // (Anchors are excluded on purpose: a card-wide link is the tilt surface itself, not a control.)
    if ((e.target as HTMLElement).closest("button, input, textarea, select")) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const s = ref.current.style;
    s.setProperty("--ry", `${((x - 0.5) * max * 2).toFixed(2)}deg`);
    s.setProperty("--rx", `${((0.5 - y) * max * 2).toFixed(2)}deg`);
    s.setProperty("--mx", `${(x * 100).toFixed(0)}%`);
    s.setProperty("--my", `${(y * 100).toFixed(0)}%`);
  };
  const reset = () => {
    const s = ref.current?.style;
    s?.setProperty("--rx", "0deg");
    s?.setProperty("--ry", "0deg");
  };
  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={reset}
      className={`tilt ${className}`}
    >
      {children}
      <span aria-hidden="true" className="tilt-glare" />
    </div>
  );
}

/** Words fade from dim to bright, one after another, as the block scrolls through the viewport. */
export function ScrollWords({ text, className = "" }: { text: string; className?: string }) {
  const ref = React.useRef<HTMLParagraphElement>(null);
  const words = text.split(" ");
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const spans = Array.from(el.querySelectorAll<HTMLElement>("[data-w]"));
    if (prefersReduced()) {
      spans.forEach((s) => (s.style.opacity = "1"));
      return;
    }
    const n = spans.length;
    const soft = Math.max(1, n * 0.12); // each word fades over a few words' width, so it ripples
    const sm = makeSmoother(
      () => {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight;
        return clamp01((vh * 0.85 - r.top) / (r.height + vh * 0.35));
      },
      (p) => {
        const head = p * 1.15 * n;
        spans.forEach((s, i) => {
          s.style.opacity = (0.22 + 0.78 * clamp01((head - i) / soft)).toFixed(3);
        });
      },
      { tau: 140, eps: 0.0005 },
    );
    window.addEventListener("scroll", sm.kick, { passive: true });
    window.addEventListener("resize", sm.kick);
    return () => {
      window.removeEventListener("scroll", sm.kick);
      window.removeEventListener("resize", sm.kick);
      sm.destroy();
    };
  }, []);
  return (
    <p ref={ref} className={className}>
      {words.map((w, i) => (
        <span key={i} data-w className="scroll-word">
          {w}{" "}
        </span>
      ))}
    </p>
  );
}

/** Counts up to `to` once, the first time it is visible. It stays put afterwards (no resetting). */
export function CountUp({ to, duration = 2200 }: { to: number; duration?: number }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReduced() || typeof IntersectionObserver === "undefined") {
      setN(to);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (t: number) => {
          const k = Math.min(1, (t - t0) / duration);
          setN(Math.round(to * (1 - Math.pow(1 - k, 3))));
          if (k < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [to, duration]);
  return <span ref={ref}>{n}</span>;
}

/** Thin gold reading-progress bar pinned to the top of the page. */
export function ScrollProgress() {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const h = document.documentElement.scrollHeight - window.innerHeight;
      const p = h > 0 ? window.scrollY / h : 0;
      if (ref.current) ref.current.style.transform = `scaleX(${p})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]">
      <div ref={ref} className="h-full origin-left scale-x-0 bg-gradient-gold" />
    </div>
  );
}

/** Vertical timeline: a gold line fills as the block scrolls through the viewport. */
export function ScrollLine({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const fill = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      if (!ref.current || !fill.current) return;
      const r = ref.current.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (window.innerHeight * 0.6 - r.top) / r.height));
      fill.current.style.transform = `scaleY(${prefersReduced() ? 1 : p})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div ref={ref} className={`relative ${className}`}>
      <div aria-hidden="true" className="absolute bottom-4 left-6 top-4 w-px bg-border">
        <div ref={fill} className="h-full origin-top scale-y-0 bg-gradient-gold" />
      </div>
      {children}
    </div>
  );
}

/**
 * Scroll-scrubbed container. Sets --p (0 → 1) as the block scrolls through its
 * own height, so any child can animate with calc(var(--p) * …). Fully reversible.
 */
export function Scrub({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      const p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
      el.style.setProperty("--p", p.toFixed(4));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return (
    <div ref={ref} className={`scrub ${className}`} style={{ "--p": 0 } as React.CSSProperties}>
      {children}
    </div>
  );
}

/** Marquee driven by scroll position: slides one way scrolling down, the other way scrolling up. */
export function ScrollMarquee({ children, reverse = false, className = "" }: { children: React.ReactNode; reverse?: boolean; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (prefersReduced()) return;
    const sm = makeSmoother(
      () => window.scrollY * 0.6,
      (v) => {
        const el = ref.current;
        if (!el) return;
        const half = el.scrollWidth / 2;
        if (!half) return;
        const m = ((v % half) + half) % half;
        el.style.transform = `translate3d(${(reverse ? m - half : -m).toFixed(1)}px,0,0)`;
      },
      { tau: 110, eps: 0.05 },
    );
    window.addEventListener("scroll", sm.kick, { passive: true });
    return () => {
      window.removeEventListener("scroll", sm.kick);
      sm.destroy();
    };
  }, [reverse]);
  return (
    <div ref={ref} className={`flex w-max will-change-transform ${className}`}>
      {children}
    </div>
  );
}
