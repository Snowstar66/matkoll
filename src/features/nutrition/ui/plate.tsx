import type { PlateShares } from "../domain/kostrad";

// The plate: an inline pie with three parts in muted tokens (green, blue, sand),
// a white rim, drawn clockwise from the top. Decorative; the numbers are in text.

export const plateColors = { gronsaker: "var(--accent)", protein: "var(--sky-ink)", kolhydrater: "var(--warm)" } as const;
const order = ["gronsaker", "protein", "kolhydrater"] as const;

function point(radius: number, fraction: number): [number, number] {
  const angle = fraction * 2 * Math.PI - Math.PI / 2;
  return [50 + radius * Math.cos(angle), 50 + radius * Math.sin(angle)];
}

export function Plate({ shares, size }: { shares: PlateShares; size: number }) {
  const parts = order.map((key, index) => ({
    key,
    share: shares[key],
    start: order.slice(0, index).reduce((sum, earlier) => sum + shares[earlier], 0),
  }));
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false" className="shrink-0" data-testid="nutrition-plate">
      <circle cx="50" cy="50" r="49" fill="var(--surface)" stroke="var(--border)" strokeWidth="1" />
      {parts.map(({ key, share, start }) => {
        if (share <= 0) return null;
        if (share >= 0.999) return <circle key={key} cx="50" cy="50" r="42" fill={plateColors[key]} opacity="0.55" />;
        const [x1, y1] = point(42, start);
        const [x2, y2] = point(42, start + share);
        return (
          <path
            key={key}
            d={`M50 50 L${x1} ${y1} A42 42 0 ${share > 0.5 ? 1 : 0} 1 ${x2} ${y2} Z`}
            fill={plateColors[key]}
            opacity="0.55"
            stroke="var(--surface)"
            strokeWidth="2"
          />
        );
      })}
    </svg>
  );
}
