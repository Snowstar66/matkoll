import { cx } from "../cx";

/**
 * A destination's coloured emoji as in the sketch (Story 14.4): greyscale and
 * a little dimmed when the destination is not the current one, full colour when it is.
 */
export function NavEmoji({ emoji, current, size }: { emoji: string; current: boolean; size: number }) {
  return (
    <div
      aria-hidden="true"
      style={{ fontSize: size }}
      className={cx("block leading-none transition-[filter,opacity]", current ? "" : "opacity-70 grayscale")}
    >
      {emoji}
    </div>
  );
}
