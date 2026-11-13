/** Decorative honey edge: gold drips that slowly stretch. Sits at the top of the section below it. */
const DRIPS: [number, number, number][] = [
  [80, 26, 0], [230, 40, 0.8], [400, 22, 0.3], [560, 46, 1.2], [720, 28, 0.5], [890, 38, 1.6], [1060, 24, 0.9],
];

export function HoneyDrip() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1200 60"
      preserveAspectRatio="xMidYMin slice"
      className="pointer-events-none absolute inset-x-0 top-0 z-10 h-10 w-full sm:h-12"
    >
      <defs>
        <linearGradient id="honey" x1="0" x2="1">
          <stop offset="0" stopColor="#c48b3f" />
          <stop offset="0.5" stopColor="#ebb976" />
          <stop offset="1" stopColor="#d39c54" />
        </linearGradient>
      </defs>
      <rect width="1200" height="10" fill="url(#honey)" />
      {DRIPS.map(([x, h, d]) => (
        <g key={x} className="drip" style={{ animationDelay: `${d}s` }}>
          <rect x={x - 7} y="6" width="14" height={h} rx="7" fill="url(#honey)" />
          <circle cx={x} cy={h + 8} r="9" fill="url(#honey)" />
        </g>
      ))}
    </svg>
  );
}
