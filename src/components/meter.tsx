import { cx } from "./cx";

export type MeterProps = {
  /** How full, from 0 to 1; values outside are clamped, and a value that is not a number is 0. */
  value: number;
  /** `default` (8 px) in the progress row, `small` (5 px) in a dish card. */
  size?: "default" | "small";
  className?: string;
};

/** The value as a share from 0 to 1. */
export function clampMeterValue(value: number): number {
  return Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));
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
        "w-full overflow-hidden rounded-full bg-hairline",
        size === "small" ? "h-meter-small" : "h-meter",
        className,
      )}
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
    </div>
  );
}
