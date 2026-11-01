import { cx } from "@/components/cx";

// The drawings of Tyck till (hjalp-valkomst.html): the star of a rating and the
// two-tone check of the thanks. Decoration; the text beside them carries the meaning.

const starPath = "M12 3.2l2.6 5.3 5.8.9-4.2 4.1 1 5.8L12 16.6l-5.2 2.7 1-5.8-4.2-4.1 5.8-.9z";

/** A star: filled in `--warm` when on, a grey outline when off, so the choice shows without colour too. */
export function StarIcon({ on, size, strokeWidth = 1.6, className }: { on: boolean; size: number; strokeWidth?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      className={cx("shrink-0", on ? "fill-warm stroke-warm" : "fill-none stroke-ink-3", className)}
    >
      <path d={starPath} />
    </svg>
  );
}

/** Five small stars for a rating of `stars` (the inbox and the thanks). */
export function StarsRow({ stars, size = 14, gap = "gap-px" }: { stars: number; size?: number; gap?: string }) {
  return (
    <span aria-hidden="true" className={cx("inline-flex align-[-2px]", gap)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <StarIcon key={star} on={star <= stars} size={size} strokeWidth={2} />
      ))}
    </span>
  );
}

/** The thanks: a check in a circle, green with the tick in `--warm`, on the illustration tile. */
export function ThanksTile() {
  return (
    <span aria-hidden="true" className="flex size-[76px] shrink-0 items-center justify-center rounded-[22px] bg-illus-bg">
      <svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" focusable="false" className="text-accent">
        <circle cx="12" cy="12" r="8.5" />
        <path className="stroke-warm" d="M8.5 12.3l2.3 2.3 4.7-4.9" />
      </svg>
    </span>
  );
}
