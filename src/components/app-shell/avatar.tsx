import { cx } from "../cx";

/** A member's shade (Story 21.2b, decision 7): mint, sky, sand or lila, in the order they joined. */
export type AvatarTone = "mint" | "sky" | "sand" | "lila";

const tones: Record<AvatarTone, string> = {
  mint: "bg-mint text-mint-ink",
  sky: "bg-sky text-sky-ink",
  sand: "bg-sand text-sand-ink",
  lila: "bg-tile-lilac text-ink",
};

/** The round avatar with the person's initial (Story 19.2), in their shade; decoration, the button around it carries the name. */
export function Avatar({
  initial,
  size = 32,
  tone = "mint",
  className,
}: {
  initial: string;
  size?: 28 | 32 | 36 | 40 | 72;
  tone?: AvatarTone;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none",
        tones[tone],
        size === 72 ? "text-[32px]" : size === 40 ? "text-[19px]" : size >= 32 ? "text-[15px]" : "text-[13px]",
        className,
      )}
    >
      {initial}
    </span>
  );
}
