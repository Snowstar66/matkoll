import { cx } from "../cx";

/** A member's shade (Story 21.2b, decision 7): mint, sky, sand or lila, in the order they joined. */
export type AvatarTone = "mint" | "sky" | "sand" | "lila";

const tones: Record<AvatarTone, string> = {
  mint: "bg-mint text-mint-ink",
  sky: "bg-sky text-sky-ink",
  sand: "bg-sand text-sand-ink",
  lila: "bg-tile-lilac text-ink",
};

/**
 * The round avatar with the person's initial (Story 19.2), in their shade; decoration, the button around it carries the name.
 * 20 px is the mark on a list row for what someone else did (Story 21.3); the row says the name.
 */
export function Avatar({
  initial,
  size = 32,
  tone = "mint",
  className,
  title,
  "data-testid": testId,
}: {
  initial: string;
  size?: 20 | 28 | 32 | 36 | 40 | 72;
  tone?: AvatarTone;
  className?: string;
  title?: string;
  "data-testid"?: string;
}) {
  return (
    <span
      aria-hidden="true"
      title={title}
      data-testid={testId}
      style={{ width: size, height: size }}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none",
        tones[tone],
        size === 72 ? "text-[32px]" : size === 40 ? "text-[19px]" : size >= 32 ? "text-[15px]" : size === 20 ? "text-[11px] leading-none" : "text-[13px]",
        className,
      )}
    >
      {initial}
    </span>
  );
}
