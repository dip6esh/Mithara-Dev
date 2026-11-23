import { useEffect, useRef, useState } from "react";

/** Eases a number from its previous value to `value`. Skips straight to the end for reduced-motion users. */
export function useCountUp(value: number, duration = 900) {
  const [display, setDisplay] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || from.current === value) {
      from.current = value;
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 4); // easeOutQuart
      setDisplay(origin + (value - origin) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return display;
}

export function CountUp({
  value,
  prefix = "",
  suffix = "",
  locale = "en-IN",
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  locale?: string;
}) {
  const v = useCountUp(value);
  return (
    <span className="tabular-nums">
      {prefix}
      {Math.round(v).toLocaleString(locale)}
      {suffix}
    </span>
  );
}
