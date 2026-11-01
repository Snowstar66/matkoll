import { cx } from "../cx";

/** The round mint avatar with the account's initial (Story 19.2); decoration, the button around it carries the name. */
export function Avatar({ initial, size = 32, className }: { initial: string; size?: 28 | 32 | 36 | 40; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-mint font-semibold text-mint-ink select-none",
        size === 40 ? "text-[19px]" : size >= 32 ? "text-[15px]" : "text-[13px]",
        className,
      )}
    >
      {initial}
    </span>
  );
}
