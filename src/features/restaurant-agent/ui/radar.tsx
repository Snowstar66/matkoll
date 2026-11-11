import type { RadiusM } from "../domain/types";
import { radiusLabels } from "./format";

// The radius as a small radar: rings around a pin, the chosen ring filled, a calm sweep line turning inside it. A picture
// of the choice (feedback, not a measure): the rings show order, not distance. No map, no service. The four buttons next
// to it are what the finger uses. With "Minska rörelse" the sweep stands still (globals.css).

const rings: { radius: RadiusM; r: number }[] = [
  { radius: 500, r: 20 },
  { radius: 1000, r: 36 },
  { radius: 2000, r: 52 },
  { radius: 5000, r: 68 },
];
const cx = 100;
const cy = 74;
const trail = (50 * Math.PI) / 180;

export function Radar({ radiusM }: { radiusM: RadiusM }) {
  const chosen = rings.find((ring) => ring.radius === radiusM) ?? rings[1]!;
  const r = chosen.r;
  // The sweep: a line from the pin to the chosen ring and a soft wedge fading out behind it.
  const wedge = `M ${cx} ${cy} L ${cx + r} ${cy} A ${r} ${r} 0 0 0 ${(cx + r * Math.cos(trail)).toFixed(2)} ${(cy - r * Math.sin(trail)).toFixed(2)} Z`;
  return (
    <div className="flex flex-col items-center gap-1" data-testid="restaurant-radar" data-radius={radiusM}>
      <svg viewBox="0 0 200 148" role="img" aria-label={`Sökområde: ungefär ${radiusLabels[radiusM]}`} className="h-auto w-full max-w-64">
        <defs>
          <linearGradient id="radar-trail" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0.5" />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={chosen.r} style={{ fill: "var(--accent)", fillOpacity: 0.16 }} />
        <path d={wedge} fill="url(#radar-trail)" className="radar-sweep" style={{ transformOrigin: `${cx}px ${cy}px` }} />
        <path d={`M ${cx - 68} ${cy} H ${cx + 68} M ${cx} ${cy - 68} V ${cy + 68}`} style={{ stroke: "var(--border)", strokeWidth: 1 }} />
        {rings.map((ring) => (
          <circle
            key={ring.radius}
            cx={cx}
            cy={cy}
            r={ring.r}
            fill="none"
            style={ring.radius === radiusM ? { stroke: "var(--accent)", strokeWidth: 2.5 } : { stroke: "var(--ink-3)", strokeOpacity: ring.radius < radiusM ? 0.7 : 0.4, strokeWidth: 1.2, strokeDasharray: ring.radius < radiusM ? undefined : "3 4" }}
          />
        ))}
        <circle cx={cx} cy={cy} r="9" style={{ fill: "var(--accent)", fillOpacity: 0.25, transformOrigin: `${cx}px ${cy}px` }} className="radar-pulse" />
        <circle cx={cx} cy={cy} r="5" style={{ fill: "var(--accent)", stroke: "var(--bg)", strokeWidth: 2 }} />
      </svg>
      <p className="text-body font-semibold text-ink">Inom cirka {radiusLabels[radiusM]}</p>
    </div>
  );
}
