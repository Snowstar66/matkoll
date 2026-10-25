"use client";

import { cx } from "./cx";
import { HeartIcon } from "./icons";

export type HeartToggleProps = {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  /** Screen readers hear "Favorit, på/av" through the label and `aria-pressed`. */
  label?: string;
  className?: string;
};

/**
 * Hjärta: one tap toggles favourite and does not navigate. Place it beside the row's
 * link, never inside it (a button in a link is invalid HTML): for a whole-row link,
 * stretch the link over the row and lift the heart above it with `relative z-10`.
 */
export function HeartToggle({ pressed, onPressedChange, label = "Favorit", className }: HeartToggleProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cx(
        "flex size-tap shrink-0 items-center justify-center rounded-full",
        pressed ? "text-accent" : "text-ink-3",
        className,
      )}
    >
      <HeartIcon size={22} filled={pressed} />
    </button>
  );
}
