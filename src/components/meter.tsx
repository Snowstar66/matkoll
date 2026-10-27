import { cx } from "./cx";

export type MeterProps = {
  /** How full, from 0 to 1; values outside are clamped, Infinity is 1 and any other non-finite value is 0. */
  value: number;
  /** `default` (8 px) in the progress row, `small` (5 px) in a dish card. */
  size?: "default" | "small";
  className?: string;
};

/** The value as a share from 0 to 1. */
export function clampMeterValue(value: number): number {
  if (value === Number.POSITIVE_INFINITY) return 1;
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Mätare (DESIGN.md, meter; UX-DR25, UX-DR26): a round hairline track with an
 * accent fill, as wide as the container. It is decoration and hidden from
 * screen readers; the text beside it ("6 av 14 i korgen", "6 av 8 hemma")
 * always says the same.
 */
export function Meter({ value, size = "default", className }: MeterProps) {
  const percent = clampMeterValue(value) * 100;
  return (
    <div
      aria-hidden="true"
      data-testid="meter"
      className={cx(
        // In forced colours (Windows contrast themes) the track gets a border and the fill the system highlight.
        "w-full overflow-hidden rounded-full bg-hairline forced-colors:border forced-colors:border-[CanvasText]",
        size === "small" ? "h-meter-small" : "h-meter",
        className,
      )}
    >
      {/* An inline width: the value is data, not a token. Fine without a CSP (v1 has none); a strict style-src would block the server-rendered style attribute. */}
      <div
        className="h-full rounded-full bg-accent forced-colors:bg-[Highlight] forced-colors:forced-color-adjust-none"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
